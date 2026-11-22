const { pool, withTransaction } = require("../config/db");
const { Currency, CurrencyDefault, Expense, SplitType, Validation } = require("../constants/constants");
const HttpError = require("../models/httpError.model");
const { computeShares } = require("./splits.service");
const { assertGroupCovers } = require("./groups.service");
const { findParticipantIds } = require("./users.service");

// People only see the expenses they're on: ones they paid for or have a share in, plus ones they added
// (so whoever logged it can still find, edit or delete it). Group or not, nobody else sees it.
// $1 is the signed-in user.
const VISIBLE_TO_USER = `(
  expenses.paid_by = $1
  OR expenses.created_by = $1
  OR EXISTS (SELECT 1 FROM expense_splits mine WHERE mine.expense_id = expenses.id AND mine.user_id = $1)
)`;

// True while an open part payment sits between the payer and someone who still owes on this expense.
// That payment was made against the balance this expense is part of, so changing or removing the
// expense would leave the payment counting against amounts that no longer exist.
const HAS_OPEN_PART_PAYMENT = `EXISTS (
  SELECT 1 FROM expense_splits owed
  JOIN settlements part_payment ON part_payment.is_partial AND part_payment.closed_by IS NULL
    AND part_payment.currency = expenses.currency
    AND ((part_payment.from_user = owed.user_id AND part_payment.to_user = expenses.paid_by)
      OR (part_payment.from_user = expenses.paid_by AND part_payment.to_user = owed.user_id))
  WHERE owed.expense_id = expenses.id AND owed.user_id <> expenses.paid_by AND owed.settled_at IS NULL
)`;

const EXPENSE_COLUMNS = `
  expenses.id, expenses.description, expenses.amount_minor, expenses.currency, expenses.split_type,
  expenses.spent_on, expenses.notes, expenses.created_at, expenses.updated_at, expenses.created_by,
  CASE WHEN expenses.group_id IS NULL THEN NULL
       ELSE (SELECT json_build_object('id', groups.id, 'name', groups.name) FROM groups WHERE groups.id = expenses.group_id)
  END AS "group",
  json_build_object('id', payer.id, 'name', payer.name, 'picture_url', payer.picture_url) AS paid_by,
  json_agg(
    json_build_object(
      'user_id', split_user.id, 'name', split_user.name, 'picture_url', split_user.picture_url,
      'amount_minor', expense_splits.amount_minor, 'basis_points', expense_splits.basis_points,
      'settled_at', expense_splits.settled_at, 'settlement_id', expense_splits.settlement_id
    ) ORDER BY expense_splits.amount_minor DESC, split_user.name
  ) AS splits,
  (SELECT COUNT(*)::int FROM expense_comments WHERE expense_comments.expense_id = expenses.id) AS comment_count,
  (SELECT COUNT(*)::int FROM expense_attachments WHERE expense_attachments.expense_id = expenses.id)
    AS attachment_count,
  ${HAS_OPEN_PART_PAYMENT} AS has_part_payment`;

const EXPENSE_JOINS = `
  FROM expenses
  JOIN users payer ON payer.id = expenses.paid_by
  JOIN expense_splits ON expense_splits.expense_id = expenses.id
  JOIN users split_user ON split_user.id = expense_splits.user_id`;

/**
 * Newest first, each with its shares, who paid, and whether each share has been settled.
 * groupId narrows it to one group; "none" lists only expenses outside every group.
 */
async function listExpenses(userId, groupId = null) {
  if (groupId !== null && groupId !== "none" && !Validation.UUID_PATTERN.test(groupId)) {
    throw new HttpError(400, "That group doesn't exist");
  }
  const { rows } = await pool.query(
    `SELECT ${EXPENSE_COLUMNS}
     ${EXPENSE_JOINS}
     WHERE expenses.deleted_at IS NULL AND ${VISIBLE_TO_USER}
       AND ($2::text IS NULL
         OR ($2 = 'none' AND expenses.group_id IS NULL)
         OR expenses.group_id::text = lower($2))
     GROUP BY expenses.id, payer.id
     ORDER BY expenses.spent_on DESC, expenses.created_at DESC
     LIMIT $3`,
    [userId, groupId, Expense.LIST_LIMIT]
  );
  return rows;
}

/** One expense with its comments and receipt files (their details, not the bytes) */
async function getExpense(expenseId, userId) {
  if (!Validation.UUID_PATTERN.test(expenseId)) throw new HttpError(404, "That expense doesn't exist");
  const { rows } = await pool.query(
    `SELECT ${EXPENSE_COLUMNS},
       (SELECT COALESCE(json_agg(json_build_object(
                 'id', expense_comments.id, 'body', expense_comments.body, 'created_at', expense_comments.created_at,
                 'user', json_build_object('id', author.id, 'name', author.name, 'picture_url', author.picture_url)
               ) ORDER BY expense_comments.created_at), '[]')
        FROM expense_comments JOIN users author ON author.id = expense_comments.user_id
        WHERE expense_comments.expense_id = expenses.id) AS comments,
       (SELECT COALESCE(json_agg(json_build_object(
                 'id', expense_attachments.id, 'file_name', expense_attachments.file_name,
                 'content_type', expense_attachments.content_type, 'byte_size', expense_attachments.byte_size,
                 'uploaded_by', expense_attachments.uploaded_by, 'created_at', expense_attachments.created_at
               ) ORDER BY expense_attachments.created_at), '[]')
        FROM expense_attachments WHERE expense_attachments.expense_id = expenses.id) AS attachments
     ${EXPENSE_JOINS}
     WHERE expenses.id = $2 AND expenses.deleted_at IS NULL AND ${VISIBLE_TO_USER}
     GROUP BY expenses.id, payer.id`,
    [userId, expenseId]
  );
  if (rows.length === 0) throw new HttpError(404, "That expense doesn't exist");
  return rows[0];
}

/** Throws a 404 unless the expense exists and the user can see it. Used before comments and receipts. */
async function assertCanSeeExpense(client, expenseId, userId) {
  if (!Validation.UUID_PATTERN.test(expenseId)) throw new HttpError(404, "That expense doesn't exist");
  const { rows } = await client.query(
    `SELECT expenses.created_by, expenses.paid_by FROM expenses
     WHERE expenses.id = $2 AND expenses.deleted_at IS NULL AND ${VISIBLE_TO_USER}`,
    [userId, expenseId]
  );
  if (rows.length === 0) throw new HttpError(404, "That expense doesn't exist");
  return rows[0];
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

  const notes = String(body?.notes ?? "").trim() || null;
  if (notes !== null && notes.length > Expense.NOTES_MAX_LENGTH) {
    throw new HttpError(400, `Keep the notes under ${Expense.NOTES_MAX_LENGTH} characters`);
  }

  const groupId = body?.group_id ?? null;
  if (groupId !== null && (typeof groupId !== "string" || !Validation.UUID_PATTERN.test(groupId))) {
    throw new HttpError(400, "That group doesn't exist");
  }

  return {
    description,
    amountMinor,
    currency,
    paidBy: paidBy.toLowerCase(),
    spentOn,
    splitType,
    participants,
    notes,
    groupId: groupId?.toLowerCase() ?? null,
  };
}

// Checks everyone on the expense can be on it: still allowed in, and in its group if it has one
async function assertCanBeOnExpense(client, input, userId) {
  const everyoneInvolved = [input.paidBy, ...input.participants.map((participant) => participant.userId)];
  const participantIds = await findParticipantIds(client, everyoneInvolved);
  if (!everyoneInvolved.every((id) => participantIds.has(id))) {
    throw new HttpError(400, "Someone on this expense isn't on the allowed list anymore");
  }
  if (input.groupId) await assertGroupCovers(client, input.groupId, userId, everyoneInvolved);
}

// The payer's own share is settled from the start: nobody owes it to anyone
async function insertShares(client, expenseId, paidBy, shares) {
  await client.query(
    `INSERT INTO expense_splits (expense_id, user_id, amount_minor, basis_points, settled_at)
     SELECT $1, share.user_id, share.amount_minor, share.basis_points,
            CASE WHEN share.user_id = $2 THEN now() END
     FROM unnest($3::uuid[], $4::bigint[], $5::int[]) AS share (user_id, amount_minor, basis_points)`,
    [
      expenseId,
      paidBy,
      shares.map((share) => share.userId),
      shares.map((share) => share.amountMinor),
      shares.map((share) => share.basisPoints),
    ]
  );
}

async function createExpense(body, createdByUserId) {
  const input = parseExpenseInput(body);
  const shares = computeShares(input);

  return withTransaction(async (client) => {
    await assertCanBeOnExpense(client, input, createdByUserId);

    const { rows } = await client.query(
      `INSERT INTO expenses (description, amount_minor, currency, split_type, paid_by, spent_on, created_by, notes, group_id)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8, $9)
       RETURNING id`,
      [
        input.description,
        input.amountMinor,
        input.currency,
        input.splitType,
        input.paidBy,
        input.spentOn,
        createdByUserId,
        input.notes,
        input.groupId,
      ]
    );
    const expenseId = rows[0].id;
    await insertShares(client, expenseId, input.paidBy, shares);
    return expenseId;
  });
}

/**
 * Locks an expense for a change by whoever added or paid for it. Refuses once a share has been settled
 * by a settle-up: changing it then would silently change what that payment covered.
 */
async function lockExpenseForChange(client, expenseId, userId, action) {
  if (!Validation.UUID_PATTERN.test(expenseId)) {
    throw new HttpError(404, "That expense doesn't exist");
  }
  const { rows } = await client.query(
    "SELECT created_by, paid_by FROM expenses WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
    [expenseId]
  );
  const expense = rows[0];
  if (!expense) {
    throw new HttpError(404, "That expense doesn't exist");
  }
  if (expense.created_by !== userId && expense.paid_by !== userId) {
    throw new HttpError(403, `Only the person who added or paid for this expense can ${action} it`);
  }
  // A separate statement, so it sees any settle-up that committed while we waited for the lock
  const { rowCount: settledShareCount } = await client.query(
    "SELECT 1 FROM expense_splits WHERE expense_id = $1 AND settlement_id IS NOT NULL LIMIT 1",
    [expenseId]
  );
  if (settledShareCount > 0) {
    throw new HttpError(409, `Someone has already settled part of this expense, so it can't be ${action === "edit" ? "edited" : "deleted"}`);
  }
  const { rows: partPaymentRows } = await client.query(
    `SELECT ${HAS_OPEN_PART_PAYMENT} AS has_part_payment FROM expenses WHERE expenses.id = $1`,
    [expenseId]
  );
  if (partPaymentRows[0].has_part_payment) {
    throw new HttpError(
      409,
      `A part payment has been made towards this expense, so it can't be ${action === "edit" ? "edited" : "deleted"} until you settle up in full`
    );
  }
}

/** Replaces everything about an expense, its shares included. Same body as createExpense. */
async function updateExpense(expenseId, body, userId) {
  const input = parseExpenseInput(body);
  const shares = computeShares(input);

  await withTransaction(async (client) => {
    await lockExpenseForChange(client, expenseId, userId, "edit");
    await assertCanBeOnExpense(client, input, userId);
    await client.query(
      `UPDATE expenses SET description = $2, amount_minor = $3, currency = $4, split_type = $5, paid_by = $6,
              spent_on = COALESCE($7::date, spent_on), notes = $8, group_id = $9, updated_at = now()
       WHERE id = $1`,
      [
        expenseId,
        input.description,
        input.amountMinor,
        input.currency,
        input.splitType,
        input.paidBy,
        input.spentOn,
        input.notes,
        input.groupId,
      ]
    );
    await client.query("DELETE FROM expense_splits WHERE expense_id = $1", [expenseId]);
    await insertShares(client, expenseId, input.paidBy, shares);
  });
}

/**
 * Soft-deletes an expense. Only whoever added or paid for it can, and only while nobody has
 * settled a share of it or made a part payment towards it: after that, deleting it would silently
 * change what a payment covered.
 */
async function deleteExpense(expenseId, userId) {
  await withTransaction(async (client) => {
    await lockExpenseForChange(client, expenseId, userId, "delete");
    await client.query("UPDATE expenses SET deleted_at = now() WHERE id = $1", [expenseId]);
  });
}

module.exports = {
  listExpenses,
  getExpense,
  assertCanSeeExpense,
  parseExpenseInput,
  createExpense,
  updateExpense,
  deleteExpense,
};
