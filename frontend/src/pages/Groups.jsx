import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/authContext";
import Avatar from "../components/Avatar";
import { PencilIcon, PlusIcon, TrashIcon } from "../components/Icons";
import { ApiStatus, AppRoute, Group } from "../constants/constants";
import useApiData from "../hooks/useApiData";
import api from "../utils/backendApi";

const inputClasses =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none";

// Create and edit share this form. You're always in groups you make or edit, so you aren't listed.
function GroupForm({ users, currentUserId, initialGroup, onSaved, onCancel }) {
  const [name, setName] = useState(initialGroup?.name ?? "");
  const [memberIds, setMemberIds] = useState(
    initialGroup?.members.map((member) => member.id).filter((id) => id !== currentUserId) ?? [],
  );
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const others = users.filter((person) => person.id !== currentUserId);

  const toggle = (id) => setMemberIds((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]));

  const save = async (event) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    const body = { name, member_ids: memberIds };
    const result = initialGroup ? await api.put(`/groups/${initialGroup.id}`, body) : await api.post("/groups", body);
    setIsSaving(false);
    if (result.status !== ApiStatus.SUCCESS) {
      setError(result.message);
      return;
    }
    onSaved();
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Name</span>
        <input
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={Group.NAME_MAX_LENGTH}
          placeholder="Goa trip, Electricity, Kitchen..."
          autoFocus
          className={`mt-1 ${inputClasses}`}
        />
      </label>
      <fieldset>
        <legend className="text-sm font-medium">
          Members <span className="font-normal text-gray-500">(you're always in it)</span>
        </legend>
        {others.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">Nobody else has signed in yet.</p>
        ) : (
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {others.map((person) => (
              <li key={person.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={memberIds.includes(person.id)}
                    onChange={() => toggle(person.id)}
                    className="size-4 accent-primary"
                  />
                  <Avatar name={person.name} pictureUrl={person.picture_url} size="sm" />
                  <span className="min-w-0 truncate text-sm">{person.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving || name.trim() === ""}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSaving ? "Saving..." : initialGroup ? "Save group" : "Create group"}
        </button>
      </div>
    </form>
  );
}

function GroupRow({ group, currentUserId, onEdit, onDeleted }) {
  const [error, setError] = useState(null);
  const others = group.members.filter((member) => member.id !== currentUserId);
  // Only whoever made the group can rename it, change its members or delete it
  const isCreator = group.created_by === currentUserId;

  const remove = async () => {
    if (!window.confirm(`Delete the group "${group.name}"?`)) return;
    setError(null);
    const result = await api.delete(`/groups/${group.id}`);
    if (result.status !== ApiStatus.SUCCESS) {
      setError(result.message);
      return;
    }
    onDeleted();
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to={`${AppRoute.EXPENSES}?group=${group.id}`}
            className="block truncate font-medium hover:text-primary hover:underline"
          >
            {group.name}
          </Link>
          <p className="truncate text-xs text-gray-500">
            You{others.length > 0 && `, ${others.map((member) => member.name).join(", ")}`} ·{" "}
            {group.expense_count} {group.expense_count === 1 ? "expense" : "expenses"}
          </p>
        </div>
        <div className="hidden -space-x-2 sm:flex" aria-hidden="true">
          {group.members.slice(0, 5).map((member) => (
            <span key={member.id} className="rounded-full ring-2 ring-white">
              <Avatar name={member.name} pictureUrl={member.picture_url} size="sm" />
            </span>
          ))}
        </div>
        {isCreator && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${group.name}`}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <PencilIcon className="size-4" />
          </button>
        )}
        {isCreator && group.expense_count === 0 && (
          <button
            type="button"
            onClick={remove}
            aria-label={`Delete ${group.name}`}
            className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
          >
            <TrashIcon className="size-4" />
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}

export default function Groups() {
  const { user } = useAuth();
  const groups = useApiData("/groups");
  const users = useApiData("/users");
  // null: just the list; "new": the create form; a group id: editing that group
  const [editing, setEditing] = useState(null);

  const done = () => {
    setEditing(null);
    groups.reload();
  };

  const error = groups.error ?? users.error;
  const editingGroup = groups.data?.find((group) => group.id === editing);

  return (
    <section className="max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Groups</h1>
          <p className="mt-1 text-sm text-gray-600">
            Keep a trip or a set of bills together. Only a group's members see its expenses. Balances and settling up
            still cover everything between two people.
          </p>
        </div>
        {editing === null && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            <PlusIcon className="size-4" />
            New group
          </button>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {editing !== null && users.data && (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">{editingGroup ? `Edit ${editingGroup.name}` : "New group"}</h2>
          <GroupForm
            key={editing}
            users={users.data}
            currentUserId={user.id}
            initialGroup={editingGroup}
            onSaved={done}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {groups.isLoading && <p className="mt-6 text-gray-500">Loading...</p>}
      {groups.data?.length === 0 && editing === null && (
        <p className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          No groups yet. Expenses without a group are shared with the whole flat.
        </p>
      )}
      {groups.data?.length > 0 && (
        <ul className="mt-6 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
          {groups.data.map((group) => (
            <GroupRow
              key={group.id}
              group={group}
              currentUserId={user.id}
              onEdit={() => setEditing(group.id)}
              onDeleted={groups.reload}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
