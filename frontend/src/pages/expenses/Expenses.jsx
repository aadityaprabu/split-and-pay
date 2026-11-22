import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/authContext";
import ExpenseCard from "../../components/ExpenseCard";
import { PlusIcon } from "../../components/Icons";
import { ApiStatus, AppRoute } from "../../constants/constants";
import useApiData from "../../hooks/useApiData";
import api from "../../utils/backendApi";

export default function Expenses() {
  const { user } = useAuth();
  // The chosen group lives in the URL (?group=<id> or ?group=none), so back and refresh keep it
  const [searchParams, setSearchParams] = useSearchParams();
  const groupFilter = searchParams.get("group");
  const { data: groups } = useApiData("/groups");
  const { data: expenses, error, isLoading, reload } = useApiData(
    groupFilter ? `/expenses?group_id=${encodeURIComponent(groupFilter)}` : "/expenses",
  );
  const [deletingId, setDeletingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const handleDelete = async (expense) => {
    if (!window.confirm(`Delete "${expense.description}"? Everyone's share of it goes away too.`)) return;
    setActionError(null);
    setDeletingId(expense.id);
    const result = await api.delete(`/expenses/${expense.id}`);
    setDeletingId(null);
    if (result.status !== ApiStatus.SUCCESS) setActionError(result.message);
    reload();
  };

  return (
    <section>
      <h1 className="text-2xl font-bold">Expenses</h1>
      <p className="mt-1 text-sm text-gray-600">Everything the flat has split, newest first.</p>
      {(error || actionError) && <p className="mt-3 text-sm text-red-600">{actionError ?? error}</p>}

      {groups?.length > 0 && (
        <nav aria-label="Filter by group" className="mt-5 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[{ id: null, name: "All" }, ...groups, { id: "none", name: "No group" }].map((group) => {
            const isActive = groupFilter === group.id;
            return (
              <button
                key={group.id ?? "all"}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSearchParams(group.id ? { group: group.id } : {})}
                className={`shrink-0 rounded-full border px-3 py-1 text-sm transition-colors ${
                  isActive
                    ? "border-primary bg-primary text-white"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {group.name}
              </button>
            );
          })}
        </nav>
      )}

      <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4">
        <Link
          to={AppRoute.NEW_EXPENSE}
          state={groupFilter && groupFilter !== "none" ? { groupId: groupFilter } : undefined}
          className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-white p-4 text-primary transition-colors hover:border-primary hover:bg-primary/5"
        >
          <span className="grid size-12 place-items-center rounded-full bg-primary/10">
            <PlusIcon className="size-6" />
          </span>
          <span className="font-semibold">Create an expense</span>
        </Link>

        {expenses?.map((expense) => (
          <ExpenseCard
            key={expense.id}
            expense={expense}
            currentUserId={user.id}
            onDelete={handleDelete}
            isDeleting={deletingId === expense.id}
          />
        ))}
      </div>

      {isLoading && <p className="mt-6 text-gray-500">Loading...</p>}
      {expenses?.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">
          {groupFilter ? "No expenses here yet." : "No expenses yet. Create the first one above."}
        </p>
      )}
    </section>
  );
}
