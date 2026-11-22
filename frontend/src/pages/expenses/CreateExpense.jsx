import { useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/authContext";
import Avatar from "../../components/Avatar";
import { CheckIcon, FileIcon, PaperclipIcon, XIcon } from "../../components/Icons";
import {
  ApiStatus,
  AppRoute,
  Attachment,
  CurrencyDefault,
  CurrencyDetails,
  Expense,
  SplitType,
  expenseRoute,
} from "../../constants/constants";
import useApiData from "../../hooks/useApiData";
import api from "../../utils/backendApi";
import { todayIso } from "../../utils/dates";
import { formatBytes, uploadReceipt } from "../../utils/files";
import { formatMinor, hundredthsToText, parseHundredths } from "../../utils/money";
import { equalBasisPoints, previewShares } from "../../utils/splits";

const steps = ["Participants", "Amount", "Split"];

const splitOptions = [
  { type: SplitType.EQUAL, label: "Split equally" },
  { type: SplitType.PERCENT, label: "By percentage" },
  { type: SplitType.EXACT, label: "By exact amount" },
];

const inputClasses =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none";

function StepIndicator({ currentStep }) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      {steps.map((label, index) => {
        const isDone = index < currentStep;
        const isCurrent = index === currentStep;
        return (
          <li key={label} className="flex items-center gap-2">
            {index > 0 && <span className={`h-px w-6 ${isDone || isCurrent ? "bg-primary" : "bg-gray-300"}`} />}
            <span
              className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${
                isDone || isCurrent ? "bg-primary text-white" : "bg-gray-200 text-gray-500"
              }`}
            >
              {isDone ? <CheckIcon className="size-3.5" /> : index + 1}
            </span>
            <span className={isCurrent ? "font-medium" : "hidden text-gray-500 sm:inline"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ParticipantsStep({ users, groups, groupId, onGroupChange, currentUserId, selectedIds, onToggle, onToggleAll }) {
  const allSelected = users.every((person) => selectedIds.includes(person.id));
  return (
    <>
      {groups.length > 0 && (
        <label className="mb-5 block">
          <span className="text-sm font-medium">Group</span>
          <select value={groupId} onChange={(event) => onGroupChange(event.target.value)} className={`mt-1 ${inputClasses}`}>
            <option value="">No group (the whole flat)</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Who's splitting this?</h2>
        <button type="button" onClick={onToggleAll} className="text-sm font-medium text-primary hover:underline">
          {allSelected ? "Clear" : "Select everyone"}
        </button>
      </div>
      <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {users.map((person) => {
          const isSelected = selectedIds.includes(person.id);
          return (
            <li key={person.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(person.id)}
                  className="size-4 accent-primary"
                />
                <Avatar name={person.name} pictureUrl={person.picture_url} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {person.name}
                    {person.id === currentUserId && <span className="font-normal text-gray-500"> (you)</span>}
                  </span>
                  <span className="block truncate text-xs text-gray-500">{person.email}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-gray-500">
        {groupId
          ? "Only the group's members are listed. Change who's in it from the Groups page."
          : "Roommates show up here once they've signed in for the first time."}
      </p>
    </>
  );
}

// Receipts picked before the expense exists; they're uploaded right after it's created
function PendingReceipts({ files, onAdd, onRemove }) {
  const inputRef = useRef(null);
  return (
    <div className="sm:col-span-2">
      <span className="text-sm font-medium">
        Receipt <span className="font-normal text-gray-500">(optional, for reference)</span>
      </span>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <FileIcon className="size-4 shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="text-xs text-gray-400 tabular-nums">{formatBytes(file.size)}</span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={`Remove ${file.name}`}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length < Attachment.MAX_PER_EXPENSE && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:border-primary hover:text-primary"
          >
            <PaperclipIcon className="size-4" />
            Attach a photo or PDF of the bill
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={Attachment.ACCEPT}
            multiple
            hidden
            data-testid="receipt-input"
            onChange={(event) => {
              onAdd([...event.target.files]);
              event.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}

function AmountStep({ users, currentUserId, details, onChange, isEditing, pendingFiles, onAddFiles, onRemoveFile }) {
  return (
    <>
      <h2 className="text-lg font-semibold">What was it, and how much?</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="text-sm font-medium">Description</span>
          <input
            type="text"
            value={details.description}
            onChange={(event) => onChange({ description: event.target.value })}
            maxLength={Expense.DESCRIPTION_MAX_LENGTH}
            placeholder="Groceries, electricity bill, pizza..."
            autoFocus
            className={`mt-1 ${inputClasses}`}
          />
        </label>
        <div>
          <label htmlFor="expense-amount" className="text-sm font-medium">
            Amount
          </label>
          <div className="mt-1 flex rounded-lg focus-within:ring-2 focus-within:ring-primary/20">
            <select
              aria-label="Currency"
              value={details.currency}
              onChange={(event) => onChange({ currency: event.target.value })}
              className="rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-2 text-sm font-medium focus:border-primary focus:outline-none"
            >
              {Object.entries(CurrencyDetails).map(([code, currencyDetails]) => (
                <option key={code} value={code}>
                  {currencyDetails.LABEL}
                </option>
              ))}
            </select>
            <input
              id="expense-amount"
              type="text"
              inputMode="decimal"
              value={details.amountText}
              onChange={(event) => onChange({ amountText: event.target.value })}
              placeholder="0.00"
              className="w-full min-w-0 rounded-r-lg border border-gray-300 bg-white px-3 py-2 text-lg font-semibold tabular-nums focus:border-primary focus:outline-none"
            />
          </div>
        </div>
        <label>
          <span className="text-sm font-medium">Paid by</span>
          <select
            value={details.paidBy}
            onChange={(event) => onChange({ paidBy: event.target.value })}
            className={`mt-1 ${inputClasses}`}
          >
            {users.map((person) => (
              <option key={person.id} value={person.id}>
                {person.id === currentUserId ? `${person.name} (you)` : person.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-medium">Date</span>
          <input
            type="date"
            value={details.spentOn}
            onChange={(event) => onChange({ spentOn: event.target.value })}
            className={`mt-1 ${inputClasses}`}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm font-medium">
            Notes <span className="font-normal text-gray-500">(optional)</span>
          </span>
          <textarea
            value={details.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            maxLength={Expense.NOTES_MAX_LENGTH}
            rows={2}
            placeholder="Anything worth remembering: what was included, who to remind..."
            className={`mt-1 resize-y ${inputClasses}`}
          />
        </label>
        {!isEditing && <PendingReceipts files={pendingFiles} onAdd={onAddFiles} onRemove={onRemoveFile} />}
      </div>
    </>
  );
}

function SplitStep({ participants, currentUserId, amountMinor, currency, split, preview, onSplitTypeChange, onInputChange }) {
  const { shares, error } = preview;
  const format = (minor) => formatMinor(minor, currency);

  return (
    <>
      <h2 className="text-lg font-semibold">How should {format(amountMinor)} be split?</h2>
      <div role="radiogroup" aria-label="Split method" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">
        {splitOptions.map((option) => (
          <button
            key={option.type}
            type="button"
            role="radio"
            aria-checked={split.type === option.type}
            onClick={() => onSplitTypeChange(option.type)}
            className={`rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
              split.type === option.type ? "bg-white text-primary shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {participants.map((person, index) => (
          <li key={person.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={person.name} pictureUrl={person.picture_url} />
            <span className="min-w-0 flex-1 truncate font-medium">
              {person.id === currentUserId ? "You" : person.name}
            </span>
            {split.type === SplitType.PERCENT && (
              <div className="relative w-24">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`${person.name}'s percentage`}
                  value={split.percentTexts[person.id] ?? ""}
                  onChange={(event) => onInputChange("percentTexts", person.id, event.target.value)}
                  className={`${inputClasses} pr-7 text-right tabular-nums`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500">%</span>
              </div>
            )}
            {split.type === SplitType.EXACT && (
              <div className="relative w-32">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                  {CurrencyDetails[currency].SYMBOL}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`${person.name}'s amount`}
                  value={split.exactTexts[person.id] ?? ""}
                  onChange={(event) => onInputChange("exactTexts", person.id, event.target.value)}
                  className={`${inputClasses} pl-7 text-right tabular-nums`}
                />
              </div>
            )}
            {split.type !== SplitType.EXACT && (
              <span className="w-24 text-right font-medium tabular-nums">{format(shares[index].amountMinor)}</span>
            )}
          </li>
        ))}
      </ul>

      <p className={`mt-2 text-sm ${error ? "text-amber-700" : "text-green-700"}`}>
        {error ?? `Adds up to ${format(amountMinor)}`}
      </p>
    </>
  );
}

// What the form starts with: empty for a new expense, the saved values when editing
function initialFormState(expense, userId, groupId) {
  if (!expense) {
    return {
      selectedIds: [userId],
      details: {
        description: "",
        amountText: "",
        currency: CurrencyDefault.CODE,
        paidBy: userId,
        spentOn: todayIso(),
        notes: "",
        groupId: groupId ?? "",
      },
      split: { type: SplitType.EQUAL, percentTexts: {}, exactTexts: {} },
    };
  }
  const textsBy = (field) =>
    Object.fromEntries(
      expense.splits.filter((share) => share[field] !== null).map((share) => [share.user_id, hundredthsToText(share[field])]),
    );
  return {
    selectedIds: expense.splits.map((share) => share.user_id),
    details: {
      description: expense.description,
      amountText: hundredthsToText(expense.amount_minor),
      currency: expense.currency,
      paidBy: expense.paid_by.id,
      spentOn: expense.spent_on,
      notes: expense.notes ?? "",
      groupId: expense.group?.id ?? "",
    },
    split: {
      type: expense.split_type,
      percentTexts: expense.split_type === SplitType.PERCENT ? textsBy("basis_points") : {},
      exactTexts: expense.split_type === SplitType.EXACT ? textsBy("amount_minor") : {},
    },
  };
}

function ExpenseForm({ allUsers, groups, expense }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditing = Boolean(expense);
  // Coming from a group's list starts the new expense in that group
  const startingGroupId = groups.some((group) => group.id === location.state?.groupId) ? location.state.groupId : null;
  const initial = initialFormState(expense, user.id, startingGroupId);

  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState(initial.selectedIds);
  const [details, setDetails] = useState(initial.details);
  const [split, setSplit] = useState(initial.split);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // In a group, only its members can be on the expense
  const group = groups.find((candidate) => candidate.id === details.groupId) ?? null;
  const memberIds = group ? new Set(group.members.map((member) => member.id)) : null;
  const users = memberIds ? allUsers.filter((person) => memberIds.has(person.id)) : allUsers;

  // Keep participants in the same order as the list, so the split rows match what was ticked
  const participants = users.filter((person) => selectedIds.includes(person.id));
  const amountMinor = parseHundredths(details.amountText);

  // Changing who's in resets typed percentages/amounts: they were for a different set of people
  const resetSplitInputs = () => setSplit((current) => ({ ...current, percentTexts: {}, exactTexts: {} }));
  const toggleParticipant = (userId) => {
    setSelectedIds((ids) => (ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]));
    resetSplitInputs();
  };
  const toggleEveryone = () => {
    const allSelected = users.every((person) => selectedIds.includes(person.id));
    setSelectedIds(allSelected ? [] : users.map((person) => person.id));
    resetSplitInputs();
  };
  const changeGroup = (groupId) => {
    const nextGroup = groups.find((candidate) => candidate.id === groupId);
    const nextMemberIds = nextGroup ? new Set(nextGroup.members.map((member) => member.id)) : null;
    const inGroup = (id) => !nextMemberIds || nextMemberIds.has(id);
    setSelectedIds((ids) => ids.filter(inGroup));
    setDetails((current) => ({ ...current, groupId, paidBy: inGroup(current.paidBy) ? current.paidBy : user.id }));
    resetSplitInputs();
  };

  const changeSplitType = (type) => {
    setSplit((current) => {
      // Start percentages at an even split, so there's always a valid 100% to adjust from
      if (type === SplitType.PERCENT && Object.keys(current.percentTexts).length === 0) {
        const basisPoints = equalBasisPoints(participants.length);
        const percentTexts = Object.fromEntries(
          participants.map((person, index) => [person.id, hundredthsToText(basisPoints[index])]),
        );
        return { ...current, type, percentTexts };
      }
      return { ...current, type };
    });
  };
  const changeSplitInput = (field, userId, text) => {
    setSplit((current) => ({ ...current, [field]: { ...current[field], [userId]: text } }));
  };

  const stepError = [
    participants.length === 0 ? "Pick at least one person" : null,
    details.description.trim() === ""
      ? "Add a description"
      : amountMinor === null || amountMinor <= 0
        ? "Enter an amount, like 450 or 99.50"
        : !details.spentOn
          ? "Pick a date"
          : null,
    null,
  ][step];

  // What each person will owe, shown live on the split step and checked before submitting
  const splitPreview = previewShares({
    amountMinor: amountMinor ?? 0,
    currency: details.currency,
    splitType: split.type,
    participants: participants.map((person) => ({
      userId: person.id,
      basisPoints: parseHundredths(split.percentTexts[person.id]) ?? 0,
      amountMinor: parseHundredths(split.exactTexts[person.id]) ?? 0,
    })),
  });

  const handleSubmit = async () => {
    setSubmitError(null);
    setIsSubmitting(true);
    const body = {
      description: details.description.trim(),
      amount_minor: amountMinor,
      currency: details.currency,
      paid_by: details.paidBy,
      spent_on: details.spentOn,
      notes: details.notes.trim() || null,
      group_id: details.groupId || null,
      split_type: split.type,
      participants: participants.map((person) => ({
        user_id: person.id,
        ...(split.type === SplitType.PERCENT && { basis_points: parseHundredths(split.percentTexts[person.id]) }),
        ...(split.type === SplitType.EXACT && { amount_minor: parseHundredths(split.exactTexts[person.id]) }),
      })),
    };
    const result = isEditing ? await api.put(`/expenses/${expense.id}`, body) : await api.post("/expenses", body);
    if (result.status !== ApiStatus.SUCCESS) {
      setIsSubmitting(false);
      setSubmitError(result.message);
      return;
    }
    if (isEditing) {
      navigate(expenseRoute(expense.id));
      return;
    }

    // The expense is saved either way; a receipt that didn't upload can be retried from its page
    const uploads = await Promise.all(pendingFiles.map((file) => uploadReceipt(api, result.data.id, file)));
    const failed = uploads.find((upload) => upload.status !== ApiStatus.SUCCESS);
    if (failed) {
      navigate(expenseRoute(result.data.id), {
        state: { notice: `The expense was saved, but a receipt didn't upload: ${failed.message}` },
      });
      return;
    }
    navigate(AppRoute.EXPENSES);
  };

  return (
    <section className="max-w-2xl">
      <Link
        to={isEditing ? expenseRoute(expense.id) : AppRoute.EXPENSES}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        ← {isEditing ? "Back to the expense" : "Back to expenses"}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{isEditing ? "Edit expense" : "Create an expense"}</h1>
      <div className="mt-4">
        <StepIndicator currentStep={step} />
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50/50 p-4 sm:p-6">
        {step === 0 && (
          <ParticipantsStep
            users={users}
            groups={groups}
            groupId={details.groupId}
            onGroupChange={changeGroup}
            currentUserId={user.id}
            selectedIds={selectedIds}
            onToggle={toggleParticipant}
            onToggleAll={toggleEveryone}
          />
        )}
        {step === 1 && (
          <AmountStep
            users={users}
            currentUserId={user.id}
            details={details}
            onChange={(changes) => setDetails((current) => ({ ...current, ...changes }))}
            isEditing={isEditing}
            pendingFiles={pendingFiles}
            onAddFiles={(files) =>
              setPendingFiles((current) => [...current, ...files].slice(0, Attachment.MAX_PER_EXPENSE))
            }
            onRemoveFile={(index) => setPendingFiles((current) => current.filter((_, i) => i !== index))}
          />
        )}
        {step === 2 && (
          <SplitStep
            participants={participants}
            currentUserId={user.id}
            amountMinor={amountMinor}
            currency={details.currency}
            split={split}
            preview={splitPreview}
            onSplitTypeChange={changeSplitType}
            onInputChange={changeSplitInput}
          />
        )}

        {submitError && <p className="mt-4 text-sm text-red-600">{submitError}</p>}

        <div className="mt-6 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Back
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            {stepError && <span className="hidden text-xs text-gray-500 sm:inline">{stepError}</span>}
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={Boolean(stepError)}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={Boolean(splitPreview.error) || isSubmitting}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isEditing
                  ? isSubmitting
                    ? "Saving..."
                    : "Save changes"
                  : isSubmitting
                    ? "Creating..."
                    : "Create expense"}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Creates an expense at /expenses/new, or edits one at /expenses/:id/edit */
export default function CreateExpense() {
  const { id: editingId } = useParams();
  const users = useApiData("/users");
  const groups = useApiData("/groups");
  const expense = useApiData(editingId ? `/expenses/${editingId}` : null);

  const error = users.error ?? groups.error ?? expense.error;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!users.data || !groups.data || (editingId && !expense.data)) return <p className="text-gray-500">Loading...</p>;

  const isSettled = expense.data?.splits.some((share) => share.settlement_id);
  if (isSettled || expense.data?.has_part_payment) {
    return (
      <section className="max-w-2xl">
        <h1 className="text-2xl font-bold">Edit expense</h1>
        <p className="mt-2 text-sm text-gray-600">
          {isSettled
            ? "Someone has already settled part of this expense, so it can't be changed."
            : "A part payment has been made towards this expense, so it can't be changed until it's settled in full."}{" "}
          Comments and receipts can still be added.
        </p>
        <Link to={expenseRoute(editingId)} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          ← Back to the expense
        </Link>
      </section>
    );
  }

  // Keyed by expense so the form starts fresh when moving between expenses
  return <ExpenseForm key={editingId ?? "new"} allUsers={users.data} groups={groups.data} expense={expense.data} />;
}
