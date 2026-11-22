import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/authContext";
import Avatar from "../components/Avatar";
import { ApiStatus, Transactions as TransactionsConfig } from "../constants/constants";
import useApiData from "../hooks/useApiData";
import api from "../utils/backendApi";
import { formatDay, formatMonth } from "../utils/dates";
import { formatMinor } from "../utils/money";

const NO_FILTERS = Object.freeze({ from: "", to: "", search: "", personId: "" });

/** The filters as a query string, leaving out the empty ones */
function toQuery({ from, to, search, personId }) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (search.trim()) params.set("q", search.trim());
  if (personId) params.set("person", personId);
  return params.toString();
}

const withQuery = (endpoint, query) => (query ? `${endpoint}?${query}` : endpoint);

// The title box only reaches the server once typing pauses
function useDebounced(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * The first page for the current filters, plus loadMore() to append the next one.
 * Each page remembers which query it belongs to, so a reply for old filters is dropped.
 */
function useTransactionPages(query) {
  const [state, setState] = useState({ query: null, items: [], hasMore: false, error: null });
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    api.get(withQuery("/transactions", query)).then((result) => {
      if (!isCurrent) return;
      setState(
        result.status === ApiStatus.SUCCESS
          ? { query, items: result.data.items, hasMore: result.data.has_more, error: null }
          : { query, items: [], hasMore: false, error: result.message },
      );
    });
    return () => {
      isCurrent = false;
    };
  }, [query]);

  const loadMore = async () => {
    setIsLoadingMore(true);
    const pageQuery = new URLSearchParams(query);
    pageQuery.set("offset", String(state.items.length));
    const result = await api.get(withQuery("/transactions", pageQuery.toString()));
    setIsLoadingMore(false);
    setState((previous) => {
      if (previous.query !== query) return previous;
      if (result.status !== ApiStatus.SUCCESS) return { ...previous, error: result.message };
      // An expense added meanwhile shifts the pages by one; skip anything already shown
      const shownIds = new Set(previous.items.map((item) => item.id));
      const newItems = result.data.items.filter((item) => !shownIds.has(item.id));
      return { ...previous, items: [...previous.items, ...newItems], hasMore: result.data.has_more, error: null };
    });
  };

  return {
    items: state.query === query ? state.items : [],
    hasMore: state.query === query && state.hasMore,
    error: state.query === query ? state.error : null,
    isLoading: state.query !== query,
    isLoadingMore,
    loadMore,
  };
}

function FilterBar({ filters, onChange, people }) {
  const field = "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm";
  const set = (name) => (event) => onChange({ ...filters, [name]: event.target.value });
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="mt-6 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm font-medium text-gray-700">
        From
        <input type="date" value={filters.from} max={filters.to || undefined} onChange={set("from")} className={field} />
      </label>
      <label className="text-sm font-medium text-gray-700">
        To
        <input type="date" value={filters.to} min={filters.from || undefined} onChange={set("to")} className={field} />
      </label>
      <label className="text-sm font-medium text-gray-700">
        Title
        <input
          type="search"
          value={filters.search}
          onChange={set("search")}
          placeholder="e.g. rent"
          maxLength={100}
          className={field}
        />
      </label>
      <label className="text-sm font-medium text-gray-700">
        Person
        <select value={filters.personId} onChange={set("personId")} className={field}>
          <option value="">Anyone</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      {hasFilters && (
        <button
          type="button"
          onClick={() => onChange(NO_FILTERS)}
          className="justify-self-start text-sm font-medium text-primary hover:underline sm:col-span-2 lg:col-span-4"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// The API gives one row per month and currency; this shows one row per month with each currency inside
function MonthlySummary({ rows, error, isLoading }) {
  const months = useMemo(() => {
    const byMonth = new Map();
    for (const row of rows ?? []) {
      const month = byMonth.get(row.month) ?? { month: row.month, count: 0, currencies: [] };
      month.count += row.transaction_count;
      month.currencies.push(row);
      byMonth.set(row.month, month);
    }
    return [...byMonth.values()];
  }, [rows]);

  return (
    <section aria-labelledby="monthly-summary" className="mt-6">
      <h2 id="monthly-summary" className="text-lg font-semibold">
        Monthly summary
      </h2>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {isLoading && <p className="mt-2 text-sm text-gray-500">Loading...</p>}
      {rows?.length === 0 && <p className="mt-2 text-sm text-gray-500">Nothing to sum up for these filters.</p>}
      {months.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Month</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Transactions</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">You paid</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Your share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {months.map((month) => (
                <tr key={month.month}>
                  <th scope="row" className="px-4 py-2 text-left font-medium">{formatMonth(month.month)}</th>
                  <td className="px-4 py-2 text-right tabular-nums">{month.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {month.currencies.map((row) => (
                      <span key={row.currency} className="block">{formatMinor(row.paid_minor, row.currency)}</span>
                    ))}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {month.currencies.map((row) => (
                      <span key={row.currency} className="block">{formatMinor(row.share_minor, row.currency)}</span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TransactionRow({ transaction, currentUserId }) {
  const youPaid = transaction.paid_by.id === currentUserId;
  const others = transaction.participants.filter((person) => person.id !== currentUserId);
  const format = (amountMinor) => formatMinor(amountMinor, transaction.currency);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar name={transaction.paid_by.name} pictureUrl={transaction.paid_by.picture_url} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{transaction.description}</p>
        <p className="truncate text-xs text-gray-500">
          {formatDay(transaction.spent_on)} · {youPaid ? "You paid" : `${transaction.paid_by.name} paid`}
          {others.length > 0 && ` · with ${others.map((person) => person.name).join(", ")}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold tabular-nums">{format(transaction.amount_minor)}</p>
        <p className="text-xs text-gray-500 tabular-nums">
          {transaction.my_share_minor > 0 ? `Your share ${format(transaction.my_share_minor)}` : "Not your share"}
        </p>
      </div>
    </li>
  );
}

/** Every expense the signed-in user paid for or has a share in, with a monthly summary and filters */
export default function Transactions() {
  const { user } = useAuth();
  const [filters, setFilters] = useState(NO_FILTERS);
  const search = useDebounced(filters.search, TransactionsConfig.SEARCH_DEBOUNCE_MS);
  const query = toQuery({ ...filters, search });

  const users = useApiData("/users");
  const summary = useApiData(withQuery("/transactions/summary", query));
  const pages = useTransactionPages(query);
  const people = (users.data ?? []).filter((person) => person.id !== user.id);

  return (
    <section>
      <h1 className="text-2xl font-bold">My transactions</h1>
      <p className="mt-1 text-sm text-gray-600">Every expense you paid for or have a share in, newest first.</p>

      <FilterBar filters={filters} onChange={setFilters} people={people} />
      <MonthlySummary rows={summary.data} error={summary.error} isLoading={summary.isLoading} />

      <section aria-labelledby="transaction-list" className="mt-8">
        <h2 id="transaction-list" className="text-lg font-semibold">
          Transactions
        </h2>
        {pages.error && <p className="mt-2 text-sm text-red-600">{pages.error}</p>}
        {pages.isLoading && <p className="mt-2 text-sm text-gray-500">Loading...</p>}
        {!pages.isLoading && !pages.error && pages.items.length === 0 && (
          <p className="mt-2 text-sm text-gray-500">No transactions match these filters.</p>
        )}
        {pages.items.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
            {pages.items.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} currentUserId={user.id} />
            ))}
          </ul>
        )}
        {pages.hasMore && (
          <button
            type="button"
            onClick={pages.loadMore}
            disabled={pages.isLoadingMore}
            className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {pages.isLoadingMore
              ? "Loading..."
              : pages.items.length <= TransactionsConfig.PAGE_SIZE
                ? "Show more"
                : "Load more"}
          </button>
        )}
      </section>
    </section>
  );
}
