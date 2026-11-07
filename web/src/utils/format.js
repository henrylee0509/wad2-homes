// Display helpers

export const money = (n) =>
  new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(Number(n) || 0);

export function date(iso) {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function dateTime(sqlDate) {
  if (!sqlDate) return "–";
  const dt = new Date(sqlDate.replace(" ", "T") + (sqlDate.endsWith("Z") ? "" : "Z"));
  return dt.toLocaleString("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export const EMPLOYMENT_TYPES = { permanent: "Permanent", contract: "Contract", part_time: "Part-time", intern: "Intern" };
export const STATUSES = { active: "Active", resigned: "Resigned", terminated: "Terminated", contract_ended: "Contract ended" };
export const LEAVE_TYPES = { annual: "Annual", sick: "Sick", unpaid: "Unpaid", other: "Other" };
export const REMINDER_STATUSES = { sent: "Emailed", logged: "Logged (no SMTP)", failed: "Failed, will retry", no_recipient: "No one to email" };

export const statusClass = (s) => ({ active: "success", resigned: "secondary", terminated: "danger", contract_ended: "secondary" })[s] || "secondary";

export function contractLabel(days) {
  if (days == null) return "";
  if (days < 0) return `Ended ${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  return `Ends in ${days} days`;
}
export const contractClass = (days) => (days == null ? "" : days <= 14 ? "danger" : days <= 30 ? "warning" : "info");

export const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

export function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function addMonthsIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last));
  return dt.toISOString().slice(0, 10);
}
