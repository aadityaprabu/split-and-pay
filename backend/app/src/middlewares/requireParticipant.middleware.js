const response = require("../models/response.model");

// Use after requireAuth on expense and settle-up routes. The admin only manages access, so they get
// a 403 here until they add their own email to the allowed list.
const requireParticipant = (req, res, next) => {
  if (!req.user?.is_participant) {
    return res.status(403).json(response.error("add your email to the allowed list to split expenses", 403));
  }
  next();
};

module.exports = requireParticipant;
