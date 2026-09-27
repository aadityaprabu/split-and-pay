const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Environment } = require("../../src/constants/environment");
const { useTestServer, createClient, signIn, allowEmails } = require("./harness");

const server = useTestServer();

test("the health check reports the database is reachable", async () => {
  const response = await createClient(server).get("/healthz");
  assert.equal(response.status, 200);
  assert.equal(response.body, "OK");
});

test("an allowed roommate signs in and stays signed in through the cookie", async () => {
  await allowEmails("bala@example.com");
  const { client, response } = await signIn(server, { email: "Bala@Example.com", name: "Bala" });

  assert.equal(response.status, 200);
  const me = await client.get("/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.data.email, "bala@example.com");
  assert.equal(me.body.data.is_admin, false);
  assert.equal(me.body.data.is_participant, true);
});

test("an email that isn't on the list is refused and gets no session", async () => {
  const { client, response } = await signIn(server, { email: "stranger@example.com" });

  assert.equal(response.status, 403);
  assert.equal((await client.get("/auth/me")).status, 401);
});

test("an allowed email Google hasn't verified is refused", async () => {
  await allowEmails("bala@example.com");
  const { response } = await signIn(server, { email: "bala@example.com", emailVerified: false });
  assert.equal(response.status, 403);
});

test("the admin can always sign in, but only manages access until they join splits", async () => {
  const { user } = await signIn(server, { email: Environment.ADMIN_EMAIL });
  assert.equal(user.is_admin, true);
  assert.equal(user.is_participant, false);
});

test("signing out ends the session", async () => {
  await allowEmails("bala@example.com");
  const { client } = await signIn(server, { email: "bala@example.com" });

  assert.equal((await client.post("/auth/logout")).status, 200);
  assert.equal((await client.get("/auth/me")).status, 401);
});

test("the Google client id is served to the frontend", async () => {
  const response = await createClient(server).get("/auth/config");
  assert.equal(response.body.data.googleClientId, Environment.GOOGLE_CLIENT_ID);
});

test("unknown routes are a JSON 404", async () => {
  const response = await createClient(server).get("/no-such-route");
  assert.equal(response.status, 404);
  assert.equal(response.body.status, "error");
});
