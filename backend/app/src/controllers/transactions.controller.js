const transactionsService = require("../services/transactions.service");
const response = require("../models/response.model");

// Query: from, to (YYYY-MM-DD), q (part of the title), person (user id), offset, limit
const listTransactions = async (req, res) => {
  const page = await transactionsService.listTransactions(req.user.id, req.query);
  res.json(response.success(page, "transactions", 200));
};

// Same filters as the list, without paging
const summarizeTransactions = async (req, res) => {
  const months = await transactionsService.summarizeTransactions(req.user.id, req.query);
  res.json(response.success(months, "monthly summary", 200));
};

module.exports = { listTransactions, summarizeTransactions };
