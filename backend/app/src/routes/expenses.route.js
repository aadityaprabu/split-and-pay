const express = require("express");
const { Attachment } = require("../constants/constants");
const requireAuth = require("../middlewares/requireAuth.middleware");
const requireParticipant = require("../middlewares/requireParticipant.middleware");
const expensesController = require("../controllers/expenses.controller");

const router = express.Router();
router.use("/expenses", requireAuth, requireParticipant);

// Receipt uploads are raw bytes of any declared type: the service checks what the file really is
const rawFileBody = express.raw({ type: () => true, limit: Attachment.MAX_BYTES });

router.get("/expenses", expensesController.listExpenses);
router.post("/expenses", expensesController.createExpense);
router.get("/expenses/:id", expensesController.getExpense);
router.put("/expenses/:id", expensesController.updateExpense);
router.delete("/expenses/:id", expensesController.deleteExpense);

router.post("/expenses/:id/comments", expensesController.addComment);
router.delete("/expenses/:id/comments/:commentId", expensesController.deleteComment);

router.post("/expenses/:id/attachments", rawFileBody, expensesController.addAttachment);
router.get("/expenses/:id/attachments/:attachmentId", expensesController.getAttachment);
router.delete("/expenses/:id/attachments/:attachmentId", expensesController.deleteAttachment);

module.exports = router;
