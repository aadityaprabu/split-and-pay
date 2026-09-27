import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/authContext";
import Avatar from "../../components/Avatar";
import { CheckIcon } from "../../components/Icons";
import { ApiStatus, AppRoute, CurrencyDefault, CurrencyDetails, Expense, SplitType } from "../../constants/constants";
import useApiData from "../../hooks/useApiData";
import api from "../../utils/backendApi";
import { todayIso } from "../../utils/dates";
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

function ParticipantsStep({ users, currentUserId, selectedIds, onToggle, onToggleAll }) {
  const allSelected = selectedIds.length === users.length;
  return (
    <>
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
        Roommates show up here once they've signed in for the first time.
      </p>
    </>
  );
}

function AmountStep({ users, currentUserId, details, onChange }) {
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

export default function CreateExpense() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: users, error: usersError } = useApiData("/users");

  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState([user.id]);
  const [details, setDetails] = useState({
    description: "",
    amountText: "",
    currency: CurrencyDefault.CODE,
    paidBy: user.id,
    spentOn: todayIso(),
  });
  const [split, setSplit] = useState({ type: SplitType.EQUAL, percentTexts: {}, exactTexts: {} });
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (usersError) return <p className="text-sm text-red-600">{usersError}</p>;
  if (!users) return <p className="text-gray-500">Loading...</p>;

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
    setSelectedIds(selectedIds.length === users.length ? [] : users.map((person) => person.id));
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
    const result = await api.post("/expenses", {
      description: details.description.trim(),
      amount_minor: amountMinor,
      currency: details.currency,
      paid_by: details.paidBy,
      spent_on: details.spentOn,
      split_type: split.type,
      participants: participants.map((person) => ({
        user_id: person.id,
        ...(split.type === SplitType.PERCENT && { basis_points: parseHundredths(split.percentTexts[person.id]) }),
        ...(split.type === SplitType.EXACT && { amount_minor: parseHundredths(split.exactTexts[person.id]) }),
      })),
    });
    setIsSubmitting(false);
    if (result.status !== ApiStatus.SUCCESS) {
      setSubmitError(result.message);
      return;
    }
    navigate(AppRoute.EXPENSES);
  };

  return (
    <section className="max-w-2xl">
      <Link to={AppRoute.EXPENSES} className="text-sm text-gray-500 hover:text-gray-700">
        ← Back to expenses
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Create an expense</h1>
      <div className="mt-4">
        <StepIndicator currentStep={step} />
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50/50 p-4 sm:p-6">
        {step === 0 && (
          <ParticipantsStep
            users={users}
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
                {isSubmitting ? "Creating..." : "Create expense"}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
