// The only file that reads process.env. Everything else imports Environment from here.
// dotenv fills process.env from backend/app/.env locally; in docker the variables come from compose
// (there is no .env file in the image) and dotenv leaves already-set variables alone.
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const Environment = Object.freeze({
  ENV: process.env.ENV,
  BACKEND_PORT: Number(process.env.BACKEND_PORT),
  POSTGRES_HOST: process.env.POSTGRES_HOST,
  POSTGRES_PORT: Number(process.env.POSTGRES_PORT),
  POSTGRES_USER: process.env.POSTGRES_USER,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
  POSTGRES_DB: process.env.POSTGRES_DB,
  // Optional at startup: without them sign-in is disabled rather than the server refusing to start
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase(),
});

const RequiredEnvironmentKeys = Object.freeze([
  "ENV",
  "BACKEND_PORT",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
]);

/** Throws listing every required variable that is missing, so a bad deploy fails loudly at startup */
function assertRequiredEnvironment() {
  const missingKeys = RequiredEnvironmentKeys.filter((key) => {
    const value = Environment[key];
    return value === undefined || value === "" || Number.isNaN(value);
  });
  if (missingKeys.length > 0) {
    throw new Error(`Missing environment variables: ${missingKeys.join(", ")}`);
  }
}

module.exports = { Environment, assertRequiredEnvironment };
