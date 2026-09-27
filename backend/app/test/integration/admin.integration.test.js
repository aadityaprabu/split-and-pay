const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Environment } = require("../../src/constants/environment");
const { useTestServer, signIn, signInRoommate } = require("./harness");

const server = useTestServer();

const signInAdmin = async () => (await signIn(server, { email: Environment.ADMIN_EMAIL, name: "Admin" })).client;

test("only the admin can manage the allowed list", async () => {
  const { client: roommate } = await signInRoommate(server, "bala@example.com", "Bala");

  assert.equal((await roommate.get("/admin/allowed-emails")).status, 403);
  assert.equal((await roommate.post("/admin/allowed-emails", { email: "x@example.com" })).status, 403);
});

test("the admin adds, lists and removes emails", async () => {
  const admin = await signInAdmin();

  assert.equal((await admin.post("/admin/allowed-emails", { email: " New@Example.com " })).status, 201);
  assert.equal((await admin.post("/admin/allowed-emails", { email: "new@example.com" })).status, 409);
  assert.equal((await admin.post("/admin/allowed-emails", { email: "not-an-email" })).status, 400);

  const list = await admin.get("/admin/allowed-emails");
  assert.equal(list.body.data.adminEmail, Environment.ADMIN_EMAIL);
  assert.deepEqual(
    list.body.data.allowedEmails.map((entry) => entry.email),
    ["new@example.com"]
  );

  assert.equal((await admin.delete("/admin/allowed-emails/new%40example.com")).status, 200);
  assert.equal((await admin.delete("/admin/allowed-emails/new%40example.com")).status, 404);
});

test("removing a roommate signs them out immediately", async () => {
  const admin = await signInAdmin();
  const { client: roommate } = await signInRoommate(server, "bala@example.com", "Bala");
  assert.equal((await roommate.get("/auth/me")).status, 200);

  await admin.delete("/admin/allowed-emails/bala%40example.com");

  assert.equal((await roommate.get("/auth/me")).status, 401);
});

test("the admin can't split until they join, and stays signed in when they leave", async () => {
  const admin = await signInAdmin();
  assert.equal((await admin.get("/expenses")).status, 403);
  assert.equal((await admin.get("/balances")).status, 403);

  await admin.post("/admin/allowed-emails", { email: Environment.ADMIN_EMAIL });
  assert.equal((await admin.get("/auth/me")).body.data.is_participant, true);
  assert.equal((await admin.get("/expenses")).status, 200);

  await admin.delete(`/admin/allowed-emails/${encodeURIComponent(Environment.ADMIN_EMAIL)}`);
  const me = await admin.get("/auth/me");
  assert.equal(me.status, 200, "leaving splits doesn't sign the admin out");
  assert.equal(me.body.data.is_participant, false);
});

test("only participants are offered for expenses", async () => {
  await signInAdmin();
  const { client: bala } = await signInRoommate(server, "bala@example.com", "Bala");
  await signInRoommate(server, "chitra@example.com", "Chitra");

  const users = await bala.get("/users");
  assert.deepEqual(
    users.body.data.map((user) => user.name),
    ["Bala", "Chitra"]
  );
});
