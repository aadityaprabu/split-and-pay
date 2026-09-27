const express = require("express");
const requireAuth = require("../middlewares/requireAuth.middleware");
const authController = require("../controllers/auth.controller");

const router = express.Router();

router.get("/auth/config", authController.getConfig);
router.post("/auth/google", authController.signInWithGoogle);
router.get("/auth/me", requireAuth, authController.getCurrentUser);
router.post("/auth/logout", authController.signOut);

module.exports = router;
