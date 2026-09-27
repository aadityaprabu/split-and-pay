export const GoogleSignIn = Object.freeze({
  SCRIPT_URL: "https://accounts.google.com/gsi/client",
  BUTTON_OPTIONS: Object.freeze({
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "signin_with",
  }),
});

export const ApiStatus = Object.freeze({
  SUCCESS: "success",
  ERROR: "error",
});

export const AppRoute = Object.freeze({
  EXPENSES: "/expenses",
  NEW_EXPENSE: "/expenses/new",
  SETTLE_UP: "/settle-up",
  ADMIN: "/admin",
});

// Each expense has its own currency; balances and settle-ups are kept per currency
export const Currency = Object.freeze({
  USD: "USD",
  INR: "INR",
});

export const CurrencyDefault = Object.freeze({
  CODE: Currency.USD,
});

// Keyed by currency code, in the order the dropdown lists them
export const CurrencyDetails = Object.freeze({
  [Currency.USD]: Object.freeze({ LOCALE: "en-US", SYMBOL: "$", LABEL: "USD ($)" }),
  [Currency.INR]: Object.freeze({ LOCALE: "en-IN", SYMBOL: "₹", LABEL: "INR (₹)" }),
});

export const Money = Object.freeze({
  MINOR_UNITS_PER_MAJOR: 100, // cents per dollar, paise per rupee
});

export const SplitType = Object.freeze({
  EQUAL: "equal",
  PERCENT: "percent",
  EXACT: "exact",
});

export const Percent = Object.freeze({
  // Percentages travel as basis points (hundredths of a percent): 33.33% is 3333
  TOTAL_BASIS_POINTS: 10_000,
});

export const Expense = Object.freeze({
  DESCRIPTION_MAX_LENGTH: 100,
});
