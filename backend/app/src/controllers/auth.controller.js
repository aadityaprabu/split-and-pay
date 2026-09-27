const { Environment } = require("../constants/environment");
const { Session } = require("../constants/constants");
const { useSecureCookies } = require("../config/auth");
const googleAuthService = require("../services/googleAuth.service");
const sessionsService = require("../services/sessions.service");
const response = require("../models/response.model");

const sessionCookieOptions = {
  httpOnly: true, // page JavaScript can't read it, so XSS can't steal it
  secure: useSecureCookies,
  sameSite: "lax", // not sent on cross-site POSTs, which blocks CSRF
  path: "/",
};

// The Google client id is public (it identifies the app, it isn't a secret), so the frontend reads
// it from here instead of needing its own copy baked in at build time.
const getConfig = (req, res) => {
  res.json(response.success({ googleClientId: Environment.GOOGLE_CLIENT_ID || null }, "auth config", 200));
};

// The frontend posts the credential from the Google button here
const signInWithGoogle = async (req, res) => {
  const googleAccount = await googleAuthService.verifyGoogleCredential(req.body?.credential);
  const { user, token } = await sessionsService.signInGoogleUser(googleAccount);

  res.cookie(Session.COOKIE_NAME, token, { ...sessionCookieOptions, maxAge: Session.DURATION_MS });
  res.json(response.success(user, "signed in", 200));
};

const getCurrentUser = (req, res) => {
  res.json(response.success(req.user, "current user", 200));
};

const signOut = async (req, res) => {
  const token = req.cookies[Session.COOKIE_NAME];
  if (token) await sessionsService.deleteSession(token);

  res.clearCookie(Session.COOKIE_NAME, sessionCookieOptions);
  res.json(response.success(null, "signed out", 200));
};

module.exports = { getConfig, signInWithGoogle, getCurrentUser, signOut };
