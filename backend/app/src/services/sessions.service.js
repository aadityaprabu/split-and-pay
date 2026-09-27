const crypto = require("crypto");
const { pool } = require("../config/db");
const { isAdminEmail } = require("../config/auth");
const { Session } = require("../constants/constants");

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const withAdminFlag = (user) => ({ ...user, is_admin: isAdminEmail(user.email) });

// Admin only manages access; taking part in expenses needs an allowed-list entry, which the admin
// can give themselves too. Selected alongside the user as is_participant.
const IS_PARTICIPANT = "EXISTS (SELECT 1 FROM allowed_emails WHERE allowed_emails.email = lower(users.email))";

/**
 * Creates or refreshes the user row for a Google account and opens a new session.
 * @returns {{ user: object, token: string }} token goes in the cookie, never in the database
 */
async function signInGoogleUser({ googleSub, email, name, pictureUrl }) {
  const { rows } = await pool.query(
    `INSERT INTO users (google_sub, email, name, picture_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_sub) DO UPDATE
       SET email = EXCLUDED.email, name = EXCLUDED.name, picture_url = EXCLUDED.picture_url
     RETURNING id, name, email, picture_url, ${IS_PARTICIPANT} AS is_participant`,
    [googleSub, email, name, pictureUrl]
  );
  const user = withAdminFlag(rows[0]);

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + Session.DURATION_MS);
  await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
    hashToken(token),
    user.id,
    expiresAt,
  ]);

  // Opportunistic cleanup, so the table doesn't grow forever
  await pool.query("DELETE FROM sessions WHERE expires_at < now()");

  return { user, token };
}

/** @returns the signed-in user for a session token, or null if it's unknown/expired */
async function findUserBySessionToken(token) {
  const { rows } = await pool.query(
    `SELECT users.id, users.name, users.email, users.picture_url, ${IS_PARTICIPANT} AS is_participant
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > now()`,
    [hashToken(token)]
  );
  return rows[0] ? withAdminFlag(rows[0]) : null;
}

async function deleteSession(token) {
  await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

module.exports = { signInGoogleUser, findUserBySessionToken, deleteSession };
