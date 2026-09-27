const { pool, withTransaction } = require("../config/db");
const { isAdminEmail } = require("../config/auth");
const { Validation } = require("../constants/constants");
const HttpError = require("../models/httpError.model");

async function isEmailAllowed(email) {
  if (isAdminEmail(email)) return true;
  const { rowCount } = await pool.query("SELECT 1 FROM allowed_emails WHERE email = $1", [email.toLowerCase()]);
  return rowCount > 0;
}

/** Allowed emails with the matching user's name/photo once they've signed in at least once */
async function listAllowedEmails() {
  const { rows } = await pool.query(
    `SELECT allowed_emails.email, allowed_emails.created_at, users.name, users.picture_url
     FROM allowed_emails LEFT JOIN users ON lower(users.email) = allowed_emails.email
     ORDER BY allowed_emails.created_at`
  );
  return rows;
}

async function addAllowedEmail(rawEmail, addedByUserId) {
  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (!Validation.EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, "That doesn't look like an email address");
  }

  const { rowCount } = await pool.query(
    "INSERT INTO allowed_emails (email, added_by) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING",
    [email, addedByUserId]
  );
  if (rowCount === 0) {
    throw new HttpError(409, `${email} is already allowed`);
  }
  return email;
}

/**
 * Removes the email and signs that person out everywhere, in one transaction.
 * The admin can always sign in, so removing their own email only takes them out of splitting.
 */
async function removeAllowedEmail(rawEmail) {
  const email = String(rawEmail ?? "").trim().toLowerCase();

  await withTransaction(async (client) => {
    const { rowCount } = await client.query("DELETE FROM allowed_emails WHERE email = $1", [email]);
    if (rowCount === 0) {
      throw new HttpError(404, `${email} isn't on the list`);
    }
    if (isAdminEmail(email)) return;
    await client.query(
      "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE lower(email) = $1)",
      [email]
    );
  });
}

module.exports = { isEmailAllowed, listAllowedEmails, addAllowedEmail, removeAllowedEmail };
