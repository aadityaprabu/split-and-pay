// Spreadsheet apps run a cell starting with one of these as a formula. Titles and notes are typed by
// roommates, so a leading ' keeps "=HYPERLINK(...)" as plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: quoted when it needs to be, with inner quotes doubled */
function toCell(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Rows of values → CSV text with CRLF line endings (what Excel expects) */
function toCsv(header, rows) {
  return [header, ...rows].map((row) => row.map(toCell).join(",")).join("\r\n") + "\r\n";
}

/** 123456 → "1234.56": minor units as a plain number a spreadsheet can add up */
function minorToDecimal(amountMinor) {
  const sign = amountMinor < 0 ? "-" : "";
  const absolute = Math.abs(amountMinor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

module.exports = { toCell, toCsv, minorToDecimal };
