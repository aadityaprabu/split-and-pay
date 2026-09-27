const { pool } = require("../config/db");

// Participants are the users on the allowed list. The admin only manages access and isn't one unless
// they add their own email. Removed roommates keep their past expenses but can't be added to new ones.
const PARTICIPANT_CONDITION = "EXISTS (SELECT 1 FROM allowed_emails WHERE allowed_emails.email = lower(users.email))";

/** Everyone who can be added to an expense (people only show up once they've signed in) */
async function listParticipants() {
  const { rows } = await pool.query(
    `SELECT id, name, email, picture_url FROM users WHERE ${PARTICIPANT_CONDITION} ORDER BY name`
  );
  return rows;
}

/** The subset of userIds that are participants (runs on the given client, e.g. inside a transaction) */
async function findParticipantIds(client, userIds) {
  const { rows } = await client.query(
    `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND ${PARTICIPANT_CONDITION}`,
    [userIds]
  );
  return new Set(rows.map((row) => row.id));
}

module.exports = { listParticipants, findParticipantIds };
