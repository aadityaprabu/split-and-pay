const { pool, withTransaction } = require("../config/db");
const { Currency, CurrencyDefault, Expense, SplitType, Validation } = require("../constants/constants");
const HttpError = require("../models/httpError.model");
const { computeShares } = require("./splits.service");
const { findParticipantIds } = require("./users.service");

/** Newest first, each with its shares, who paid, and whether each share has been settled */
async function listExpenses() {
  const { rows } = await pool.query(
    `SELECT expenses.id, expenses.description, expenses.amount_minor, expenses.currency, expenses.split_type,
            expenses.spent_on,
            expenses.created_at, expenses.created_by,
            json_build_object('id', payer.id, 'name', payer.name, 'picture_url', payer.picture_url) AS paid_by,
            json_agg(
              json_build_object(
                'user_id', split_user.id, 'name', split_user.name, 'picture_url', split_user.picture_url,
                'amount_minor', expense_splits.amount_minor, 'basis_points', expense_splits.basis_points,
                'settled_at', expense_splits.settled_at, 'settlement_id', expense_splits.settlement_id
              ) ORDER BY expense_splits.amount_minor DESC, split_user.name
            ) AS splits
     FROM expenses
     JOIN users payer ON payer.id = expenses.paid_by
     JOIN expense_splits ON expense_splits.expense_id = expenses.id
     JOIN users split_user ON split_user.id = expense_splits.user_id
     WHERE expenses.deleted_at IS NULL
     GROUP BY expenses.id, payer.id
     ORDER BY expenses.spent_on DESC, expenses.created_at DESC
     LIMIT $1`,
    [Expense.LIST_LIMIT]
  );
  return rows;
}

// "2026-02-31" matches the pattern but isn't a day; a Date rolls it over to March, so the round trip differs
function isRealDate(value) {
  if (typeof value !== "string" || !Validation.DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Validates the request body and turns it into the shape computeShares and the insert need */
function parseExpenseInput(body) {
  const description = String(body?.description ?? "").trim();
  if (description === "") {
    throw new HttpError(400, "Say what the expense was for");
  }
  if (description.length > Expense.DESCRIPTION_MAX_LENGTH) {
    throw new HttpError(400, `Keep the description under ${Expense.DESCRIPTION_MAX_LENGTH} characters`);
  }

  const amountMinor = body?.amount_minor;
  if (!Number.isInteger(amountMinor) || amountMinor <= 0 || amountMinor > Expense.MAX_AMOUNT_MINOR) {
    throw new HttpError(400, "Enter an amount more than 0");
  }

  const currency = body?.currency ?? CurrencyDefault.CODE;
  if (!Object.values(Currency).includes(currency)) {
    throw new HttpError(400, `Choose a currency: ${Object.values(Currency).join(" or ")}`);
  }

  const paidBy = body?.paid_by;
  if (typeof paidBy !== "string" || !Validation.UUID_PATTERN.test(paidBy)) {
    throw new HttpError(400, "Choose who paid");
  }

  const spentOn = body?.spent_on ?? null;
  if (spentOn !== null && !isRealDate(spentOn)) {
    throw new HttpError(400, "That date isn't valid");
  }

  const splitType = body?.split_type;
  if (!Object.values(SplitType).includes(splitType)) {
    throw new HttpError(400, "Choose how to split: equally, by percentage or by exact amounts");
  }

  const rawParticipants = Array.isArray(body?.participants) ? body.participants : [];
  if (rawParticipants.length === 0) {
    throw new HttpError(400, "Add at least one participant");
  }
  const participants = rawParticipants.map((participant) => {
    if (typeof participant?.user_id !== "string" || !Validation.UUID_PATTERN.test(participant.user_id)) {
      throw new HttpError(400, "One of the participants isn't valid");
    }
    return {
      userId: participant.user_id.toLowerCase(),
      basisPoints: participant.basis_points,
      amountMinor: participant.amount_minor,
    };
  });
  if (new Set(participants.map((participant) => participant.userId)).size !== participants.length) {
    throw new HttpError(400, "Someone is in the list twice");
  }

  return { description, amountMinor, currency, paidBy: paidBy.toLowerCase(), spentOn, splitType, participants };
}

async function createExpense(body, createdByUserId) {
  const input = parseExpenseInput(body);
  const shares = computeShares(input);

  return withTransaction(async (client) => {
    const everyoneInvolved = [input.paidBy, ...input.participants.map((participant) => participant.userId)];
    const participantIds = await findParticipantIds(client, everyoneInvolved);
    if (!everyoneInvolved.every((userId) => participantIds.has(userId))) {
      throw new HttpError(400, "Someone on this expense isn't on the allowed list anymore");
    }

    const { rows } = await client.query(
      `INSERT INTO expenses (description, amount_minor, currency, split_type, paid_by, spent_on, created_by)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7)
       RETURNING id`,
      [
        input.description,
        input.amountMinor,
        input.currency,
        input.splitType,
        input.paidBy,
        input.spentOn,
        createdByUserId,
      ]
    );
    const expenseId = rows[0].id;

    // The payer's own share is settled from the start: nobody owes it to anyone
    await client.query(
      `INSERT INTO expense_splits (expense_id, user_id, amount_minor, basis_points, settled_at)
       SELECT $1, share.user_id, share.amount_minor, share.basis_points,
              CASE WHEN share.user_id = $2 THEN now() END
       FROM unnest($3::uuid[], $4::bigint[], $5::int[]) AS share (user_id, amount_minor, basis_points)`,
      [
        expenseId,
        input.paidBy,
        shares.map((share) => share.userId),
        shares.map((share) => share.amountMinor),
        shares.map((share) => share.basisPoints),
      ]
    );
    return expenseId;
  });
}

/**
 * Soft-deletes an expense. Only whoever added or paid for it can, and only while nobody has
 * settled a share of it: after that, deleting it would silently change what a settlement covered.
 */
async function deleteExpense(expenseId, userId) {
  if (!Validation.UUID_PATTERN.test(expenseId)) {
    throw new HttpError(404, "That expense doesn't exist");
  }

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      "SELECT created_by, paid_by FROM expenses WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
      [expenseId]
    );
    const expense = rows[0];
    if (!expense) {
      throw new HttpError(404, "That expense doesn't exist");
    }
    if (expense.created_by !== userId && expense.paid_by !== userId) {
      throw new HttpError(403, "Only the person who added or paid for this expense can delete it");
    }
    // A separate statement, so it sees any settle-up that committed while we waited for the lock
    const { rowCount: settledShareCount } = await client.query(
      "SELECT 1 FROM expense_splits WHERE expense_id = $1 AND settlement_id IS NOT NULL LIMIT 1",
      [expenseId]
    );
    if (settledShareCount > 0) {
      throw new HttpError(409, "Someone has already settled part of this expense, so it can't be deleted");
    }
    await client.query("UPDATE expenses SET deleted_at = now() WHERE id = $1", [expenseId]);
  });
}

module.exports = { listExpenses, parseExpenseInput, createExpense, deleteExpense };
