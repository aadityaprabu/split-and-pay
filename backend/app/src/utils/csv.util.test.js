const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toCell, toCsv, minorToDecimal } = require("./csv.util");

test("cells with commas, quotes or line breaks are quoted", () => {
  assert.equal(toCell("Rent"), "Rent");
  assert.equal(toCell("Rent, March"), '"Rent, March"');
  assert.equal(toCell('The "good" pizza'), '"The ""good"" pizza"');
  assert.equal(toCell("line one\nline two"), '"line one\nline two"');
  assert.equal(toCell(null), "");
  assert.equal(toCell(12), "12");
});

test("text that a spreadsheet would run as a formula is kept as text", () => {
  assert.equal(toCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(toCell("+1 for snacks"), "'+1 for snacks");
  assert.equal(toCell("@home"), "'@home");
  assert.equal(toCell("-5 discount"), "'-5 discount");
});

test("rows end with CRLF", () => {
  assert.equal(toCsv(["a", "b"], [[1, "x,y"]]), 'a,b\r\n1,"x,y"\r\n');
});

test("minor units become plain decimals", () => {
  assert.equal(minorToDecimal(123456), "1234.56");
  assert.equal(minorToDecimal(5), "0.05");
  assert.equal(minorToDecimal(1000), "10.00");
  assert.equal(minorToDecimal(-250), "-2.50");
  assert.equal(minorToDecimal(0), "0.00");
});
