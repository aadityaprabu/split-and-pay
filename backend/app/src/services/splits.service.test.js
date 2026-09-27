const { test } = require("node:test");
const assert = require("node:assert/strict");
const { computeShares } = require("./splits.service");

const people = (...ids) => ids.map((userId) => ({ userId }));
const amountsOf = (shares) => shares.map((share) => share.amountMinor);
const sum = (numbers) => numbers.reduce((total, number) => total + number, 0);

test("an equal split gives the leftover paise to the first participants", () => {
  const shares = computeShares({ amountMinor: 10000, splitType: "equal", participants: people("a", "b", "c") });
  assert.deepEqual(amountsOf(shares), [3334, 3333, 3333]);
  assert.deepEqual(
    shares.map((share) => share.userId),
    ["a", "b", "c"]
  );
});

test("an equal split of an amount smaller than the headcount is rejected", () => {
  assert.throws(
    () => computeShares({ amountMinor: 2, splitType: "equal", participants: people("a", "b", "c") }),
    { statusCode: 400 }
  );
});

test("a percent split always adds up to the exact amount", () => {
  const participants = [
    { userId: "a", basisPoints: 3333 },
    { userId: "b", basisPoints: 3333 },
    { userId: "c", basisPoints: 3334 },
  ];
  for (const amountMinor of [1, 99, 10000, 12345, 99999]) {
    const shares = computeShares({ amountMinor: amountMinor * 3, splitType: "percent", participants });
    assert.equal(sum(amountsOf(shares)), amountMinor * 3);
  }
  const shares = computeShares({ amountMinor: 10001, splitType: "percent", participants });
  assert.deepEqual(amountsOf(shares), [3333, 3333, 3335]);
  assert.deepEqual(
    shares.map((share) => share.basisPoints),
    [3333, 3333, 3334]
  );
});

test("a percent split must add up to 100% and give everyone more than 0%", () => {
  const split = (basisPoints) =>
    computeShares({
      amountMinor: 10000,
      splitType: "percent",
      participants: basisPoints.map((points, index) => ({ userId: String(index), basisPoints: points })),
    });

  assert.throws(() => split([5000, 4000]), { statusCode: 400, message: /90%/ });
  assert.throws(() => split([10000, 0]), { statusCode: 400 });
  assert.throws(() => split([5000, 50.5]), { statusCode: 400 });
  assert.deepEqual(amountsOf(split([7500, 2500])), [7500, 2500]);
});

test("an exact split must add up to the total", () => {
  const split = (amounts) =>
    computeShares({
      amountMinor: 10000,
      currency: "USD",
      splitType: "exact",
      participants: amounts.map((amountMinor, index) => ({ userId: String(index), amountMinor })),
    });

  assert.deepEqual(amountsOf(split([6000, 4000])), [6000, 4000]);
  assert.throws(() => split([6000, 3000]), { statusCode: 400, message: /\$90\.00, not \$100\.00/ });
  assert.throws(() => split([10000, 0]), { statusCode: 400 });
  assert.throws(() => split([5000.5, 4999.5]), { statusCode: 400 });
});

test("an unknown split type is rejected", () => {
  assert.throws(() => computeShares({ amountMinor: 100, splitType: "shares", participants: people("a") }), {
    statusCode: 400,
  });
});
