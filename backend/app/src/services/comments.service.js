const { pool, withTransaction } = require("../config/db");
const { Comment, Validation } = require("../constants/constants");
const HttpError = require("../models/httpError.model");
const { assertCanSeeExpense } = require("./expenses.service");

/** Anyone who can see an expense can comment on it, settled or not */
async function addComment(expenseId, body, userId) {
  const text = String(body?.body ?? "").trim();
  if (text === "") throw new HttpError(400, "Write something first");
  if (text.length > Comment.BODY_MAX_LENGTH) {
    throw new HttpError(400, `Keep the comment under ${Comment.BODY_MAX_LENGTH} characters`);
  }

  return withTransaction(async (client) => {
    await assertCanSeeExpense(client, expenseId, userId);
    const { rows } = await client.query(
      "INSERT INTO expense_comments (expense_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at",
      [expenseId, userId, text]
    );
    return rows[0];
  });
}

/** People can only delete their own comments */
async function deleteComment(expenseId, commentId, userId) {
  if (!Validation.UUID_PATTERN.test(expenseId) || !Validation.UUID_PATTERN.test(commentId)) {
    throw new HttpError(404, "That comment doesn't exist");
  }
  const { rows } = await pool.query(
    "SELECT user_id FROM expense_comments WHERE id = $1 AND expense_id = $2",
    [commentId, expenseId]
  );
  if (rows.length === 0) throw new HttpError(404, "That comment doesn't exist");
  if (rows[0].user_id !== userId) throw new HttpError(403, "You can only delete your own comments");
  await pool.query("DELETE FROM expense_comments WHERE id = $1", [commentId]);
}

module.exports = { addComment, deleteComment };
