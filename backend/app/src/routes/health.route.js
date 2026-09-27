const express = require("express");
const healthController = require("../controllers/health.controller");

const router = express.Router();

router.get("/ping", healthController.ping);
router.get("/healthz", healthController.healthCheck);

module.exports = router;
