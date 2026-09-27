const express = require("express");
const healthRoutes = require("./health.route");
const authRoutes = require("./auth.route");
const adminRoutes = require("./admin.route");
const usersRoutes = require("./users.route");
const expensesRoutes = require("./expenses.route");
const settlementsRoutes = require("./settlements.route");

// Every API route, combined into one router that setup.js mounts at Server.API_PREFIX (/api)
const router = express.Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(adminRoutes);
router.use(usersRoutes);
router.use(expensesRoutes);
router.use(settlementsRoutes);

module.exports = router;
