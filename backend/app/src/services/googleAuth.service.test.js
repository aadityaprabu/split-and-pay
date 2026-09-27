const { test, mock, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// config/auth.js reads these at require time
process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
process.env.ADMIN_EMAIL = "admin@gmail.com";

const { OAuth2Client } = require("google-auth-library");
const allowedEmails = require("./allowedEmails.service");
const { verifyGoogleCredential } = require("./googleAuth.service");

// Stand-ins for Google's signature check and the allowed_emails table
let googlePayload;
const emailsInDatabase = new Set(["roommate.one@gmail.com"]);
beforeEach(() => {
  mock.restoreAll();
  mock.method(OAuth2Client.prototype, "verifyIdToken", async ({ audience }) => {
    assert.equal(audience, process.env.GOOGLE_CLIENT_ID);
    return { getPayload: () => googlePayload };
  });
  mock.method(allowedEmails, "isEmailAllowed", async (email) => emailsInDatabase.has(email));
});

test("allows a verified email on the list, case-insensitively", async () => {
  googlePayload = { sub: "123", email: "Roommate.One@GMAIL.com", email_verified: true, name: "One" };
  const account = await verifyGoogleCredential("token");
  assert.deepEqual(account, { googleSub: "123", email: "roommate.one@gmail.com", name: "One", pictureUrl: null });
});

test("rejects an email that isn't on the list", async () => {
  googlePayload = { sub: "999", email: "stranger@gmail.com", email_verified: true };
  await assert.rejects(verifyGoogleCredential("token"), { statusCode: 403 });
});

test("rejects an allowed email that Google hasn't verified", async () => {
  googlePayload = { sub: "123", email: "roommate.one@gmail.com", email_verified: false };
  await assert.rejects(verifyGoogleCredential("token"), { statusCode: 403 });
});

test("rejects a token Google says is invalid", async () => {
  mock.method(OAuth2Client.prototype, "verifyIdToken", async () => {
    throw new Error("Wrong recipient, payload audience != requiredAudience");
  });
  await assert.rejects(verifyGoogleCredential("token"), { statusCode: 401 });
});

test("rejects a missing credential without calling Google", async () => {
  await assert.rejects(verifyGoogleCredential(undefined), { statusCode: 400 });
});
