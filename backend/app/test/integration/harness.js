// Shared setup for the integration tests: the real app (setupApp) on a random port, the real database
// (wiped before every test), and a client that keeps its session cookie like a browser tab.
// Only Google's signature check is faked: the "credential" a test sends is the token payload itself.

const { before, after, beforeEach, mock } = require("node:test");
const { once } = require("events");
const { OAuth2Client } = require("google-auth-library");
const { Session } = require("../../src/constants/constants");
const { pool } = require("../../src/config/db");
const runMigrations = require("../../src/database/migrate");
const setupApp = require("../../src/setup");

const ALL_TABLES = "users, sessions, allowed_emails, expenses, expense_splits, settlements";

/**
 * Registers before/after hooks for a test file and returns { baseUrl } once the server is up.
 * Every test starts from an empty database.
 */
function useTestServer() {
  const context = { baseUrl: null };
  let server;

  before(async () => {
    // The app logs every request and every expected 4xx; the test reporter's output is what matters here
    for (const level of ["log", "info", "warn", "error"]) mock.method(console, level, () => {});
    await runMigrations();
    mock.method(OAuth2Client.prototype, "verifyIdToken", async ({ idToken }) => ({
      getPayload: () => JSON.parse(idToken),
    }));
    server = setupApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    context.baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE ${ALL_TABLES} CASCADE`);
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  return context;
}

/** An HTTP client for one person: remembers the session cookie between requests */
function createClient(context) {
  let sessionCookie = null;

  async function request(method, endpoint, body) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (sessionCookie) headers.Cookie = sessionCookie;

    const response = await fetch(context.baseUrl + endpoint, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const [name, value] = pair.split("=");
      if (name === Session.COOKIE_NAME) sessionCookie = value ? `${name}=${value}` : null;
    }

    const text = await response.text();
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Plain-text responses, like /healthz
    }
    return { status: response.status, body: parsed };
  }

  return {
    get: (endpoint) => request("GET", endpoint),
    post: (endpoint, body = {}) => request("POST", endpoint, body),
    delete: (endpoint) => request("DELETE", endpoint),
  };
}

/** Signs in through the real POST /auth/google. Returns the client and the response. */
async function signIn(context, { email, name = email.split("@")[0], emailVerified = true }) {
  const client = createClient(context);
  const credential = JSON.stringify({ sub: `google-${email}`, email, email_verified: emailVerified, name });
  const response = await client.post("/auth/google", { credential });
  return { client, response, user: response.body.data };
}

/** Puts emails straight on the allowed list (the admin API itself is tested in admin.integration.test.js) */
async function allowEmails(...emails) {
  await pool.query("INSERT INTO allowed_emails (email) SELECT unnest($1::text[])", [emails]);
}

/** Allows and signs in a roommate in one step */
async function signInRoommate(context, email, name) {
  await allowEmails(email);
  const { client, user } = await signIn(context, { email, name });
  return { client, user };
}

module.exports = { useTestServer, createClient, signIn, allowEmails, signInRoommate, pool };
