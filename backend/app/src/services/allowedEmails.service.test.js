const { test, mock } = require("node:test");
const assert = require("node:assert/strict");

process.env.ADMIN_EMAIL = " Admin@Gmail.com ";

const { pool } = require("../config/db");
const { isEmailAllowed, addAllowedEmail } = require("./allowedEmails.service");

// None of these cases may reach the database
mock.method(pool, "query", async () => {
  throw new Error("unexpected database query");
});

test("the admin is always allowed, without a database lookup", async () => {
  assert.equal(await isEmailAllowed("admin@gmail.com"), true);
  assert.equal(await isEmailAllowed("ADMIN@gmail.com"), true);
});

test("adding rejects things that aren't email addresses", async () => {
  for (const bad of ["", "   ", "roommate", "roommate@", "@gmail.com", "a b@gmail.com", undefined]) {
    await assert.rejects(addAllowedEmail(bad, 1), { statusCode: 400 }, `accepted ${JSON.stringify(bad)}`);
  }
});

test("the admin can add their own email, to take part in splits", async (t) => {
  t.mock.method(pool, "query", async () => ({ rowCount: 1 }));
  assert.equal(await addAllowedEmail("Admin@GMAIL.com", "admin-user-id"), "admin@gmail.com");
});
