const { CurrencyLocale } = require("../constants/constants");

/** 9000, "USD" → "$90.00"; 9000, "INR" → "₹90.00" (for messages shown to users) */
function formatMinor(amountMinor, currency) {
  return new Intl.NumberFormat(CurrencyLocale[currency], { style: "currency", currency }).format(amountMinor / 100);
}

module.exports = { formatMinor };
