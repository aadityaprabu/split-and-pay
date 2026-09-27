const express = require("express");
const requireAuth = require("../middlewares/requireAuth.middleware");
const requireAdmin = require("../middlewares/requireAdmin.middleware");
const adminController = require("../controllers/admin.controller");

const router = express.Router();
router.use("/admin", requireAuth, requireAdmin);

router.get("/admin/allowed-emails", adminController.listAllowedEmails);
router.post("/admin/allowed-emails", adminController.addAllowedEmail);
router.delete("/admin/allowed-emails/:email", adminController.removeAllowedEmail);

module.exports = router;
