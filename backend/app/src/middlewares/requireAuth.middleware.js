const { Session } = require("../constants/constants");
const { findUserBySessionToken } = require("../services/sessions.service");
const response = require("../models/response.model");

// Put this in front of any route that needs a signed-in roommate; sets req.user.
const requireAuth = async (req, res, next) => {
  const token = req.cookies[Session.COOKIE_NAME];
  const user = token ? await findUserBySessionToken(token) : null;

  if (!user) {
    return res.status(401).json(response.error("not signed in", 401));
  }

  req.user = user;
  next();
};

module.exports = requireAuth;
