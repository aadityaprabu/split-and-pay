const { Environment } = require("../constants/environment");
const { EnvironmentName } = require("../constants/constants");

// Locally the app is plain http, where Safari drops Secure cookies. Everywhere else it's https.
const useSecureCookies = Environment.ENV !== EnvironmentName.LOCAL;

// ADMIN_EMAIL is always allowed in and is the only account that can manage allowed emails
const isAdminEmail = (email) => Boolean(Environment.ADMIN_EMAIL) && email.toLowerCase() === Environment.ADMIN_EMAIL;

console.log("Auth configuration:", {
  googleClientId: Environment.GOOGLE_CLIENT_ID ? "set" : "MISSING — Google sign-in will be disabled",
  adminEmail: Environment.ADMIN_EMAIL || "MISSING — nobody can manage allowed emails",
});

module.exports = { isAdminEmail, useSecureCookies };
