const express = require("express");
const requireAuth = require("../middlewares/requireAuth.middleware");
const requireParticipant = require("../middlewares/requireParticipant.middleware");
const transactionsController = require("../controllers/transactions.controller");

const router = express.Router();
router.use("/transactions", requireAuth, requireParticipant);

router.get("/transactions", transactionsController.listTransactions);
router.get("/transactions/summary", transactionsController.summarizeTransactions);

module.exports = router;
