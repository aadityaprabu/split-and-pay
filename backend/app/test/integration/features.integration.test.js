const { test } = require("node:test");
const assert = require("node:assert/strict");
const { useTestServer, signInRoommate } = require("./harness");

const server = useTestServer();

async function setup() {
  const asha = await signInRoommate(server, "asha@example.com", "Asha");
  const bala = await signInRoommate(server, "bala@example.com", "Bala");
  const chen = await signInRoommate(server, "chen@example.com", "Chen");
  return { asha, bala, chen };
}

const expenseBody = (paidBy, userIds, amountMinor, extra = {}) => ({
  description: "Dinner",
  amount_minor: amountMinor,
  currency: "USD",
  paid_by: paidBy,
  split_type: "equal",
  participants: userIds.map((userId) => ({ user_id: userId })),
  ...extra,
});

async function addExpense(client, body) {
  const response = await client.post("/expenses", body);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.id;
}

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

// ---- Edit an expense ----

test("an expense can be edited by whoever added it, shares and notes included", async () => {
  const { asha, bala, chen } = await setup();
  const id = await addExpense(asha.client, expenseBody(asha.user.id, [asha.user.id, bala.user.id], 3000));

  const edited = await asha.client.put(
    `/expenses/${id}`,
    expenseBody(asha.user.id, [asha.user.id, bala.user.id, chen.user.id], 9000, {
      description: "Dinner and drinks",
      notes: "Includes the tip",
    })
  );
  assert.equal(edited.status, 200);

  const expense = (await bala.client.get(`/expenses/${id}`)).body.data;
  assert.equal(expense.description, "Dinner and drinks");
  assert.equal(expense.notes, "Includes the tip");
  assert.equal(expense.amount_minor, 9000);
  assert.deepEqual(expense.splits.map((split) => split.amount_minor), [3000, 3000, 3000]);
  assert.ok(expense.updated_at);
});

test("someone who neither added nor paid can't edit, and nobody can once a share is settled", async () => {
  const { asha, bala } = await setup();
  const both = [asha.user.id, bala.user.id];
  const id = await addExpense(asha.client, expenseBody(asha.user.id, both, 3000));

  assert.equal((await bala.client.put(`/expenses/${id}`, expenseBody(asha.user.id, both, 1000))).status, 403);

  await bala.client.post("/settlements", { user_id: asha.user.id, currency: "USD", net_minor: -1500 });
  const afterSettling = await asha.client.put(`/expenses/${id}`, expenseBody(asha.user.id, both, 1000));
  assert.equal(afterSettling.status, 409);
  assert.match(afterSettling.body.message, /can't be edited/);
});

// ---- Groups ----

test("a group's expenses are seen by its members and the people on them, and can be filtered", async () => {
  const { asha, bala, chen } = await setup();
  const created = await asha.client.post("/groups", { name: "Goa trip", member_ids: [bala.user.id] });
  assert.equal(created.status, 201);
  const groupId = created.body.data.id;

  const tripId = await addExpense(
    asha.client,
    expenseBody(asha.user.id, [asha.user.id, bala.user.id], 2000, { group_id: groupId })
  );
  const flatId = await addExpense(asha.client, expenseBody(asha.user.id, [asha.user.id, chen.user.id], 2000));

  const ids = async (client, query = "") => (await client.get(`/expenses${query}`)).body.data.map((e) => e.id);
  assert.deepEqual((await ids(bala.client)).sort(), [tripId, flatId].sort());
  assert.deepEqual(await ids(chen.client), [flatId], "Chen isn't in the trip");
  assert.equal((await chen.client.get(`/expenses/${tripId}`)).status, 404);
  assert.deepEqual(await ids(asha.client, `?group_id=${groupId}`), [tripId]);
  assert.deepEqual(await ids(asha.client, "?group_id=none"), [flatId]);

  const trip = (await bala.client.get(`/expenses/${tripId}`)).body.data;
  assert.deepEqual(trip.group, { id: groupId, name: "Goa trip" });

  const groups = (await bala.client.get("/groups")).body.data;
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].members.map((member) => member.name), ["Asha", "Bala"]);
  assert.equal(groups[0].expense_count, 1);
  assert.deepEqual((await chen.client.get("/groups")).body.data, []);
});

test("only whoever made a group can rename it, change its members or delete it", async () => {
  const { asha, bala, chen } = await setup();
  const groupId = (await asha.client.post("/groups", { name: "Trip", member_ids: [bala.user.id] })).body.data.id;

  const rename = await bala.client.put(`/groups/${groupId}`, { name: "Bala's trip", member_ids: [asha.user.id] });
  assert.equal(rename.status, 403);
  assert.equal((await bala.client.delete(`/groups/${groupId}`)).status, 403);
  assert.equal((await chen.client.put(`/groups/${groupId}`, { name: "x" })).status, 404, "outsiders don't see it");

  const [group] = (await asha.client.get("/groups")).body.data;
  assert.equal(group.name, "Trip");
  assert.equal(group.members.length, 2);

  // The creator can't drop themselves: they're always put back in
  const leave = await asha.client.put(`/groups/${groupId}`, { name: "Goa", member_ids: [bala.user.id] });
  assert.equal(leave.status, 200);
  const [renamed] = (await asha.client.get("/groups")).body.data;
  assert.deepEqual(renamed.members.map((member) => member.name), ["Asha", "Bala"]);
});

test("whoever added a group expense can't be removed from the group either", async () => {
  const { asha, bala, chen } = await setup();
  const groupId = (
    await asha.client.post("/groups", { name: "Trip", member_ids: [bala.user.id, chen.user.id] })
  ).body.data.id;
  // Chen adds it, but only Asha and Bala are on it
  await addExpense(chen.client, expenseBody(asha.user.id, [asha.user.id, bala.user.id], 2000, { group_id: groupId }));

  const removeChen = await asha.client.put(`/groups/${groupId}`, { name: "Trip", member_ids: [bala.user.id] });
  assert.equal(removeChen.status, 409);
  assert.match(removeChen.body.message, /Chen/);
});

test("everyone on a group expense must be in the group", async () => {
  const { asha, bala, chen } = await setup();
  const groupId = (await asha.client.post("/groups", { name: "Trip", member_ids: [bala.user.id] })).body.data.id;
  const response = await asha.client.post(
    "/expenses",
    expenseBody(asha.user.id, [asha.user.id, chen.user.id], 2000, { group_id: groupId })
  );
  assert.equal(response.status, 400);
  assert.match(response.body.message, /in its group/);

  const notMember = await chen.client.post(
    "/expenses",
    expenseBody(chen.user.id, [chen.user.id], 2000, { group_id: groupId })
  );
  assert.equal(notMember.status, 400);
});

test("members on a group's expenses can't be removed, and a group with expenses can't be deleted", async () => {
  const { asha, bala, chen } = await setup();
  const groupId = (
    await asha.client.post("/groups", { name: "Trip", member_ids: [bala.user.id, chen.user.id] })
  ).body.data.id;
  await addExpense(asha.client, expenseBody(asha.user.id, [asha.user.id, bala.user.id], 2000, { group_id: groupId }));

  const removeBala = await asha.client.put(`/groups/${groupId}`, { name: "Trip", member_ids: [chen.user.id] });
  assert.equal(removeBala.status, 409);
  assert.match(removeBala.body.message, /Bala/);

  const removeChen = await asha.client.put(`/groups/${groupId}`, { name: "Goa", member_ids: [bala.user.id] });
  assert.equal(removeChen.status, 200);
  assert.equal((await chen.client.put(`/groups/${groupId}`, { name: "x" })).status, 404, "Chen left");

  assert.equal((await asha.client.delete(`/groups/${groupId}`)).status, 409);
  const emptyId = (await asha.client.post("/groups", { name: "Empty" })).body.data.id;
  assert.equal((await asha.client.delete(`/groups/${emptyId}`)).status, 200);
});

// ---- Comments ----

test("comments can be added by anyone who sees the expense and deleted only by their author", async () => {
  const { asha, bala } = await setup();
  const id = await addExpense(asha.client, expenseBody(asha.user.id, [asha.user.id, bala.user.id], 3000));

  const added = await bala.client.post(`/expenses/${id}/comments`, { body: "  I'll pay you Friday  " });
  assert.equal(added.status, 201);
  assert.equal((await bala.client.post(`/expenses/${id}/comments`, { body: "  " })).status, 400);

  const expense = (await asha.client.get(`/expenses/${id}`)).body.data;
  assert.equal(expense.comment_count, 1);
  assert.equal(expense.comments[0].body, "I'll pay you Friday");
  assert.equal(expense.comments[0].user.name, "Bala");

  const commentId = added.body.data.id;
  assert.equal((await asha.client.delete(`/expenses/${id}/comments/${commentId}`)).status, 403);
  assert.equal((await bala.client.delete(`/expenses/${id}/comments/${commentId}`)).status, 200);
  assert.equal((await asha.client.get(`/expenses/${id}`)).body.data.comments.length, 0);
});

// ---- Receipts ----

test("a receipt photo is stored, served back with its real type, and removable", async () => {
  const { asha, bala } = await setup();
  const id = await addExpense(asha.client, expenseBody(asha.user.id, [asha.user.id, bala.user.id], 3000));

  const uploaded = await bala.client.upload(`/expenses/${id}/attachments`, JPEG_BYTES, "bill.jpg", "image/png");
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  assert.equal(uploaded.body.data.content_type, "image/jpeg", "the bytes decide, not the header");
  assert.equal(uploaded.body.data.file_name, "bill.jpg");

  const attachmentId = uploaded.body.data.id;
  const file = await asha.client.get(`/expenses/${id}/attachments/${attachmentId}`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "image/jpeg");
  assert.equal(file.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(file.body, JPEG_BYTES);

  assert.equal((await asha.client.get(`/expenses/${id}`)).body.data.attachments.length, 1);
  // Asha added the expense, so she can remove Bala's file
  assert.equal((await asha.client.delete(`/expenses/${id}/attachments/${attachmentId}`)).status, 200);
  assert.equal((await asha.client.get(`/expenses/${id}/attachments/${attachmentId}`)).status, 404);
});

test("files that aren't photos or PDFs are refused, and so are files that are too big", async () => {
  const { asha } = await setup();
  const id = await addExpense(asha.client, expenseBody(asha.user.id, [asha.user.id], 3000));

  const html = await asha.client.upload(`/expenses/${id}/attachments`, Buffer.from("<html></html>"), "x.jpg", "image/jpeg");
  assert.equal(html.status, 400);

  const huge = Buffer.concat([JPEG_BYTES, Buffer.alloc(5 * 1024 * 1024)]);
  const tooBig = await asha.client.upload(`/expenses/${id}/attachments`, huge, "huge.jpg", "image/jpeg");
  assert.equal(tooBig.status, 413);
});

test("receipts on a group expense are hidden from people outside it", async () => {
  const { asha, bala, chen } = await setup();
  const groupId = (await asha.client.post("/groups", { name: "Trip", member_ids: [bala.user.id] })).body.data.id;
  const id = await addExpense(
    asha.client,
    expenseBody(asha.user.id, [asha.user.id, bala.user.id], 2000, { group_id: groupId })
  );
  const uploaded = await asha.client.upload(`/expenses/${id}/attachments`, JPEG_BYTES, "bill.jpg");
  assert.equal((await chen.client.get(`/expenses/${id}/attachments/${uploaded.body.data.id}`)).status, 404);
  assert.equal((await chen.client.upload(`/expenses/${id}/attachments`, JPEG_BYTES, "x.jpg")).status, 404);
});

// ---- Partial payments ----

const balanceWith = async (client, name) =>
  (await client.get("/balances")).body.data.find((balance) => balance.name === name);

test("a part payment lowers the balance and leaves the shares open, then settling in full closes it", async () => {
  const { asha, bala } = await setup();
  const both = [asha.user.id, bala.user.id];
  await addExpense(asha.client, expenseBody(asha.user.id, both, 3000)); // Bala owes Asha $15

  const partial = await bala.client.post("/settlements", {
    user_id: asha.user.id,
    currency: "USD",
    net_minor: -1500,
    amount_minor: 400,
  });
  assert.equal(partial.status, 201, JSON.stringify(partial.body));
  assert.equal(partial.body.data.is_partial, true);
  assert.equal(partial.body.data.from_user, bala.user.id);

  const afterPartial = await balanceWith(asha.client, "Bala");
  assert.equal(afterPartial.net_minor, 1100);
  assert.equal(afterPartial.partial_paid_minor, 400);
  const expenses = (await asha.client.get("/expenses")).body.data;
  assert.equal(expenses[0].splits.find((split) => split.name === "Bala").settled_at, null);

  // The old balance is refused, so nobody pays an amount they didn't see
  const stale = await bala.client.post("/settlements", { user_id: asha.user.id, currency: "USD", net_minor: -1500 });
  assert.equal(stale.status, 409);

  const full = await bala.client.post("/settlements", { user_id: asha.user.id, currency: "USD", net_minor: -1100 });
  assert.equal(full.status, 201);
  assert.equal(full.body.data.amount_minor, 1100);
  assert.equal(full.body.data.is_partial, false);
  assert.equal(await balanceWith(asha.client, "Bala"), undefined);

  const history = (await asha.client.get("/settlements")).body.data;
  assert.deepEqual(
    history.map((settlement) => [settlement.amount_minor, settlement.is_partial]),
    [
      [1100, false],
      [400, true],
    ]
  );
});

test("a part payment can't be more than what's owed, and paying exactly the balance settles in full", async () => {
  const { asha, bala } = await setup();
  await addExpense(asha.client, expenseBody(asha.user.id, [asha.user.id, bala.user.id], 3000));
  const base = { user_id: asha.user.id, currency: "USD", net_minor: -1500 };

  assert.equal((await bala.client.post("/settlements", { ...base, amount_minor: 1600 })).status, 400);
  assert.equal((await bala.client.post("/settlements", { ...base, amount_minor: 0 })).status, 400);

  const exact = await bala.client.post("/settlements", { ...base, amount_minor: 1500 });
  assert.equal(exact.status, 201);
  assert.equal(exact.body.data.is_partial, false);
  assert.equal(exact.body.data.settled_share_count, 1);
});

test("an expense a part payment was made towards can't be edited or deleted until settled in full", async () => {
  const { asha, bala, chen } = await setup();
  const both = [asha.user.id, bala.user.id];
  const covered = await addExpense(asha.client, expenseBody(asha.user.id, both, 3000)); // Bala owes Asha $15
  // Chen isn't part of the payment between Bala and Asha, so this one stays editable
  const other = await addExpense(asha.client, expenseBody(asha.user.id, [asha.user.id, chen.user.id], 2000));

  const partial = await bala.client.post("/settlements", {
    user_id: asha.user.id,
    currency: "USD",
    net_minor: -1500,
    amount_minor: 400,
  });
  assert.equal(partial.status, 201);

  const listed = (await asha.client.get("/expenses")).body.data;
  assert.equal(listed.find((expense) => expense.id === covered).has_part_payment, true);
  assert.equal(listed.find((expense) => expense.id === other).has_part_payment, false);

  const edit = await asha.client.put(`/expenses/${covered}`, expenseBody(asha.user.id, both, 100));
  assert.equal(edit.status, 409);
  assert.match(edit.body.message, /part payment/);
  assert.equal((await asha.client.delete(`/expenses/${covered}`)).status, 409);
  assert.equal((await asha.client.get(`/expenses/${covered}`)).body.data.amount_minor, 3000);
  assert.equal(
    (await asha.client.put(`/expenses/${other}`, expenseBody(asha.user.id, [asha.user.id, chen.user.id], 4000))).status,
    200
  );

  // Settling in full closes the part payment; the share is now settled, which keeps it locked as before
  await bala.client.post("/settlements", { user_id: asha.user.id, currency: "USD", net_minor: -1100 });
  const after = (await asha.client.get(`/expenses/${covered}`)).body.data;
  assert.equal(after.has_part_payment, false);
  assert.equal((await asha.client.delete(`/expenses/${covered}`)).status, 409);
});
