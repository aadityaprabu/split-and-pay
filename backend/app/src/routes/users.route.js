const express = require("express");
const requireAuth = require("../middlewares/requireAuth.middleware");
const requireParticipant = require("../middlewares/requireParticipant.middleware");
const usersController = require("../controllers/users.controller");

const router = express.Router();

router.get("/users", requireAuth, requireParticipant, usersController.listParticipants);

module.exports = router;
