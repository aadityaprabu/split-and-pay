import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/authContext";
import Avatar from "../components/Avatar";
import { CheckIcon, ChevronDownIcon } from "../components/Icons";
import { ApiStatus, CurrencyDefault, CurrencyDetails, expenseRoute } from "../constants/constants";
import useApiData from "../hooks/useApiData";
import api from "../utils/backendApi";
import { formatDateTime, formatDay } from "../utils/dates";
import { formatMinor, parseHundredths } from "../utils/money";

function describeBalance(balance) {
  if (balance.net_minor > 0) return { text: `${balance.name} owes you`, tone: "text-green-700" };
  if (balance.net_minor < 0) return { text: `You owe ${balance.name}`, tone: "text-amber-700" };
  return { text: `You and ${balance.name} are even`, tone: "text-gray-500" };
}

// What gets recorded when settling, phrased as the real-world payment
function describePayment(balance, amountMinor) {
  const amount = formatMinor(amountMinor, balance.currency);
  if (balance.net_minor > 0) return `Record that ${balance.name} paid you ${amount}?`;
  if (balance.net_minor < 0) return `Record that you paid ${balance.name} ${amount}?`;
  return `Your ${balance.currency} shares with ${balance.name} cancel out. Mark them all as settled?`;
}

const PaymentMode = Object.freeze({ FULL: "full", PART: "part" });

function BalanceRow({ balance, onSettle }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [mode, setMode] = useState(PaymentMode.FULL);
  const [partText, setPartText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const amountInputId = useId();
  const { text, tone } = describeBalance(balance);
  const owedMinor = Math.abs(balance.net_minor);

  const partMinor = parseHundredths(partText);
  const partError =
    mode !== PaymentMode.PART
      ? null
      : partMinor === null || partMinor <= 0
        ? "Enter how much was paid"
        : partMinor > owedMinor
          ? `That's more than the ${formatMinor(owedMinor, balance.currency)} owed`
          : null;
  const amountMinor = mode === PaymentMode.PART ? partMinor : owedMinor;

  const close = () => {
    setIsConfirming(false);
    setMode(PaymentMode.FULL);
    setPartText("");
  };

  const confirm = async () => {
    setIsSaving(true);
    await onSettle(balance, mode === PaymentMode.PART ? partMinor : null);
    setIsSaving(false);
    close();
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <Avatar name={balance.name} pictureUrl={balance.picture_url} size="lg" />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${tone}`}>{text}</p>
          <p className="text-xs text-gray-500">
            {balance.open_expense_count} open {balance.open_expense_count === 1 ? "expense" : "expenses"}
            {balance.partial_paid_minor > 0 &&
              ` · ${formatMinor(balance.partial_paid_minor, balance.currency)} paid in part`}
          </p>
        </div>
        <p className={`font-semibold tabular-nums ${tone}`}>{formatMinor(owedMinor, balance.currency)}</p>
        {!isConfirming && (
          <button
            type="button"
            onClick={() => setIsConfirming(true)}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white"
          >
            Settle up
          </button>
        )}
      </div>

      {isConfirming && (
        <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">
          {owedMinor > 0 && (
            <div role="radiogroup" aria-label="How much was paid" className="inline-flex rounded-lg bg-gray-200/70 p-0.5">
              {[
                [PaymentMode.FULL, "Full amount"],
                [PaymentMode.PART, "Part of it"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                    mode === value ? "bg-white text-primary shadow-sm" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {mode === PaymentMode.PART && (
            <div>
              <label htmlFor={amountInputId} className="text-sm font-medium">
                Amount paid
              </label>
              <div className="relative mt-1 w-40">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                  {CurrencyDetails[balance.currency].SYMBOL}
                </span>
                <input
                  id={amountInputId}
                  type="text"
                  inputMode="decimal"
                  value={partText}
                  onChange={(event) => setPartText(event.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pr-3 pl-7 text-right tabular-nums focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                />
              </div>
              <span className="mt-1 block text-xs text-gray-500">
                {partError ??
                  (partMinor === owedMinor
                    ? "That's everything, so it settles up in full."
                    : `${formatMinor(owedMinor - partMinor, balance.currency)} will still be owed. The expenses stay open until it's all paid.`)}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="mr-auto text-sm">{partError ? "\u00a0" : describePayment(balance, amountMinor)}</p>
            <button
              type="button"
              onClick={close}
              disabled={isSaving}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={isSaving || Boolean(partError)}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// Currencies aren't converted, so each one gets its own total: "$40 + ₹1,200"
// One past payment. A full settle-up opens to list the expenses it settled, each linking to its page.
function HistoryRow({ settlement, currentUserId }) {
  const [isOpen, setIsOpen] = useState(false);
  const listId = useId();
  const from = settlement.from_user.id === currentUserId ? "You" : settlement.from_user.name;
  const to = settlement.to_user.id === currentUserId ? "you" : settlement.to_user.name;
  const expenses = settlement.expenses ?? [];
  const canOpen = expenses.length > 0;
  // Every expense a settle-up covers was paid by one of its two people
  const payerName = (userId) => {
    if (userId === currentUserId) return "you";
    return userId === settlement.from_user.id ? settlement.from_user.name : settlement.to_user.name;
  };

  const summary = (
    <>
      <span className="min-w-0">
        <span className="block truncate">
          {from} paid {to}
        </span>
        <span className="block text-xs text-gray-500">
          {formatDateTime(settlement.created_at)} ·{" "}
          {settlement.is_partial
            ? "part payment"
            : `settled ${settlement.expense_count} ${settlement.expense_count === 1 ? "expense" : "expenses"}`}
        </span>
      </span>
      <span className="ml-auto font-medium tabular-nums">{formatMinor(settlement.amount_minor, settlement.currency)}</span>
    </>
  );

  return (
    <li className="text-sm">
      {canOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls={listId}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
        >
          {summary}
          <ChevronDownIcon
            className={`size-4 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">{summary}</div>
      )}

      {canOpen && isOpen && (
        <ul id={listId} className="mx-4 mb-3 divide-y divide-gray-100 rounded-lg bg-gray-50">
          {expenses.map((expense) => (
            <li key={expense.id}>
              <Link
                to={expenseRoute(expense.id)}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium hover:text-primary">{expense.description}</span>
                  <span className="block text-xs text-gray-500">
                    {formatDay(expense.spent_on)} · {payerName(expense.paid_by)} paid{" "}
                    {formatMinor(expense.amount_minor, expense.currency)}
                  </span>
                </span>
                <span className="ml-auto shrink-0 text-right text-xs text-gray-500">
                  settled
                  <span className="block text-sm font-medium tabular-nums text-gray-800">
                    {formatMinor(expense.settled_minor, expense.currency)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SummaryCard({ label, totalsByCurrency, tone }) {
  const totals = Object.entries(totalsByCurrency);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      {totals.length === 0 ? (
        <p className="mt-1 text-2xl font-bold text-gray-400 tabular-nums">{formatMinor(0, CurrencyDefault.CODE)}</p>
      ) : (
        <p className={`mt-1 flex flex-wrap gap-x-3 text-2xl font-bold tabular-nums ${tone}`}>
          {totals.map(([currency, amountMinor]) => (
            <span key={currency}>{formatMinor(amountMinor, currency)}</span>
          ))}
        </p>
      )}
    </div>
  );
}

// Adds up balances on one side (owe or owed) per currency, as positive amounts
function totalByCurrency(balances, isOnThisSide) {
  const totals = {};
  for (const balance of balances.filter(isOnThisSide)) {
    totals[balance.currency] = (totals[balance.currency] ?? 0) + Math.abs(balance.net_minor);
  }
  return totals;
}

export default function SettleUp() {
  const { user } = useAuth();
  const balances = useApiData("/balances");
  const history = useApiData("/settlements");
  const [actionError, setActionError] = useState(null);
  const [lastSettledName, setLastSettledName] = useState(null);

  // partMinor is null to settle everything, or the amount of a part payment
  const settle = async (balance, partMinor) => {
    setActionError(null);
    setLastSettledName(null);
    const result = await api.post("/settlements", {
      user_id: balance.user_id,
      currency: balance.currency,
      net_minor: balance.net_minor,
      ...(partMinor !== null && { amount_minor: partMinor }),
    });
    if (result.status === ApiStatus.SUCCESS) {
      setLastSettledName(
        result.data?.is_partial
          ? `Recorded a ${formatMinor(result.data.amount_minor, balance.currency)} payment with ${balance.name}`
          : `Settled up with ${balance.name}`,
      );
    } else {
      setActionError(result.message);
    }
    // Reload either way: on a conflict the fresh balance is what the user needs to see next
    balances.reload();
    history.reload();
  };

  const youOwe = totalByCurrency(balances.data ?? [], (balance) => balance.net_minor < 0);
  const youAreOwed = totalByCurrency(balances.data ?? [], (balance) => balance.net_minor > 0);

  return (
    <section className="max-w-3xl">
      <h1 className="text-2xl font-bold">Settle up</h1>
      <p className="mt-1 text-sm text-gray-600">
        Settling up with someone records the payment and marks every shared expense between you in that
        currency as settled. Dollars and rupees are kept separate.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <SummaryCard label="You owe" totalsByCurrency={youOwe} tone="text-amber-700" />
        <SummaryCard label="You are owed" totalsByCurrency={youAreOwed} tone="text-green-700" />
      </div>

      {(balances.error || actionError) && (
        <p className="mt-4 text-sm text-red-600">{actionError ?? balances.error}</p>
      )}
      {lastSettledName && (
        <p className="mt-4 inline-flex items-center gap-1 text-sm text-green-700">
          <CheckIcon className="size-4" />
          {lastSettledName}
        </p>
      )}

      <h2 className="mt-8 text-lg font-semibold">Balances</h2>
      {balances.isLoading && <p className="mt-2 text-gray-500">Loading...</p>}
      {balances.data?.length === 0 && (
        <p className="mt-2 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          You're all settled up. Nobody owes anybody.
        </p>
      )}
      {balances.data?.length > 0 && (
        <ul className="mt-2 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
          {balances.data.map((balance) => (
            <BalanceRow key={`${balance.user_id}-${balance.currency}`} balance={balance} onSettle={settle} />
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-lg font-semibold">Payment history</h2>
      {history.data?.length === 0 && <p className="mt-2 text-sm text-gray-500">No payments recorded yet.</p>}
      {history.data?.length > 0 && (
        <ul className="mt-2 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
          {history.data.map((settlement) => (
            <HistoryRow key={settlement.id} settlement={settlement} currentUserId={user.id} />
          ))}
        </ul>
      )}
    </section>
  );
}
