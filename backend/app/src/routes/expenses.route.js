const express = require("express");
const requireAuth = require("../middlewares/requireAuth.middleware");
const requireParticipant = require("../middlewares/requireParticipant.middleware");
const expensesController = require("../controllers/expenses.controller");

const router = express.Router();
router.use("/expenses", requireAuth, requireParticipant);

router.get("/expenses", expensesController.listExpenses);
router.post("/expenses", expensesController.createExpense);
router.delete("/expenses/:id", expensesController.deleteExpense);

module.exports = router;
