import { useState } from "react";
import { Link } from "react-router-dom";
import { expenseRoute } from "../constants/constants";
import { formatDay } from "../utils/dates";
import { formatBasisPoints, formatMinor } from "../utils/money";
import Avatar from "./Avatar";
import { ChatIcon, CheckIcon, PaperclipIcon, TrashIcon, UsersIcon } from "./Icons";

// Long splits are cut to this many rows so tiles in the grid stay a similar height
const VISIBLE_SPLITS = 4;

// One line from the signed-in user's point of view, like Splitwise's "you lent" / "you borrowed"
export function YourPosition({ expense, currentUserId }) {
  const format = (amountMinor) => formatMinor(amountMinor, expense.currency);
  const yourSplit = expense.splits.find((split) => split.user_id === currentUserId);

  let label;
  let amountMinor = null;
  let tone = "text-gray-500";
  if (expense.paid_by.id === currentUserId) {
    const lentMinor = expense.splits
      .filter((split) => split.user_id !== currentUserId)
      .reduce((total, split) => total + split.amount_minor, 0);
    if (lentMinor === 0) {
      label = "Just you";
    } else {
      label = "You lent";
      amountMinor = lentMinor;
      tone = "text-green-700";
    }
  } else if (!yourSplit) {
    label = "You're not involved";
  } else if (yourSplit.settled_at) {
    label = "You paid back";
    amountMinor = yourSplit.amount_minor;
  } else {
    label = "You owe";
    amountMinor = yourSplit.amount_minor;
    tone = "text-amber-700";
  }

  return (
    <p className={`text-sm ${tone}`}>
      {label}
      {amountMinor !== null && (
        <>
          {" "}
          <span className="font-semibold tabular-nums">{format(amountMinor)}</span>
        </>
      )}
    </p>
  );
}

export function SplitRow({ split, expense, currentUserId }) {
  const isPayer = split.user_id === expense.paid_by.id;
  const isSettled = !isPayer && Boolean(split.settled_at);
  return (
    <li className="flex items-center gap-2 text-sm">
      <Avatar name={split.name} pictureUrl={split.picture_url} size="sm" />
      <span className="min-w-0 flex-1 truncate text-gray-700">
        {split.user_id === currentUserId ? "You" : split.name}
        {split.basis_points && <span className="ml-1 text-xs text-gray-400">{formatBasisPoints(split.basis_points)}</span>}
        {isPayer && <span className="ml-1.5 text-xs text-gray-400">paid</span>}
      </span>
      {isSettled && (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-green-700">
          <CheckIcon className="size-3.5" />
          <span className="sr-only @[17rem]:not-sr-only">Settled</span>
        </span>
      )}
      {!isPayer && !isSettled && <span className="sr-only text-xs text-amber-700 @[17rem]:not-sr-only">Owes</span>}
      <span className={`shrink-0 text-right tabular-nums @[17rem]:min-w-16 ${isSettled || isPayer ? "text-gray-400" : "text-gray-900"}`}>
        {formatMinor(split.amount_minor, expense.currency)}
      </span>
    </li>
  );
}

export default function ExpenseCard({ expense, currentUserId, onDelete, isDeleting }) {
  const [showAllSplits, setShowAllSplits] = useState(false);
  const isFullySettled = expense.splits.every((split) => split.settled_at);
  const hasSettledShares = expense.splits.some((split) => split.settlement_id);
  const canDelete =
    (expense.created_by === currentUserId || expense.paid_by.id === currentUserId) &&
    !hasSettledShares &&
    !expense.has_part_payment;
  const payerName = expense.paid_by.id === currentUserId ? "you" : expense.paid_by.name;

  const owedShares = expense.splits.filter((split) => split.user_id !== expense.paid_by.id);
  const settledShareCount = owedShares.filter((split) => split.settled_at).length;
  const hiddenSplitCount = expense.splits.length - VISIBLE_SPLITS;
  const visibleSplits = showAllSplits ? expense.splits : expense.splits.slice(0, VISIBLE_SPLITS);
  const peopleCount = expense.splits.length;

  return (
    <article
      className={`@container relative flex flex-col rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md ${
        isFullySettled ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"
      }`}
    >
      <header className="flex flex-col-reverse gap-1 @[17rem]:flex-row @[17rem]:items-start @[17rem]:justify-between @[17rem]:gap-4">
        <div className="min-w-0">
          <h3 className="line-clamp-2 font-semibold text-balance break-words text-gray-900">
            {/* The link covers the whole tile; the buttons inside sit above it */}
            <Link
              to={expenseRoute(expense.id)}
              className="rounded after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-primary"
            >
              {expense.description}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {formatDay(expense.spent_on)} · Paid by {payerName}
          </p>
          {expense.group && (
            <p className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              <UsersIcon className="size-3 shrink-0" />
              <span className="truncate">{expense.group.name}</span>
            </p>
          )}
        </div>
        <p
          className={`shrink-0 text-xl font-semibold tracking-tight tabular-nums ${
            isFullySettled ? "text-gray-500" : "text-gray-900"
          }`}
        >
          {formatMinor(expense.amount_minor, expense.currency)}
        </p>
      </header>

      <div className="mt-3">
        <YourPosition expense={expense} currentUserId={currentUserId} />
      </div>

      <ul className="mt-3 space-y-2 border-t border-gray-100 pt-3">
        {visibleSplits.map((split) => (
          <SplitRow key={split.user_id} split={split} expense={expense} currentUserId={currentUserId} />
        ))}
      </ul>
      {hiddenSplitCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAllSplits((shown) => !shown)}
          aria-expanded={showAllSplits}
          className="relative mt-2 self-start rounded text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {showAllSplits ? "Show less" : `+${hiddenSplitCount} more`}
        </button>
      )}

      <footer className="mt-auto flex min-h-8 flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-4">
        <p className="flex items-center gap-3 text-xs text-gray-500">
          {isFullySettled ? (
            <span className="inline-flex items-center gap-1 font-medium text-green-700">
              <CheckIcon className="size-3.5" />
              Settled
            </span>
          ) : owedShares.length > 0 ? (
            `${settledShareCount} of ${owedShares.length} ${owedShares.length === 1 ? "share" : "shares"} settled`
          ) : (
            `${peopleCount} ${peopleCount === 1 ? "person" : "people"}`
          )}
          {expense.attachment_count > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Receipts">
              <PaperclipIcon className="size-3.5" />
              <span className="sr-only">Receipts:</span>
              {expense.attachment_count}
            </span>
          )}
          {expense.comment_count > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Comments">
              <ChatIcon className="size-3.5" />
              <span className="sr-only">Comments:</span>
              {expense.comment_count}
            </span>
          )}
        </p>
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(expense)}
            disabled={isDeleting}
            className="relative inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-50"
          >
            <TrashIcon className="size-3.5" />
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        )}
      </footer>
    </article>
  );
}
