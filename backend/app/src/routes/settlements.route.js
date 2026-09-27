const express = require("express");
const requireAuth = require("../middlewares/requireAuth.middleware");
const requireParticipant = require("../middlewares/requireParticipant.middleware");
const settlementsController = require("../controllers/settlements.controller");

const router = express.Router();
router.use(["/balances", "/settlements"], requireAuth, requireParticipant);

router.get("/balances", settlementsController.listBalances);
router.get("/settlements", settlementsController.listSettlements);
router.post("/settlements", settlementsController.settleUp);

module.exports = router;
