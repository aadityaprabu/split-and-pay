const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useTestServer, signInRoommate } = require("./harness");

const server = useTestServer();

async function threeRoommates() {
  const asha = await signInRoommate(server, "asha@example.com", "Asha");
  const bala = await signInRoommate(server, "bala@example.com", "Bala");
  const chitra = await signInRoommate(server, "chitra@example.com", "Chitra");
  return { asha, bala, chitra };
}

function addExpense(client, { paidBy, people, description = "Groceries", amount = 10000, spentOn, currency }) {
  return client.post("/expenses", {
    description,
    amount_minor: amount,
    currency,
    paid_by: paidBy,
    spent_on: spentOn,
    split_type: "equal",
    participants: people.map((userId) => ({ user_id: userId })),
  });
}

test("only expenses the user paid for or has a share in are listed, with their own share", async () => {
  const { asha, bala, chitra } = await threeRoommates();
  await addExpense(asha.client, { paidBy: asha.user.id, people: [asha.user.id, bala.user.id], description: "Rent" });
  await addExpense(bala.client, { paidBy: bala.user.id, people: [bala.user.id, chitra.user.id], description: "Taxi" });
  // Asha paid but isn't sharing it: still her transaction, with no share of her own
  await addExpense(asha.client, { paidBy: asha.user.id, people: [chitra.user.id], description: "Gift" });

  const page = (await asha.client.get("/transactions")).body.data;
  assert.equal(page.has_more, false);
  const byTitle = Object.fromEntries(page.items.map((item) => [item.description, item]));
  assert.deepEqual(Object.keys(byTitle).sort(), ["Gift", "Rent"]);
  assert.equal(byTitle.Rent.my_share_minor, 5000);
  assert.equal(byTitle.Gift.my_share_minor, 0);
  assert.equal(byTitle.Gift.paid_by.name, "Asha");
  assert.deepEqual(byTitle.Rent.participants.map((person) => person.name), ["Asha", "Bala"]);
});

test("pages of 10, newest first, until there are no more", async () => {
  const { asha, bala } = await threeRoommates();
  for (let day = 1; day <= 23; day += 1) {
    await addExpense(asha.client, {
      paidBy: asha.user.id,
      people: [asha.user.id, bala.user.id],
      description: `Day ${day}`,
      spentOn: `2026-03-${String(day).padStart(2, "0")}`,
    });
  }

  const first = (await asha.client.get("/transactions")).body.data;
  assert.equal(first.items.length, 10);
  assert.equal(first.items[0].description, "Day 23");
  assert.equal(first.has_more, true);

  const second = (await asha.client.get("/transactions?offset=10")).body.data;
  assert.equal(second.items[0].description, "Day 13");
  assert.equal(second.has_more, true);

  const third = (await asha.client.get("/transactions?offset=20")).body.data;
  assert.deepEqual(third.items.map((item) => item.description), ["Day 3", "Day 2", "Day 1"]);
  assert.equal(third.has_more, false);
});

test("filters by date range, title and person, in the list and the summary alike", async () => {
  const { asha, bala, chitra } = await threeRoommates();
  const both = [asha.user.id, bala.user.id];
  await addExpense(asha.client, { paidBy: asha.user.id, people: both, description: "Rent Jan", spentOn: "2026-01-05" });
  await addExpense(asha.client, { paidBy: asha.user.id, people: both, description: "Power", spentOn: "2026-01-20" });
  await addExpense(bala.client, { paidBy: bala.user.id, people: both, description: "Rent Feb", spentOn: "2026-02-05" });
  await addExpense(chitra.client, {
    paidBy: chitra.user.id,
    people: [asha.user.id, chitra.user.id],
    description: "100% juice",
    spentOn: "2026-02-10",
    amount: 4000,
  });

  const titles = async (query) =>
    (await asha.client.get(`/transactions?${query}`)).body.data.items.map((item) => item.description);

  assert.deepEqual(await titles("from=2026-01-01&to=2026-01-31"), ["Power", "Rent Jan"]);
  assert.deepEqual(await titles("q=rent"), ["Rent Feb", "Rent Jan"], "case-insensitive, part of the title");
  assert.deepEqual(await titles("q=0%25"), ["100% juice"], "% is matched as text");
  assert.deepEqual(await titles(`person=${chitra.user.id}`), ["100% juice"]);
  assert.deepEqual(await titles(`person=${bala.user.id}&from=2026-02-01`), ["Rent Feb"]);

  const summary = (await asha.client.get("/transactions/summary")).body.data;
  assert.deepEqual(summary, [
    // February: Bala paid Rent Feb, Chitra paid the juice; Asha's shares are 5000 + 2000
    { month: "2026-02", currency: "USD", transaction_count: 2, paid_minor: 0, share_minor: 7000 },
    // January: Asha paid both, half of each was hers
    { month: "2026-01", currency: "USD", transaction_count: 2, paid_minor: 20000, share_minor: 10000 },
  ]);

  const filteredSummary = (await asha.client.get(`/transactions/summary?person=${chitra.user.id}`)).body.data;
  assert.deepEqual(filteredSummary, [
    { month: "2026-02", currency: "USD", transaction_count: 1, paid_minor: 0, share_minor: 2000 },
  ]);
});

test("each currency gets its own summary row, and deleted expenses drop out", async () => {
  const { asha, bala } = await threeRoommates();
  const both = [asha.user.id, bala.user.id];
  await addExpense(asha.client, { paidBy: asha.user.id, people: both, spentOn: "2026-04-01", currency: "INR" });
  await addExpense(asha.client, { paidBy: asha.user.id, people: both, spentOn: "2026-04-02", currency: "USD" });
  const deleted = await addExpense(asha.client, { paidBy: asha.user.id, people: both, spentOn: "2026-04-03" });
  await asha.client.delete(`/expenses/${deleted.body.data.id}`);

  const summary = (await bala.client.get("/transactions/summary")).body.data;
  assert.deepEqual(
    summary.map((row) => [row.month, row.currency, row.transaction_count, row.share_minor]),
    [
      ["2026-04", "INR", 1, 5000],
      ["2026-04", "USD", 1, 5000],
    ]
  );
});

test("bad filters are a 400, and signing in is required", async () => {
  const { asha } = await threeRoommates();
  const badDate = await asha.client.get("/transactions?from=2026-13-01");
  assert.equal(badDate.status, 400);
  assert.equal(badDate.body.message, "The start date isn't valid");
  assert.equal((await asha.client.get("/transactions?limit=500")).status, 400);
  assert.equal((await asha.client.get("/transactions/summary?person=nobody")).status, 400);

  await asha.client.post("/auth/logout");
  assert.equal((await asha.client.get("/transactions")).status, 401);
});

test("the CSV download has every transaction matching the filters, not just one page", async () => {
  const { asha, bala, chitra } = await threeRoommates();
  const both = [asha.user.id, bala.user.id];
  for (let day = 1; day <= 12; day += 1) {
    await addExpense(asha.client, {
      paidBy: asha.user.id,
      people: both,
      description: `Day ${day}`,
      spentOn: `2026-05-${String(day).padStart(2, "0")}`,
    });
  }
  await addExpense(bala.client, {
    paidBy: bala.user.id,
    people: both,
    description: "=cmd, \"quoted\"",
    spentOn: "2026-06-01",
    amount: 2550,
  });
  await addExpense(bala.client, { paidBy: bala.user.id, people: [bala.user.id, chitra.user.id], description: "Not Asha's" });

  const response = await asha.client.get("/transactions/export?from=2026-05-01");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/csv/);
  assert.match(response.headers.get("content-disposition"), /^attachment; filename="transactions-\d{4}-\d{2}-\d{2}\.csv"$/);

  const text = response.body;
  // fetch's text() drops the byte order mark the server sends for Excel
  const lines = text.replace(/^\uFEFF/, "").trimEnd().split("\r\n");
  assert.equal(lines[0], "Date,Title,Group,Paid by,People,Currency,Total,You paid,Your share,Notes");
  assert.equal(lines.length, 1 + 13, "all 13 of Asha's from May on, past the 10-row page");
  assert.equal(lines[1], `2026-06-01,"'=cmd, ""quoted""",,Bala,Asha; Bala,USD,25.50,0.00,12.75,`);
  assert.equal(lines[2], "2026-05-12,Day 12,,You,Asha; Bala,USD,100.00,100.00,50.00,");
  assert.ok(!text.includes("Not Asha's"));

  const filtered = await asha.client.get("/transactions/export?q=day%201");
  const titles = filtered.body.trimEnd().split("\r\n").slice(1).map((line) => line.split(",")[1]);
  assert.deepEqual(titles, ["Day 12", "Day 11", "Day 10", "Day 1"]);
});
