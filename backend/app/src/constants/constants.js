const EnvironmentName = Object.freeze({
  LOCAL: "LOCAL",
});

const Server = Object.freeze({
  // Every route lives under this prefix; nginx / the Vite dev proxy map BACKEND_URL onto it
  API_PREFIX: "/api",
  JSON_BODY_LIMIT: "100kb",
});

const Database = Object.freeze({
  POOL_MAX_CONNECTIONS: 10,
});

const Session = Object.freeze({
  COOKIE_NAME: "sid",
  DURATION_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
});

const Validation = Object.freeze({
  // Deliberately loose: Google is the real check that the address exists
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  // Checked before querying: Postgres rejects a malformed UUID with an error, which would be a 500
  UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  DATE_PATTERN: /^\d{4}-\d{2}-\d{2}$/,
});

const SplitType = Object.freeze({
  EQUAL: "equal",
  PERCENT: "percent",
  EXACT: "exact",
});

const Expense = Object.freeze({
  DESCRIPTION_MAX_LENGTH: 100,
  MAX_AMOUNT_MINOR: 10_000_000_00, // 1,00,00,000.00 in minor units (cents / paise)
  LIST_LIMIT: 200,
});

// Every supported currency has 100 minor units (cents, paise), so amounts are always integer hundredths.
// Adding one here also needs it added to the CHECK constraints in the database.
const Currency = Object.freeze({
  USD: "USD",
  INR: "INR",
});

const CurrencyDefault = Object.freeze({
  CODE: Currency.USD,
});

// Only used to format amounts inside error messages
const CurrencyLocale = Object.freeze({
  USD: "en-US",
  INR: "en-IN",
});

const Percent = Object.freeze({
  // Percentages are stored as basis points (hundredths of a percent) so 33.33% stays an integer
  TOTAL_BASIS_POINTS: 10_000,
});

const Settlement = Object.freeze({
  HISTORY_LIMIT: 50,
});

module.exports = {
  EnvironmentName,
  Server,
  Database,
  Session,
  Validation,
  SplitType,
  Expense,
  Currency,
  CurrencyDefault,
  CurrencyLocale,
  Percent,
  Settlement,
};
