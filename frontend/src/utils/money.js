import { CurrencyDetails, Money } from "../constants/constants";

// Two formatters per currency: whole amounts drop the ".00"
const formatters = Object.fromEntries(
  Object.entries(CurrencyDetails).map(([currency, details]) => [
    currency,
    {
      whole: new Intl.NumberFormat(details.LOCALE, { style: "currency", currency, maximumFractionDigits: 0 }),
      withMinor: new Intl.NumberFormat(details.LOCALE, { style: "currency", currency }),
    },
  ]),
);

/** (45000, "INR") → "₹450", (3334, "USD") → "$33.34", (12345600, "INR") → "₹1,23,456" */
export function formatMinor(amountMinor, currency) {
  const { whole, withMinor } = formatters[currency];
  const isWhole = amountMinor % Money.MINOR_UNITS_PER_MAJOR === 0;
  return (isWhole ? whole : withMinor).format(amountMinor / Money.MINOR_UNITS_PER_MAJOR);
}

/** 3333 basis points → "33.33%" */
export function formatBasisPoints(basisPoints) {
  return `${basisPoints / 100}%`;
}

/**
 * Parses typed text with up to 2 decimals into hundredths, without floating point:
 * "450" → 45000, "33.5" → 3350, "1,200.05" → 120005. Used for amounts→cents/paise and percent→basis points.
 * Returns null for anything else (empty, negative, 3+ decimals, letters).
 */
export function parseHundredths(text) {
  const cleaned = String(text ?? "").trim().replaceAll(",", "");
  const match = /^(\d{0,9})(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match || (match[1] === "" && !match[2])) return null;
  return Number(match[1] || "0") * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** 3350 → "33.5", 45000 → "450": the inverse of parseHundredths, for pre-filling inputs */
export function hundredthsToText(hundredths) {
  return String(hundredths / 100);
}
