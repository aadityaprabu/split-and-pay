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

/**
 * One row per person and currency the user has open shares in.
 * net_minor > 0: they owe the user; < 0: the user owes them; 0: it evens out, but can still be settled.
 */
async function listBalances(userId) {
  const { rows } = await pool.query(
    `SELECT users.id AS user_id, users.name, users.picture_url, open_shares.currency,
            SUM(open_shares.signed_amount_minor)::bigint AS net_minor,
            COUNT(DISTINCT open_shares.expense_id)::int AS open_expense_count
     FROM (${OPEN_SHARES_WITH_OTHERS}) AS open_shares
     JOIN users ON users.id = open_shares.other_user_id
     GROUP BY users.id, open_shares.currency
     ORDER BY abs(SUM(open_shares.signed_amount_minor)) DESC, users.name`,
    [userId]
  );
  return rows;
}

/**
 * Settles everything between the user and otherUserId in one currency: records one payment for the
 * net amount and marks every open share between them in that currency as settled by it.
 *
 * expectedNetMinor is the balance the user saw (from listBalances). If an expense was added or
 * deleted since, the net differs and nothing is recorded, so nobody settles an amount they didn't see.
 */
async function settleUp(userId, otherUserId, currency, expectedNetMinor) {
  if (typeof otherUserId !== "string" || !Validation.UUID_PATTERN.test(otherUserId)) {
    throw new HttpError(400, "Choose who you're settling up with");
  }
  if (!Object.values(Currency).includes(currency)) {
    throw new HttpError(400, "Choose which currency you're settling");
  }
  if (!Number.isInteger(expectedNetMinor)) {
    throw new HttpError(400, "Missing the amount you're settling");
  }
  const otherId = otherUserId.toLowerCase();
  if (otherId === userId) {
    throw new HttpError(400, "You can't settle up with yourself");
  }

  return withTransaction(async (client) => {
    // Locks the open shares and their expenses: a concurrent settle-up of the same shares waits, then
    // re-checks settled_at and finds nothing left; a concurrent delete waits until this commits.
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
    if (openShares.length === 0) {
      throw new HttpError(409, `You're already settled up with them in ${currency}`);
    }

    const netMinor = openShares.reduce((total, share) => total + share.signed_amount_minor, 0);
    if (netMinor !== expectedNetMinor) {
      throw new HttpError(409, "The balance changed since you loaded it. Check the new amount and try again");
    }

    // Whoever owes pays; when it evens out exactly, record it as the user paying 0
    const [fromUser, toUser] = netMinor > 0 ? [otherId, userId] : [userId, otherId];
    const { rows } = await client.query(
      `INSERT INTO settlements (from_user, to_user, amount_minor, currency, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, from_user, to_user, amount_minor, currency, created_at`,
      [fromUser, toUser, Math.abs(netMinor), currency, userId]
    );
    const settlement = rows[0];

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
    return { ...settlement, settled_share_count: openShares.length };
  });
}

/** Payments the user made or received, newest first */
async function listSettlements(userId) {
  const { rows } = await pool.query(
    `SELECT settlements.id, settlements.amount_minor, settlements.currency, settlements.created_at,
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
