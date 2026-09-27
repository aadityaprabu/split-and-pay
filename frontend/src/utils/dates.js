/** Today's date in the user's timezone as "YYYY-MM-DD" (what <input type="date"> and the backend use) */
export function todayIso() {
  const now = new Date();
  const pad = (number) => String(number).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "2026-09-20" → "20 Sep", with the year added when it isn't this year */
export function formatDay(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const options = { day: "numeric", month: "short" };
  if (year !== new Date().getFullYear()) options.year = "numeric";
  return date.toLocaleDateString("en-IN", options);
}

/** A timestamp → "20 Sep, 7:45 pm" */
export function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
