const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseExpenseInput } = require("./expenses.service");

const alice = "01a0dfe4-40e2-7e27-95f3-0bdd23b82a6a";
const bob = "01a0dfe4-40e7-790c-b231-98218508f522";

const validBody = () => ({
  description: "  Groceries ",
  amount_minor: 45000,
  paid_by: alice,
  split_type: "equal",
  participants: [{ user_id: alice }, { user_id: bob }],
});

test("a valid body is trimmed and converted", () => {
  const input = parseExpenseInput(validBody());
  assert.equal(input.description, "Groceries");
  assert.equal(input.amountMinor, 45000);
  assert.equal(input.spentOn, null);
  assert.equal(input.currency, "USD", "defaults to USD");
  assert.deepEqual(
    input.participants.map((participant) => participant.userId),
    [alice, bob]
  );
});

test("each broken field is rejected with a 400", () => {
  const brokenBodies = {
    "no description": { description: "   " },
    "long description": { description: "x".repeat(101) },
    "zero amount": { amount_minor: 0 },
    "fractional paise": { amount_minor: 100.5 },
    "amount as a string": { amount_minor: "450" },
    "unsupported currency": { currency: "EUR" },
    "payer isn't a uuid": { paid_by: "1" },
    "impossible date": { spent_on: "2026-02-31" },
    "badly formatted date": { spent_on: "26/09/2026" },
    "unknown split type": { split_type: "shares" },
    "nobody to split with": { participants: [] },
    "participant isn't a uuid": { participants: [{ user_id: "1; DROP TABLE users" }] },
    "same person twice": { participants: [{ user_id: alice }, { user_id: alice.toUpperCase() }] },
  };

  for (const [name, override] of Object.entries(brokenBodies)) {
    assert.throws(() => parseExpenseInput({ ...validBody(), ...override }), { statusCode: 400 }, name);
  }
});

test("INR is accepted", () => {
  assert.equal(parseExpenseInput({ ...validBody(), currency: "INR" }).currency, "INR");
});

test("a real date is accepted", () => {
  assert.equal(parseExpenseInput({ ...validBody(), spent_on: "2028-02-29" }).spentOn, "2028-02-29");
});
