import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/authContext";
import { ApiStatus } from "../constants/constants";
import api from "../utils/backendApi";

function PersonRow({ email, name, pictureUrl, badge, detail, action }) {
  return (
    <li className="flex items-center gap-3 py-3">
      {pictureUrl ? (
        <img src={pictureUrl} alt="" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-full" />
      ) : (
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-gray-100 font-medium text-gray-500">
          {email[0].toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name ?? email}</p>
        <p className="truncate text-sm text-gray-500">{detail ?? (name ? email : "Hasn't signed in yet")}</p>
      </div>
      {badge && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{badge}</span>}
      {action}
    </li>
  );
}

export default function Admin() {
  const { user, refreshUser } = useAuth();
  const [adminEmail, setAdminEmail] = useState(null);
  const [allowedEmails, setAllowedEmails] = useState(null);
  const [newEmail, setNewEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadAllowedEmails = useCallback(async () => {
    const result = await api.get("/admin/allowed-emails");
    if (result.status !== ApiStatus.SUCCESS) {
      setErrorMessage(result.message);
      return;
    }
    setAdminEmail(result.data.adminEmail);
    setAllowedEmails(result.data.allowedEmails);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on mount
    loadAllowedEmails();
  }, [loadAllowedEmails]);

  // Returns whether it worked. Adding or removing the admin's own email changes whether they can
  // split expenses, so the signed-in user is re-read to update the sidebar.
  const addEmail = async (email) => {
    setIsSaving(true);
    setErrorMessage(null);
    const result = await api.post("/admin/allowed-emails", { email });
    setIsSaving(false);
    if (result.status !== ApiStatus.SUCCESS) {
      setErrorMessage(result.message);
      return false;
    }
    await loadAllowedEmails();
    if (email.trim().toLowerCase() === adminEmail) await refreshUser();
    return true;
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    if (await addEmail(newEmail)) setNewEmail("");
  };

  const handleRemove = async (email) => {
    const isOwnEmail = email === adminEmail;
    const question = isOwnEmail
      ? "Stop taking part in splits? You'll still manage access, and your past expenses stay."
      : `Remove ${email}? They'll be signed out and can't sign back in.`;
    if (!window.confirm(question)) return;
    setErrorMessage(null);
    const result = await api.delete(`/admin/allowed-emails/${encodeURIComponent(email)}`);
    if (result.status !== ApiStatus.SUCCESS) {
      setErrorMessage(result.message);
      return;
    }
    await loadAllowedEmails();
    if (isOwnEmail) await refreshUser();
  };

  const roommates = allowedEmails?.filter((person) => person.email !== adminEmail) ?? [];

  return (
    <section className="max-w-lg">
      <h1 className="text-2xl font-bold">Who can sign in</h1>
      <p className="mt-1 text-sm text-gray-600">
        Only these Google accounts can sign in, and everyone on the list can split expenses. Being admin
        only means managing this list: join splits yourself if you're one of the roommates.
      </p>

      <form onSubmit={handleAdd} className="mt-6 flex gap-2">
        <input
          type="email"
          required
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          placeholder="roommate@gmail.com"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-primary px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {errorMessage && <p className="mt-2 text-sm text-red-600">{errorMessage}</p>}

      {allowedEmails === null ? (
        <p className="mt-6 text-gray-500">Loading...</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white px-4">
          <PersonRow
            email={adminEmail}
            name="You"
            pictureUrl={user.picture_url}
            badge="Admin"
            detail={user.is_participant ? "Also splitting expenses" : "Managing access only"}
            action={
              user.is_participant ? (
                <button
                  type="button"
                  onClick={() => handleRemove(adminEmail)}
                  className="rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                >
                  Leave splits
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => addEmail(adminEmail)}
                  disabled={isSaving}
                  className="rounded-lg bg-primary/10 px-2 py-1 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                >
                  Join splits
                </button>
              )
            }
          />
          {roommates.map((person) => (
            <PersonRow
              key={person.email}
              email={person.email}
              name={person.name}
              pictureUrl={person.picture_url}
              action={
                <button
                  type="button"
                  onClick={() => handleRemove(person.email)}
                  className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              }
            />
          ))}
          {roommates.length === 0 && (
            <li className="py-3 text-sm text-gray-500">No one else yet. Add your roommates above.</li>
          )}
        </ul>
      )}
    </section>
  );
}
