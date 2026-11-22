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

// Same filters as the list, as a CSV file. The date in the name is when it was downloaded.
const exportTransactions = async (req, res) => {
  const csv = await transactionsService.exportTransactions(req.user.id, req.query);
  const today = new Date().toISOString().slice(0, 10);
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="transactions-${today}.csv"`,
    "Cache-Control": "no-store",
  });
  // The byte order mark tells Excel the file is UTF-8, so ₹ and names with accents come out right
  res.send(`\uFEFF${csv}`);
};

module.exports = { listTransactions, summarizeTransactions, exportTransactions };
