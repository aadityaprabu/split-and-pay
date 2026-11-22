const { pool, withTransaction } = require("../config/db");
const { Attachment, Validation } = require("../constants/constants");
const HttpError = require("../models/httpError.model");
const { assertCanSeeExpense } = require("./expenses.service");

/**
 * The file's real type, from its first bytes. The browser's Content-Type is never trusted: the file is
 * served back with this type, so a renamed HTML or SVG file can't run as a page on our origin.
 */
function detectContentType(buffer) {
  const startsWith = (bytes, offset = 0) => bytes.every((byte, index) => buffer[offset + index] === byte);
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  return null;
}

// Keeps the name readable but harmless in a Content-Disposition header and on screen
function cleanFileName(rawName) {
  let name;
  try {
    name = decodeURIComponent(String(rawName ?? ""));
  } catch {
    name = String(rawName ?? "");
  }
  name = name
    .replace(/[\\/]/g, "_")
    .replace(/[\p{Cc}"]/gu, "")
    .trim()
    .slice(0, Attachment.FILE_NAME_MAX_LENGTH);
  return name || "receipt";
}

/** Stores one receipt file. buffer is the raw request body. */
async function addAttachment(expenseId, buffer, rawFileName, userId) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new HttpError(400, "Choose a file to upload");
  if (buffer.length > Attachment.MAX_BYTES) {
    throw new HttpError(413, `Files can be up to ${Attachment.MAX_BYTES / 1024 / 1024} MB`);
  }
  const contentType = detectContentType(buffer);
  if (!contentType) throw new HttpError(400, "Upload a photo (JPEG, PNG or WebP) or a PDF");
  const fileName = cleanFileName(rawFileName);

  return withTransaction(async (client) => {
    await assertCanSeeExpense(client, expenseId, userId);
    // Locks the expense row so two uploads at once can't both slip under the limit
    await client.query("SELECT 1 FROM expenses WHERE id = $1 FOR UPDATE", [expenseId]);
    const { rows: countRows } = await client.query(
      "SELECT COUNT(*)::int AS count FROM expense_attachments WHERE expense_id = $1",
      [expenseId]
    );
    if (countRows[0].count >= Attachment.MAX_PER_EXPENSE) {
      throw new HttpError(409, `An expense can have up to ${Attachment.MAX_PER_EXPENSE} files`);
    }
    const { rows } = await client.query(
      `INSERT INTO expense_attachments (expense_id, uploaded_by, file_name, content_type, byte_size, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, file_name, content_type, byte_size, uploaded_by, created_at`,
      [expenseId, userId, fileName, contentType, buffer.length, buffer]
    );
    return rows[0];
  });
}

/** The file itself, for anyone who can see its expense */
async function getAttachment(expenseId, attachmentId, userId) {
  if (!Validation.UUID_PATTERN.test(attachmentId)) throw new HttpError(404, "That file doesn't exist");
  await assertCanSeeExpense(pool, expenseId, userId);
  const { rows } = await pool.query(
    "SELECT file_name, content_type, data FROM expense_attachments WHERE id = $1 AND expense_id = $2",
    [attachmentId, expenseId]
  );
  if (rows.length === 0) throw new HttpError(404, "That file doesn't exist");
  return rows[0];
}

/** Whoever uploaded the file, added the expense or paid for it can remove the file */
async function deleteAttachment(expenseId, attachmentId, userId) {
  if (!Validation.UUID_PATTERN.test(attachmentId)) throw new HttpError(404, "That file doesn't exist");
  const expense = await assertCanSeeExpense(pool, expenseId, userId);
  const { rows } = await pool.query(
    "SELECT uploaded_by FROM expense_attachments WHERE id = $1 AND expense_id = $2",
    [attachmentId, expenseId]
  );
  if (rows.length === 0) throw new HttpError(404, "That file doesn't exist");
  if (![rows[0].uploaded_by, expense.created_by, expense.paid_by].includes(userId)) {
    throw new HttpError(403, "Only whoever uploaded it, or added or paid for the expense, can remove this file");
  }
  await pool.query("DELETE FROM expense_attachments WHERE id = $1", [attachmentId]);
}

module.exports = { detectContentType, cleanFileName, addAttachment, getAttachment, deleteAttachment };
