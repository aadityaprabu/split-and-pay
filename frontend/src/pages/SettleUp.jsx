import { useState } from "react";
import { useAuth } from "../auth/authContext";
import Avatar from "../components/Avatar";
import { CheckIcon } from "../components/Icons";
import { ApiStatus, CurrencyDefault } from "../constants/constants";
import useApiData from "../hooks/useApiData";
import api from "../utils/backendApi";
import { formatDateTime } from "../utils/dates";
import { formatMinor } from "../utils/money";

function describeBalance(balance) {
  if (balance.net_minor > 0) return { text: `${balance.name} owes you`, tone: "text-green-700" };
  if (balance.net_minor < 0) return { text: `You owe ${balance.name}`, tone: "text-amber-700" };
  return { text: `You and ${balance.name} are even`, tone: "text-gray-500" };
}

// What gets recorded when settling, phrased as the real-world payment
function describePayment(balance) {
  const amount = formatMinor(Math.abs(balance.net_minor), balance.currency);
  if (balance.net_minor > 0) return `Record that ${balance.name} paid you ${amount}?`;
  if (balance.net_minor < 0) return `Record that you paid ${balance.name} ${amount}?`;
  return `Your ${balance.currency} shares with ${balance.name} cancel out. Mark them all as settled?`;
}

function BalanceRow({ balance, onSettle }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { text, tone } = describeBalance(balance);

  const confirm = async () => {
    setIsSaving(true);
    await onSettle(balance);
    setIsSaving(false);
    setIsConfirming(false);
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <Avatar name={balance.name} pictureUrl={balance.picture_url} size="lg" />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${tone}`}>{text}</p>
          <p className="text-xs text-gray-500">
            {balance.open_expense_count} open {balance.open_expense_count === 1 ? "expense" : "expenses"}
          </p>
        </div>
        <p className={`font-semibold tabular-nums ${tone}`}>{formatMinor(Math.abs(balance.net_minor), balance.currency)}</p>
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
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 rounded-lg bg-gray-50 p-3">
          <p className="mr-auto text-sm">{describePayment(balance)}</p>
          <button
            type="button"
            onClick={() => setIsConfirming(false)}
            disabled={isSaving}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={isSaving}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Confirm"}
          </button>
        </div>
      )}
    </li>
  );
}

// Currencies aren't converted, so each one gets its own total: "$40 + ₹1,200"
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

  const settle = async (balance) => {
    setActionError(null);
    setLastSettledName(null);
    const result = await api.post("/settlements", {
      user_id: balance.user_id,
      currency: balance.currency,
      net_minor: balance.net_minor,
    });
    if (result.status === ApiStatus.SUCCESS) {
      setLastSettledName(balance.name);
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
          Settled up with {lastSettledName}
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
          {history.data.map((settlement) => {
            const from = settlement.from_user.id === user.id ? "You" : settlement.from_user.name;
            const to = settlement.to_user.id === user.id ? "you" : settlement.to_user.name;
            return (
              <li key={settlement.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate">
                    {from} paid {to}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDateTime(settlement.created_at)} · settled {settlement.expense_count}{" "}
                    {settlement.expense_count === 1 ? "expense" : "expenses"}
                  </p>
                </div>
                <span className="font-medium tabular-nums">{formatMinor(settlement.amount_minor, settlement.currency)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
