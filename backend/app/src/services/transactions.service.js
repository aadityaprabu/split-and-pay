const { pool } = require("../config/db");
const { Transaction, Validation } = require("../constants/constants");
const HttpError = require("../models/httpError.model");
const { toCsv, minorToDecimal } = require("../utils/csv.util");

// "2026-02-31" matches the pattern but isn't a day; a Date rolls it over to March, so the round trip differs
function isRealDate(value) {
  if (!Validation.DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// A query-string value, or null when it's missing or blank. Repeated params (?q=a&q=b) are refused.
function readText(query, name) {
  const value = query?.[name];
  if (value === undefined) return null;
  if (typeof value !== "string") throw new HttpError(400, `Send ${name} once`);
  return value.trim() || null;
}

function readCount(query, name, { fallback, min, max }) {
  const text = readText(query, name);
  if (text === null) return fallback;
  const number = Number(text);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new HttpError(400, `${name} has to be a whole number from ${min} to ${max}`);
  }
  return number;
}

/**
 * Validates the filters shared by the list and the monthly summary:
 * from / to (YYYY-MM-DD, inclusive), q (part of the title) and person (someone else on the expense).
 */
function parseFilters(query) {
  const from = readText(query, "from");
  const to = readText(query, "to");
  if (from !== null && !isRealDate(from)) throw new HttpError(400, "The start date isn't valid");
  if (to !== null && !isRealDate(to)) throw new HttpError(400, "The end date isn't valid");
  if (from !== null && to !== null && from > to) throw new HttpError(400, "The start date is after the end date");

  const search = readText(query, "q");
  if (search !== null && search.length > Transaction.SEARCH_MAX_LENGTH) {
    throw new HttpError(400, `Keep the search under ${Transaction.SEARCH_MAX_LENGTH} characters`);
  }

  const person = readText(query, "person");
  if (person !== null && !Validation.UUID_PATTERN.test(person)) throw new HttpError(400, "Choose a valid person");

  return { from, to, search, personId: person?.toLowerCase() ?? null };
}

/** Adds page (offset, limit) to the filters */
function parseListQuery(query) {
  return {
    ...parseFilters(query),
    offset: readCount(query, "offset", { fallback: 0, min: 0, max: Number.MAX_SAFE_INTEGER }),
    limit: readCount(query, "limit", { fallback: Transaction.PAGE_SIZE, min: 1, max: Transaction.MAX_PAGE_SIZE }),
  };
}

// % and _ are wildcards in ILIKE; a search for "50%" means the text "50%"
const escapeLike = (text) => text.replace(/[\\%_]/g, (character) => `\\${character}`);

// Someone is "on" an expense when they paid for it or have a share of it
const isOnExpense = (param) => `(expenses.paid_by = ${param}
  OR EXISTS (SELECT 1 FROM expense_splits on_it WHERE on_it.expense_id = expenses.id AND on_it.user_id = ${param}))`;

// $1 is the signed-in user, $2-$5 the filters (each skipped when null)
const MY_FILTERED_EXPENSES = `
  expenses.deleted_at IS NULL
  AND ${isOnExpense("$1")}
  AND ($2::date IS NULL OR expenses.spent_on >= $2::date)
  AND ($3::date IS NULL OR expenses.spent_on <= $3::date)
  AND ($4::text IS NULL OR expenses.description ILIKE '%' || $4::text || '%')
  AND ($5::uuid IS NULL OR ${isOnExpense("$5::uuid")})`;

const filterParams = (userId, filters) => [
  userId,
  filters.from,
  filters.to,
  filters.search === null ? null : escapeLike(filters.search),
  filters.personId,
];

/**
 * One page of the user's expenses, newest first, with what the user paid and their own share.
 * has_more says whether another page follows.
 */
async function listTransactions(userId, query) {
  const filters = parseListQuery(query);
  // One extra row tells us whether there's another page, without a separate COUNT
  const { rows } = await pool.query(
    `SELECT expenses.id, expenses.description, expenses.amount_minor, expenses.currency, expenses.spent_on,
            expenses.created_at,
            json_build_object('id', payer.id, 'name', payer.name, 'picture_url', payer.picture_url) AS paid_by,
            COALESCE(my_share.amount_minor, 0) AS my_share_minor,
            (SELECT json_agg(
                      json_build_object('id', users.id, 'name', users.name, 'picture_url', users.picture_url)
                      ORDER BY users.name)
             FROM expense_splits
             JOIN users ON users.id = expense_splits.user_id
             WHERE expense_splits.expense_id = expenses.id) AS participants
     FROM expenses
     JOIN users payer ON payer.id = expenses.paid_by
     LEFT JOIN expense_splits my_share ON my_share.expense_id = expenses.id AND my_share.user_id = $1
     WHERE ${MY_FILTERED_EXPENSES}
     ORDER BY expenses.spent_on DESC, expenses.created_at DESC, expenses.id DESC
     LIMIT $6 OFFSET $7`,
    [...filterParams(userId, filters), filters.limit + 1, filters.offset]
  );
  return { items: rows.slice(0, filters.limit), has_more: rows.length > filters.limit };
}

/**
 * Per month and currency, newest month first: how many expenses, how much the user paid out,
 * and how much of it was their own share. Uses the same filters as the list.
 */
async function summarizeTransactions(userId, query) {
  const filters = parseFilters(query);
  const { rows } = await pool.query(
    `SELECT to_char(expenses.spent_on, 'YYYY-MM') AS month, expenses.currency,
            COUNT(*)::int AS transaction_count,
            COALESCE(SUM(expenses.amount_minor) FILTER (WHERE expenses.paid_by = $1), 0)::bigint AS paid_minor,
            COALESCE(SUM(my_share.amount_minor), 0)::bigint AS share_minor
     FROM expenses
     LEFT JOIN expense_splits my_share ON my_share.expense_id = expenses.id AND my_share.user_id = $1
     WHERE ${MY_FILTERED_EXPENSES}
     GROUP BY month, expenses.currency
     ORDER BY month DESC, expenses.currency`,
    filterParams(userId, filters)
  );
  return rows;
}

const EXPORT_HEADER = [
  "Date",
  "Title",
  "Group",
  "Paid by",
  "People",
  "Currency",
  "Total",
  "You paid",
  "Your share",
  "Notes",
];

/**
 * Every expense matching the filters (no paging), newest first, as CSV text.
 * Amounts are plain decimals so a spreadsheet can add them up; each row has its own currency.
 */
async function exportTransactions(userId, query) {
  const filters = parseFilters(query);
  const { rows } = await pool.query(
    `SELECT expenses.spent_on, expenses.description, expenses.currency, expenses.amount_minor, expenses.notes,
            expenses.paid_by = $1 AS i_paid,
            payer.name AS payer_name,
            groups.name AS group_name,
            COALESCE(my_share.amount_minor, 0) AS my_share_minor,
            (SELECT string_agg(users.name, '; ' ORDER BY users.name)
             FROM expense_splits
             JOIN users ON users.id = expense_splits.user_id
             WHERE expense_splits.expense_id = expenses.id) AS people
     FROM expenses
     JOIN users payer ON payer.id = expenses.paid_by
     LEFT JOIN groups ON groups.id = expenses.group_id
     LEFT JOIN expense_splits my_share ON my_share.expense_id = expenses.id AND my_share.user_id = $1
     WHERE ${MY_FILTERED_EXPENSES}
     ORDER BY expenses.spent_on DESC, expenses.created_at DESC, expenses.id DESC
     LIMIT $6`,
    [...filterParams(userId, filters), Transaction.EXPORT_MAX_ROWS]
  );
  return toCsv(
    EXPORT_HEADER,
    rows.map((row) => [
      row.spent_on,
      row.description,
      row.group_name,
      row.i_paid ? "You" : row.payer_name,
      row.people,
      row.currency,
      minorToDecimal(row.amount_minor),
      minorToDecimal(row.i_paid ? row.amount_minor : 0),
      minorToDecimal(row.my_share_minor),
      row.notes,
    ])
  );
}

module.exports = {
  parseFilters,
  parseListQuery,
  escapeLike,
  listTransactions,
  summarizeTransactions,
  exportTransactions,
};
