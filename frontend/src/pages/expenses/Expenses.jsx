import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/authContext";
import ExpenseCard from "../../components/ExpenseCard";
import { PlusIcon } from "../../components/Icons";
import { ApiStatus, AppRoute } from "../../constants/constants";
import useApiData from "../../hooks/useApiData";
import api from "../../utils/backendApi";

export default function Expenses() {
  const { user } = useAuth();
  const { data: expenses, error, isLoading, reload } = useApiData("/expenses");
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

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Link
          to={AppRoute.NEW_EXPENSE}
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
        <p className="mt-6 text-sm text-gray-500">No expenses yet. Create the first one above.</p>
      )}
    </section>
  );
}
