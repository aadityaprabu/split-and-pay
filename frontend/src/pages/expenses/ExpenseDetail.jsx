import { useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/authContext";
import Avatar from "../../components/Avatar";
import { SplitRow, YourPosition } from "../../components/ExpenseCard";
import { CheckIcon, FileIcon, PaperclipIcon, PencilIcon, TrashIcon, UsersIcon, XIcon } from "../../components/Icons";
import { ApiStatus, AppRoute, Attachment, Comment, editExpenseRoute } from "../../constants/constants";
import useApiData from "../../hooks/useApiData";
import api from "../../utils/backendApi";
import { formatDateTime, formatDay } from "../../utils/dates";
import { attachmentUrl, formatBytes, uploadReceipt } from "../../utils/files";
import { formatMinor } from "../../utils/money";

const sectionHeading = "text-sm font-semibold text-gray-900";

function Receipts({ expense, currentUserId, onChange }) {
  const inputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const canManageAll = [expense.created_by, expense.paid_by.id].includes(currentUserId);
  const roomLeft = Attachment.MAX_PER_EXPENSE - expense.attachments.length;

  const upload = async (files) => {
    setError(null);
    setIsUploading(true);
    for (const file of files.slice(0, roomLeft)) {
      const result = await uploadReceipt(api, expense.id, file);
      if (result.status !== ApiStatus.SUCCESS) setError(result.message);
    }
    setIsUploading(false);
    onChange();
  };

  const remove = async (attachment) => {
    if (!window.confirm(`Remove ${attachment.file_name}?`)) return;
    setError(null);
    const result = await api.delete(`/expenses/${expense.id}/attachments/${attachment.id}`);
    if (result.status !== ApiStatus.SUCCESS) setError(result.message);
    onChange();
  };

  return (
    <section aria-labelledby="receipts-heading">
      <h2 id="receipts-heading" className={sectionHeading}>
        Receipts
      </h2>
      {expense.attachments.length === 0 && (
        <p className="mt-1 text-sm text-gray-500">Keep a photo or PDF of the bill here for reference.</p>
      )}
      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
        {expense.attachments.map((attachment) => {
          const url = attachmentUrl(expense.id, attachment.id);
          const isImage = attachment.content_type.startsWith("image/");
          const canRemove = canManageAll || attachment.uploaded_by === currentUserId;
          return (
            <li key={attachment.id} className="group relative">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-xl border border-gray-200 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {isImage ? (
                  <img
                    src={url}
                    alt={attachment.file_name}
                    loading="lazy"
                    className="aspect-[3/4] w-full bg-gray-100 object-cover"
                  />
                ) : (
                  <span className="grid aspect-[3/4] w-full place-items-center bg-gray-50 text-gray-400">
                    <FileIcon className="size-10" />
                  </span>
                )}
                <span className="block border-t border-gray-100 px-2 py-1.5">
                  <span className="block truncate text-xs font-medium text-gray-700">{attachment.file_name}</span>
                  <span className="block text-[0.6875rem] text-gray-400 tabular-nums">
                    {formatBytes(attachment.byte_size)}
                  </span>
                </span>
              </a>
              {canRemove && (
                <button
                  type="button"
                  onClick={() => remove(attachment)}
                  aria-label={`Remove ${attachment.file_name}`}
                  className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-white/90 text-gray-600 shadow-sm hover:text-red-600"
                >
                  <XIcon className="size-4" />
                </button>
              )}
            </li>
          );
        })}
        {roomLeft > 0 && (
          <li>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white p-2 text-center text-xs font-medium text-gray-500 hover:border-primary hover:text-primary disabled:opacity-60"
            >
              <PaperclipIcon className="size-6" />
              {isUploading ? "Uploading..." : "Add a photo or PDF"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={Attachment.ACCEPT}
              multiple
              hidden
              onChange={(event) => {
                upload([...event.target.files]);
                event.target.value = "";
              }}
            />
          </li>
        )}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

function Comments({ expense, currentUserId, onChange }) {
  const [text, setText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState(null);

  const post = async (event) => {
    event.preventDefault();
    setError(null);
    setIsPosting(true);
    const result = await api.post(`/expenses/${expense.id}/comments`, { body: text });
    setIsPosting(false);
    if (result.status !== ApiStatus.SUCCESS) {
      setError(result.message);
      return;
    }
    setText("");
    onChange();
  };

  const remove = async (comment) => {
    if (!window.confirm("Delete your comment?")) return;
    const result = await api.delete(`/expenses/${expense.id}/comments/${comment.id}`);
    if (result.status !== ApiStatus.SUCCESS) setError(result.message);
    onChange();
  };

  return (
    <section aria-labelledby="comments-heading">
      <h2 id="comments-heading" className={sectionHeading}>
        Comments
      </h2>
      {expense.comments.length > 0 && (
        <ul className="mt-3 space-y-4">
          {expense.comments.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <Avatar name={comment.user.name} pictureUrl={comment.user.picture_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{comment.user.id === currentUserId ? "You" : comment.user.name}</span>
                  <span className="text-xs text-gray-400">{formatDateTime(comment.created_at)}</span>
                  {comment.user.id === currentUserId && (
                    <button
                      type="button"
                      onClick={() => remove(comment)}
                      className="text-xs text-gray-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  )}
                </p>
                <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-gray-700">{comment.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={post} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Add a comment</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={Comment.BODY_MAX_LENGTH}
            rows={2}
            placeholder="Add a comment..."
            className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={isPosting || text.trim() === ""}
          className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPosting ? "Posting..." : "Post"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

export default function ExpenseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: expense, error, reload } = useApiData(`/expenses/${id}`);
  const [actionError, setActionError] = useState(null);

  if (error && !expense) {
    return (
      <section>
        <p className="text-sm text-red-600">{error}</p>
        <Link to={AppRoute.EXPENSES} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
          ← Back to expenses
        </Link>
      </section>
    );
  }
  if (!expense) return <p className="text-gray-500">Loading...</p>;

  const isFullySettled = expense.splits.every((split) => split.settled_at);
  const hasSettledShares = expense.splits.some((split) => split.settlement_id);
  const isOwner = expense.created_by === user.id || expense.paid_by.id === user.id;
  const canChange = isOwner && !hasSettledShares && !expense.has_part_payment;
  const payerName = expense.paid_by.id === user.id ? "you" : expense.paid_by.name;

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${expense.description}"? Everyone's share of it goes away too.`)) return;
    setActionError(null);
    const result = await api.delete(`/expenses/${expense.id}`);
    if (result.status !== ApiStatus.SUCCESS) {
      setActionError(result.message);
      return;
    }
    navigate(AppRoute.EXPENSES);
  };

  return (
    <article className="max-w-2xl">
      <Link to={AppRoute.EXPENSES} className="text-sm text-gray-500 hover:text-gray-700">
        ← Back to expenses
      </Link>

      {location.state?.notice && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{location.state.notice}</p>
      )}

      <header className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {expense.group && (
            <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              <UsersIcon className="size-3.5" />
              {expense.group.name}
            </p>
          )}
          <h1 className="text-2xl font-bold text-balance break-words">{expense.description}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {formatDay(expense.spent_on)} · Paid by {payerName}
            {expense.updated_at && " · edited"}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {formatMinor(expense.amount_minor, expense.currency)}
          </p>
          {isFullySettled && (
            <p className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-green-700">
              <CheckIcon className="size-4" />
              Settled
            </p>
          )}
        </div>
      </header>

      {isOwner && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canChange ? (
            <>
              <Link
                to={editExpenseRoute(expense.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
              >
                <PencilIcon className="size-4" />
                Edit
              </Link>
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600"
              >
                <TrashIcon className="size-4" />
                Delete
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-500">
              {hasSettledShares
                ? "Part of this is settled, so it can't be edited or deleted."
                : "A part payment has been made towards this, so it can't be edited or deleted until it's settled in full."}
            </p>
          )}
        </div>
      )}
      {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}

      <div className="mt-6 space-y-8 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
        <section aria-labelledby="split-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="split-heading" className={sectionHeading}>
              Split
            </h2>
            <YourPosition expense={expense} currentUserId={user.id} />
          </div>
          <ul className="@container mt-3 space-y-2">
            {expense.splits.map((split) => (
              <SplitRow key={split.user_id} split={split} expense={expense} currentUserId={user.id} />
            ))}
          </ul>
        </section>

        {expense.notes && (
          <section aria-labelledby="notes-heading">
            <h2 id="notes-heading" className={sectionHeading}>
              Notes
            </h2>
            <p className="mt-1 text-sm break-words whitespace-pre-wrap text-gray-700">{expense.notes}</p>
          </section>
        )}

        <Receipts expense={expense} currentUserId={user.id} onChange={reload} />
        <Comments expense={expense} currentUserId={user.id} onChange={reload} />
      </div>
    </article>
  );
}
