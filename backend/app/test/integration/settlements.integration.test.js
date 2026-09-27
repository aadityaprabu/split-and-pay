const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useTestServer, signInRoommate, pool } = require("./harness");

const server = useTestServer();

async function setup() {
  const asha = await signInRoommate(server, "asha@example.com", "Asha");
  const bala = await signInRoommate(server, "bala@example.com", "Bala");
  return { asha, bala };
}

// paidBy pays `amountMinor`, split equally between both roommates
async function addEqualExpense(client, paidBy, userIds, amountMinor, currency = "USD") {
  const response = await client.post("/expenses", {
    description: "Shared",
    amount_minor: amountMinor,
    currency,
    paid_by: paidBy,
    split_type: "equal",
    participants: userIds.map((userId) => ({ user_id: userId })),
  });
  assert.equal(response.status, 201);
  return response.body.data.id;
}

const balancesOf = async (client) =>
  (await client.get("/balances")).body.data.map((balance) => [balance.name, balance.currency, balance.net_minor]);

test("balances net out expenses in both directions, per currency", async () => {
  const { asha, bala } = await setup();
  const both = [asha.user.id, bala.user.id];
  await addEqualExpense(asha.client, asha.user.id, both, 3000); // Bala owes Asha $15
  await addEqualExpense(bala.client, bala.user.id, both, 1000); // Asha owes Bala $5
  await addEqualExpense(asha.client, asha.user.id, both, 60000, "INR"); // Bala owes Asha ₹300

  assert.deepEqual(await balancesOf(asha.client), [
    ["Bala", "INR", 30000],
    ["Bala", "USD", 1000],
  ]);
  assert.deepEqual(await balancesOf(bala.client), [
    ["Asha", "INR", -30000],
    ["Asha", "USD", -1000],
  ]);
});

test("settling up records the net payment and marks every share between the two as settled", async () => {
  const { asha, bala } = await setup();
  const both = [asha.user.id, bala.user.id];
  await addEqualExpense(asha.client, asha.user.id, both, 3000);
  await addEqualExpense(bala.client, bala.user.id, both, 1000);

  const settled = await bala.client.post("/settlements", { user_id: asha.user.id, currency: "USD", net_minor: -1000 });
  assert.equal(settled.status, 201);
  assert.equal(settled.body.data.amount_minor, 1000);
  assert.equal(settled.body.data.from_user, bala.user.id, "whoever owed pays");

  assert.deepEqual(await balancesOf(bala.client), []);
  const expenses = (await asha.client.get("/expenses")).body.data;
  assert.ok(expenses.every((expense) => expense.splits.every((split) => split.settled_at)));

  const history = (await asha.client.get("/settlements")).body.data;
  assert.deepEqual(
    history.map((entry) => [entry.from_user.name, entry.to_user.name, entry.amount_minor, entry.expense_count]),
    [["Bala", "Asha", 1000, 2]]
  );

  const again = await bala.client.post("/settlements", { user_id: asha.user.id, currency: "USD", net_minor: 0 });
  assert.equal(again.status, 409, "nothing left to settle");
});

test("a stale amount is refused and nothing is recorded", async () => {
  const { asha, bala } = await setup();
  await addEqualExpense(asha.client, asha.user.id, [asha.user.id, bala.user.id], 3000);

  const response = await bala.client.post("/settlements", { user_id: asha.user.id, currency: "USD", net_minor: -999 });
  assert.equal(response.status, 409);
  const { rows } = await pool.query("SELECT count(*)::int AS count FROM settlements");
  assert.equal(rows[0].count, 0);
  assert.deepEqual(await balancesOf(bala.client), [["Asha", "USD", -1500]]);
});

test("settling one currency leaves the other open", async () => {
  const { asha, bala } = await setup();
  const both = [asha.user.id, bala.user.id];
  await addEqualExpense(asha.client, asha.user.id, both, 3000);
  await addEqualExpense(asha.client, asha.user.id, both, 60000, "INR");

  await bala.client.post("/settlements", { user_id: asha.user.id, currency: "USD", net_minor: -1500 });

  assert.deepEqual(await balancesOf(bala.client), [["Asha", "INR", -30000]]);
});

test("shares that cancel out exactly can still be settled, as a zero payment", async () => {
  const { asha, bala } = await setup();
  const both = [asha.user.id, bala.user.id];
  await addEqualExpense(asha.client, asha.user.id, both, 2000);
  await addEqualExpense(bala.client, bala.user.id, both, 2000);
  assert.deepEqual(await balancesOf(asha.client), [["Bala", "USD", 0]]);

  const response = await asha.client.post("/settlements", { user_id: bala.user.id, currency: "USD", net_minor: 0 });
  assert.equal(response.status, 201);
  assert.equal(response.body.data.amount_minor, 0);
  assert.deepEqual(await balancesOf(asha.client), []);
});

test("two settle-ups at the same moment record only one payment", async () => {
  const { asha, bala } = await setup();
  await addEqualExpense(asha.client, asha.user.id, [asha.user.id, bala.user.id], 3000);

  const results = await Promise.all([
    asha.client.post("/settlements", { user_id: bala.user.id, currency: "USD", net_minor: 1500 }),
    bala.client.post("/settlements", { user_id: asha.user.id, currency: "USD", net_minor: -1500 }),
  ]);

  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const { rows } = await pool.query("SELECT count(*)::int AS count FROM settlements");
  assert.equal(rows[0].count, 1);
});

test("an expense can't be deleted once part of it has been settled", async () => {
  const { asha, bala } = await setup();
  const expenseId = await addEqualExpense(asha.client, asha.user.id, [asha.user.id, bala.user.id], 3000);
  await bala.client.post("/settlements", { user_id: asha.user.id, currency: "USD", net_minor: -1500 });

  assert.equal((await asha.client.delete(`/expenses/${expenseId}`)).status, 409);
});

test("you can't settle up with yourself or in an unknown currency", async () => {
  const { asha } = await setup();
  const self = await asha.client.post("/settlements", { user_id: asha.user.id, currency: "USD", net_minor: 0 });
  assert.equal(self.status, 400);
  const badCurrency = await asha.client.post("/settlements", { user_id: asha.user.id, currency: "EUR", net_minor: 0 });
  assert.equal(badCurrency.status, 400);
});
