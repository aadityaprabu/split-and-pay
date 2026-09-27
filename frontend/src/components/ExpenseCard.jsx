import { formatDay } from "../utils/dates";
import { formatBasisPoints, formatMinor } from "../utils/money";
import Avatar from "./Avatar";
import { CheckIcon, TrashIcon } from "./Icons";

function ShareStatus({ split, isPayer }) {
  if (isPayer) {
    return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Paid</span>;
  }
  if (split.settled_at) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <CheckIcon className="size-3" />
        Settled
      </span>
    );
  }
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Owes</span>;
}

// One line from the signed-in user's point of view, like Splitwise's "you lent" / "you borrowed"
function YourPosition({ expense, currentUserId }) {
  const format = (amountMinor) => formatMinor(amountMinor, expense.currency);
  const yourSplit = expense.splits.find((split) => split.user_id === currentUserId);

  if (expense.paid_by.id === currentUserId) {
    const lentMinor = expense.splits
      .filter((split) => split.user_id !== currentUserId)
      .reduce((total, split) => total + split.amount_minor, 0);
    if (lentMinor === 0) return <p className="text-sm text-gray-500">Just you</p>;
    return <p className="text-sm font-medium text-green-700">You lent {format(lentMinor)}</p>;
  }
  if (!yourSplit) return <p className="text-sm text-gray-500">You're not involved</p>;
  if (yourSplit.settled_at) {
    return <p className="text-sm text-gray-500">You paid back {format(yourSplit.amount_minor)}</p>;
  }
  return <p className="text-sm font-medium text-amber-700">You owe {format(yourSplit.amount_minor)}</p>;
}

export default function ExpenseCard({ expense, currentUserId, onDelete, isDeleting }) {
  const isFullySettled = expense.splits.every((split) => split.settled_at);
  const hasSettledShares = expense.splits.some((split) => split.settlement_id);
  const canDelete =
    (expense.created_by === currentUserId || expense.paid_by.id === currentUserId) && !hasSettledShares;
  const payerName = expense.paid_by.id === currentUserId ? "you" : expense.paid_by.name;

  return (
    <article className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{expense.description}</h3>
          <p className="text-xs text-gray-500">
            {formatDay(expense.spent_on)} · Paid by {payerName}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold">{formatMinor(expense.amount_minor, expense.currency)}</p>
          {isFullySettled && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
              <CheckIcon className="size-3" />
              Settled
            </span>
          )}
        </div>
      </header>

      <div className="mt-2">
        <YourPosition expense={expense} currentUserId={currentUserId} />
      </div>

      <ul className="mt-3 flex-1 space-y-2 border-t border-gray-100 pt-3">
        {expense.splits.map((split) => (
          <li key={split.user_id} className="flex items-center gap-2 text-sm">
            <Avatar name={split.name} pictureUrl={split.picture_url} size="sm" />
            <span className="min-w-0 flex-1 truncate">
              {split.user_id === currentUserId ? "You" : split.name}
              {split.basis_points && (
                <span className="ml-1 text-xs text-gray-400">{formatBasisPoints(split.basis_points)}</span>
              )}
            </span>
            <span className="tabular-nums">{formatMinor(split.amount_minor, expense.currency)}</span>
            <ShareStatus split={split} isPayer={split.user_id === expense.paid_by.id} />
          </li>
        ))}
      </ul>

      {canDelete && (
        <footer className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => onDelete(expense)}
            disabled={isDeleting}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <TrashIcon className="size-3.5" />
            Delete
          </button>
        </footer>
      )}
    </article>
  );
}
