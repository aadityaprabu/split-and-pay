const response = require("../models/response.model");

// Use after requireAuth on routes only the admin (ADMIN_EMAIL) may call. Being admin is only about
// managing access; see requireParticipant for who can split expenses.
const requireAdmin = (req, res, next) => {
  if (!req.user?.is_admin) {
    return res.status(403).json(response.error("admin only", 403));
  }
  next();
};

module.exports = requireAdmin;
