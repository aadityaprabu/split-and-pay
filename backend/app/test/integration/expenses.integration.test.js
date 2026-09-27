const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useTestServer, signInRoommate, pool } = require("./harness");

const server = useTestServer();

async function twoRoommates() {
  const asha = await signInRoommate(server, "asha@example.com", "Asha");
  const bala = await signInRoommate(server, "bala@example.com", "Bala");
  return { asha, bala };
}

const equalSplit = (paidBy, userIds, overrides = {}) => ({
  description: "Groceries",
  amount_minor: 10000,
  paid_by: paidBy,
  split_type: "equal",
  participants: userIds.map((userId) => ({ user_id: userId })),
  ...overrides,
});

test("an equal split is stored in exact cents, with the payer's own share already settled", async () => {
  const { asha, bala } = await twoRoommates();
  const chitra = await signInRoommate(server, "chitra@example.com", "Chitra");

  const created = await asha.client.post(
    "/expenses",
    equalSplit(asha.user.id, [asha.user.id, bala.user.id, chitra.user.id])
  );
  assert.equal(created.status, 201);

  const [expense] = (await bala.client.get("/expenses")).body.data;
  assert.equal(expense.currency, "USD", "USD is the default currency");
  assert.equal(expense.paid_by.name, "Asha");
  const shares = Object.fromEntries(expense.splits.map((split) => [split.name, split]));
  assert.equal(shares.Asha.amount_minor + shares.Bala.amount_minor + shares.Chitra.amount_minor, 10000);
  assert.deepEqual(
    expense.splits.map((split) => split.amount_minor).sort(),
    [3333, 3333, 3334]
  );
  assert.ok(shares.Asha.settled_at, "the payer doesn't owe themselves");
  assert.equal(shares.Bala.settled_at, null);
});

test("percent and exact splits are validated by the server", async () => {
  const { asha, bala } = await twoRoommates();

  const percent = await asha.client.post("/expenses", {
    ...equalSplit(asha.user.id, []),
    split_type: "percent",
    currency: "INR",
    participants: [
      { user_id: asha.user.id, basis_points: 7000 },
      { user_id: bala.user.id, basis_points: 3000 },
    ],
  });
  assert.equal(percent.status, 201);

  const wrongTotal = await asha.client.post("/expenses", {
    ...equalSplit(asha.user.id, []),
    split_type: "exact",
    currency: "INR",
    participants: [
      { user_id: asha.user.id, amount_minor: 6000 },
      { user_id: bala.user.id, amount_minor: 3000 },
    ],
  });
  assert.equal(wrongTotal.status, 400);
  assert.equal(wrongTotal.body.message, "The amounts add up to ₹90.00, not ₹100.00");

  const [expense] = (await asha.client.get("/expenses")).body.data;
  assert.equal(expense.currency, "INR");
  assert.deepEqual(
    expense.splits.map((split) => [split.name, split.amount_minor, split.basis_points]),
    [
      ["Asha", 7000, 7000],
      ["Bala", 3000, 3000],
    ]
  );
});

test("nothing is saved when the split is invalid", async () => {
  const { asha, bala } = await twoRoommates();

  const response = await asha.client.post("/expenses", {
    ...equalSplit(asha.user.id, [asha.user.id, bala.user.id]),
    currency: "EUR",
  });
  assert.equal(response.status, 400);
  const { rows } = await pool.query("SELECT count(*)::int AS count FROM expenses");
  assert.equal(rows[0].count, 0);
});

test("someone who was removed from the allowed list can't be added to new expenses", async () => {
  const { asha, bala } = await twoRoommates();
  await pool.query("DELETE FROM allowed_emails WHERE email = 'bala@example.com'");

  const response = await asha.client.post("/expenses", equalSplit(asha.user.id, [asha.user.id, bala.user.id]));
  assert.equal(response.status, 400);
});

test("only whoever added or paid for an expense can delete it", async () => {
  const { asha, bala } = await twoRoommates();
  const chitra = await signInRoommate(server, "chitra@example.com", "Chitra");
  const { body } = await asha.client.post("/expenses", equalSplit(asha.user.id, [asha.user.id, bala.user.id]));

  assert.equal((await chitra.client.delete(`/expenses/${body.data.id}`)).status, 403);
  assert.equal((await bala.client.delete(`/expenses/${body.data.id}`)).status, 403);
  assert.equal((await asha.client.delete(`/expenses/${body.data.id}`)).status, 200);
  assert.equal((await asha.client.delete(`/expenses/${body.data.id}`)).status, 404, "already deleted");
  assert.equal((await asha.client.delete("/expenses/not-a-uuid")).status, 404);

  assert.deepEqual((await asha.client.get("/expenses")).body.data, []);
  assert.deepEqual((await bala.client.get("/balances")).body.data, [], "a deleted expense owes nothing");
});

test("signed-out requests are refused", async () => {
  const { asha } = await twoRoommates();
  await asha.client.post("/auth/logout");
  assert.equal((await asha.client.get("/expenses")).status, 401);
  assert.equal((await asha.client.post("/expenses", {})).status, 401);
});
