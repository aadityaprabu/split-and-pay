const { OAuth2Client } = require("google-auth-library");
const { Environment } = require("../constants/environment");
const allowedEmails = require("./allowedEmails.service");
const HttpError = require("../models/httpError.model");

const googleClient = new OAuth2Client();

/**
 * Verifies the ID token ("credential") the Google sign-in button hands the frontend,
 * and checks the account is one of the allowed roommates.
 * @param {string} credential - JWT from Google Identity Services
 * @returns {{ googleSub: string, email: string, name: string, pictureUrl: string | null }}
 */
async function verifyGoogleCredential(credential) {
  if (!Environment.GOOGLE_CLIENT_ID) {
    throw new HttpError(503, "Google sign-in is not configured");
  }
  if (typeof credential !== "string" || credential.length === 0) {
    throw new HttpError(400, "missing Google credential");
  }

  let payload;
  try {
    // Checks the signature, expiry, issuer, and that the token was minted for OUR client id
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: Environment.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (error) {
    console.error("Google credential rejected:", error.message);
    throw new HttpError(401, "invalid Google credential");
  }

  const email = (payload.email || "").toLowerCase();
  if (!payload.email_verified || !(await allowedEmails.isEmailAllowed(email))) {
    console.warn(`Sign-in refused for ${email || "unknown email"} — not an allowed email`);
    throw new HttpError(403, "This Google account isn't allowed to use Split & Pay");
  }

  return {
    googleSub: payload.sub,
    email: email,
    name: payload.name || email,
    pictureUrl: payload.picture || null,
  };
}

module.exports = { verifyGoogleCredential };
