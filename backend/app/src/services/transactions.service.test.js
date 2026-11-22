const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseFilters, parseListQuery, escapeLike } = require("./transactions.service");

const bala = "01a0dfe4-40e7-790c-b231-98218508f522";

test("no filters means everything, first page of 10", () => {
  assert.deepEqual(parseListQuery({}), {
    from: null,
    to: null,
    search: null,
    personId: null,
    offset: 0,
    limit: 10,
  });
});

test("filters are trimmed, and blank ones are ignored", () => {
  const filters = parseFilters({ from: "2026-01-01", to: "2026-01-31", q: "  rent ", person: bala.toUpperCase() });
  assert.deepEqual(filters, { from: "2026-01-01", to: "2026-01-31", search: "rent", personId: bala });
  assert.deepEqual(parseFilters({ from: "", q: "   ", person: "" }), {
    from: null,
    to: null,
    search: null,
    personId: null,
  });
});

test("broken filters and pages are rejected with a 400", () => {
  const broken = {
    "a date that isn't a day": { from: "2026-02-31" },
    "a date in another format": { to: "01/02/2026" },
    "a start after the end": { from: "2026-03-01", to: "2026-02-01" },
    "a search that's too long": { q: "x".repeat(101) },
    "a person who isn't an id": { person: "bala" },
    "a repeated param": { q: ["a", "b"] },
    "a negative offset": { offset: "-10" },
    "a fractional offset": { offset: "1.5" },
    "a page that's too big": { limit: "51" },
    "an empty page": { limit: "0" },
  };
  for (const [name, query] of Object.entries(broken)) {
    assert.throws(() => parseListQuery(query), { statusCode: 400 }, name);
  }
});

test("LIKE wildcards in a search are matched literally", () => {
  assert.equal(escapeLike("50% off_now\\"), "50\\% off\\_now\\\\");
});
