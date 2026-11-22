const { pool, withTransaction } = require("../config/db");
const { Currency, Settlement, Validation } = require("../constants/constants");
const HttpError = require("../models/httpError.model");

// Open shares between one user ($1) and everyone else, from $1's point of view:
// +amount when the other person owes $1 (they're on an expense $1 paid for), -amount when $1 owes them.
const OPEN_SHARES_WITH_OTHERS = `
  SELECT expense_splits.expense_id, expense_splits.user_id, expenses.currency,
         CASE WHEN expenses.paid_by = $1 THEN expense_splits.user_id ELSE expenses.paid_by END AS other_user_id,
         CASE WHEN expenses.paid_by = $1 THEN expense_splits.amount_minor ELSE -expense_splits.amount_minor END
           AS signed_amount_minor
  FROM expense_splits
  JOIN expenses ON expenses.id = expense_splits.expense_id
  WHERE expenses.deleted_at IS NULL
    AND expense_splits.settled_at IS NULL
    AND (expenses.paid_by = $1 OR expense_splits.user_id = $1)`;

// Partial payments not yet closed by a full settle-up, from $1's point of view, in the same shape:
// paying someone raises what they owe $1 (or lowers what $1 owes them), so it counts as +amount.
const OPEN_PARTIAL_PAYMENTS_WITH_OTHERS = `
  SELECT NULL::uuid AS expense_id, NULL::uuid AS user_id, settlements.currency,
         CASE WHEN settlements.from_user = $1 THEN settlements.to_user ELSE settlements.from_user END AS other_user_id,
         CASE WHEN settlements.from_user = $1 THEN settlements.amount_minor ELSE -settlements.amount_minor END
           AS signed_amount_minor
  FROM settlements
  WHERE settlements.is_partial AND settlements.closed_by IS NULL
    AND (settlements.from_user = $1 OR settlements.to_user = $1)`;

/**
 * One row per person and currency the user has open shares or partial payments in.
 * net_minor > 0: they owe the user; < 0: the user owes them; 0: it evens out, but can still be settled.
 * partial_paid_minor is how much has already been paid towards it in part payments.
 */
async function listBalances(userId) {
  const { rows } = await pool.query(
    `SELECT users.id AS user_id, users.name, users.picture_url, open_items.currency,
            SUM(open_items.signed_amount_minor)::bigint AS net_minor,
            COUNT(DISTINCT open_items.expense_id)::int AS open_expense_count,
            COALESCE(SUM(abs(open_items.signed_amount_minor)) FILTER (WHERE open_items.expense_id IS NULL), 0)::bigint
              AS partial_paid_minor
     FROM (${OPEN_SHARES_WITH_OTHERS} UNION ALL ${OPEN_PARTIAL_PAYMENTS_WITH_OTHERS}) AS open_items
     JOIN users ON users.id = open_items.other_user_id
     GROUP BY users.id, open_items.currency
     ORDER BY abs(SUM(open_items.signed_amount_minor)) DESC, users.name`,
    [userId]
  );
  return rows;
}

/**
 * Locks everything still open between the two people in one currency and works out the net.
 * A concurrent settle-up of the same rows waits, then re-checks and finds them closed; a concurrent
 * expense delete or edit waits until this commits.
 */
async function lockOpenBalance(client, userId, otherId, currency) {
  const { rows: openShares } = await client.query(
    `SELECT expense_splits.expense_id, expense_splits.user_id,
            CASE WHEN expenses.paid_by = $1 THEN expense_splits.amount_minor ELSE -expense_splits.amount_minor END
              AS signed_amount_minor
     FROM expense_splits
     JOIN expenses ON expenses.id = expense_splits.expense_id
     WHERE expenses.deleted_at IS NULL
       AND expenses.currency = $3
       AND expense_splits.settled_at IS NULL
       AND ((expenses.paid_by = $1 AND expense_splits.user_id = $2)
         OR (expenses.paid_by = $2 AND expense_splits.user_id = $1))
     FOR UPDATE OF expense_splits
     FOR SHARE OF expenses`,
    [userId, otherId, currency]
  );
  const { rows: openPartials } = await client.query(
    `SELECT id, CASE WHEN from_user = $1 THEN amount_minor ELSE -amount_minor END AS signed_amount_minor
     FROM settlements
     WHERE is_partial AND closed_by IS NULL AND currency = $3
       AND ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))
     FOR UPDATE`,
    [userId, otherId, currency]
  );
  const netMinor = [...openShares, ...openPartials].reduce((total, item) => total + item.signed_amount_minor, 0);
  return { openShares, openPartials, netMinor };
}

/**
 * Records a payment between the user and otherUserId in one currency.
 *
 * Without amountMinor (or with the whole balance) it settles everything: one payment for what's left,
 * every open share between them in that currency marked settled by it, and their part payments closed.
 * With a smaller amountMinor it records a part payment from whoever owes; shares stay open.
 *
 * expectedNetMinor is the balance the user saw (from listBalances). If an expense or payment was added
 * or removed since, the net differs and nothing is recorded, so nobody pays an amount they didn't see.
 */
async function settleUp(userId, otherUserId, currency, expectedNetMinor, amountMinor = null) {
  if (typeof otherUserId !== "string" || !Validation.UUID_PATTERN.test(otherUserId)) {
    throw new HttpError(400, "Choose who you're settling up with");
  }
  if (!Object.values(Currency).includes(currency)) {
    throw new HttpError(400, "Choose which currency you're settling");
  }
  if (!Number.isInteger(expectedNetMinor)) {
    throw new HttpError(400, "Missing the amount you're settling");
  }
  if (amountMinor !== null && (!Number.isInteger(amountMinor) || amountMinor <= 0)) {
    throw new HttpError(400, "Enter an amount more than 0");
  }
  const otherId = otherUserId.toLowerCase();
  if (otherId === userId) {
    throw new HttpError(400, "You can't settle up with yourself");
  }

  return withTransaction(async (client) => {
    const { openShares, openPartials, netMinor } = await lockOpenBalance(client, userId, otherId, currency);
    if (openShares.length === 0 && openPartials.length === 0) {
      throw new HttpError(409, `You're already settled up with them in ${currency}`);
    }
    if (netMinor !== expectedNetMinor) {
      throw new HttpError(409, "The balance changed since you loaded it. Check the new amount and try again");
    }

    // Whoever owes pays; when it evens out exactly, record it as the user paying 0
    const [fromUser, toUser] = netMinor > 0 ? [otherId, userId] : [userId, otherId];
    const isPartial = amountMinor !== null && amountMinor !== Math.abs(netMinor);
    if (isPartial && amountMinor > Math.abs(netMinor)) {
      throw new HttpError(400, "That's more than what's owed. Settle up in full instead");
    }

    const { rows } = await client.query(
      `INSERT INTO settlements (from_user, to_user, amount_minor, currency, created_by, is_partial)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, from_user, to_user, amount_minor, currency, is_partial, created_at`,
      [fromUser, toUser, isPartial ? amountMinor : Math.abs(netMinor), currency, userId, isPartial]
    );
    const settlement = rows[0];
    if (isPartial) return { ...settlement, settled_share_count: 0 };

    await client.query(
      `UPDATE expense_splits SET settled_at = $1, settlement_id = $2
       FROM unnest($3::uuid[], $4::uuid[]) AS share (expense_id, user_id)
       WHERE expense_splits.expense_id = share.expense_id AND expense_splits.user_id = share.user_id`,
      [
        settlement.created_at,
        settlement.id,
        openShares.map((share) => share.expense_id),
        openShares.map((share) => share.user_id),
      ]
    );
    await client.query("UPDATE settlements SET closed_by = $1 WHERE id = ANY($2::uuid[])", [
      settlement.id,
      openPartials.map((partial) => partial.id),
    ]);
    return { ...settlement, settled_share_count: openShares.length };
  });
}

/** Payments the user made or received, newest first */
async function listSettlements(userId) {
  const { rows } = await pool.query(
    `SELECT settlements.id, settlements.amount_minor, settlements.currency, settlements.created_at,
            settlements.is_partial,
            json_build_object('id', payer.id, 'name', payer.name) AS from_user,
            json_build_object('id', receiver.id, 'name', receiver.name) AS to_user,
            (SELECT COUNT(DISTINCT expense_id)::int FROM expense_splits
             WHERE settlement_id = settlements.id) AS expense_count
     FROM settlements
     JOIN users payer ON payer.id = settlements.from_user
     JOIN users receiver ON receiver.id = settlements.to_user
     WHERE settlements.from_user = $1 OR settlements.to_user = $1
     ORDER BY settlements.created_at DESC
     LIMIT $2`,
    [userId, Settlement.HISTORY_LIMIT]
  );
  return rows;
}

module.exports = { listBalances, settleUp, listSettlements };
