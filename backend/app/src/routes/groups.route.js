const express = require("express");
const requireAuth = require("../middlewares/requireAuth.middleware");
const requireParticipant = require("../middlewares/requireParticipant.middleware");
const groupsController = require("../controllers/groups.controller");

const router = express.Router();
router.use("/groups", requireAuth, requireParticipant);

router.get("/groups", groupsController.listGroups);
router.post("/groups", groupsController.createGroup);
router.put("/groups/:id", groupsController.updateGroup);
router.delete("/groups/:id", groupsController.deleteGroup);

module.exports = router;
