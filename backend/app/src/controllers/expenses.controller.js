const expensesService = require("../services/expenses.service");
const response = require("../models/response.model");

const listExpenses = async (req, res) => {
  const expenses = await expensesService.listExpenses();
  res.json(response.success(expenses, "expenses", 200));
};

const createExpense = async (req, res) => {
  const id = await expensesService.createExpense(req.body, req.user.id);
  res.status(201).json(response.success({ id }, "expense created", 201));
};

const deleteExpense = async (req, res) => {
  await expensesService.deleteExpense(req.params.id, req.user.id);
  res.json(response.success(null, "expense deleted", 200));
};

module.exports = { listExpenses, createExpense, deleteExpense };
