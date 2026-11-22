const expensesService = require("../services/expenses.service");
const commentsService = require("../services/comments.service");
const attachmentsService = require("../services/attachments.service");
const response = require("../models/response.model");

// ?group_id=<id> lists one group's expenses; ?group_id=none lists those outside every group
const listExpenses = async (req, res) => {
  const groupId = typeof req.query.group_id === "string" ? req.query.group_id : null;
  const expenses = await expensesService.listExpenses(req.user.id, groupId);
  res.json(response.success(expenses, "expenses", 200));
};

const getExpense = async (req, res) => {
  const expense = await expensesService.getExpense(req.params.id, req.user.id);
  res.json(response.success(expense, "expense", 200));
};

const createExpense = async (req, res) => {
  const id = await expensesService.createExpense(req.body, req.user.id);
  res.status(201).json(response.success({ id }, "expense created", 201));
};

const updateExpense = async (req, res) => {
  await expensesService.updateExpense(req.params.id, req.body, req.user.id);
  res.json(response.success({ id: req.params.id }, "expense updated", 200));
};

const deleteExpense = async (req, res) => {
  await expensesService.deleteExpense(req.params.id, req.user.id);
  res.json(response.success(null, "expense deleted", 200));
};

// Body: { body }
const addComment = async (req, res) => {
  const comment = await commentsService.addComment(req.params.id, req.body, req.user.id);
  res.status(201).json(response.success(comment, "comment added", 201));
};

const deleteComment = async (req, res) => {
  await commentsService.deleteComment(req.params.id, req.params.commentId, req.user.id);
  res.json(response.success(null, "comment deleted", 200));
};

// The body is the file's raw bytes; X-File-Name carries its URI-encoded name
const addAttachment = async (req, res) => {
  const attachment = await attachmentsService.addAttachment(
    req.params.id,
    req.body,
    req.get("X-File-Name"),
    req.user.id
  );
  res.status(201).json(response.success(attachment, "file uploaded", 201));
};

const getAttachment = async (req, res) => {
  const file = await attachmentsService.getAttachment(req.params.id, req.params.attachmentId, req.user.id);
  res.set({
    "Content-Type": file.content_type,
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
    "X-Content-Type-Options": "nosniff",
    // Files never change once uploaded, but they're private: only the signed-in browser may cache them
    "Cache-Control": "private, max-age=31536000, immutable",
  });
  res.send(file.data);
};

const deleteAttachment = async (req, res) => {
  await attachmentsService.deleteAttachment(req.params.id, req.params.attachmentId, req.user.id);
  res.json(response.success(null, "file removed", 200));
};

module.exports = {
  listExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  addComment,
  deleteComment,
  addAttachment,
  getAttachment,
  deleteAttachment,
};
