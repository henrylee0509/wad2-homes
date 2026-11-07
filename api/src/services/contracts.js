// Contract lifecycle: which contracts need a reminder, recording reminders,
// extending contracts, and ending contracts nobody extended.
import { today, addDays, daysBetween, isDate } from "../utils/dates.js";
import { HttpError, getEmployee } from "./employees.js";

const REMINDER_STATUSES = ["sent", "logged", "failed", "no_recipient"];

// Who should decide on the contract: the direct manager, else the department head, else HR
function recipientFor(row, hrEmail) {
  return row.manager_email || row.head_email || hrEmail || null;
}

// Active contracts ending within `daysBefore` days that haven't had a reminder for this end date.
// Failed sends are retried (they're returned again until a reminder is recorded as sent/logged).
export function dueReminders(db, on = today()) {
  const daysBefore = Number(db.getSetting("reminder_days_before")) || 30;
  const until = addDays(on, daysBefore);
  const hrEmail = db.getSetting("hr_email");
  const appUrl = (process.env.WEB_URL || db.getSetting("app_url") || "").replace(/\/$/, "");
  const rows = db
    .prepare(
      `SELECT e.id, e.employee_no, e.first_name, e.last_name, e.email, e.job_title, e.start_date, e.contract_end_date,
              d.name AS department_name,
              m.first_name || ' ' || m.last_name AS manager_name, m.email AS manager_email,
              h.first_name || ' ' || h.last_name AS head_name, h.email AS head_email
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN employees m ON m.id = e.manager_id
         LEFT JOIN employees h ON h.id = d.head_employee_id
        WHERE e.status = 'active'
          AND e.contract_end_date IS NOT NULL
          AND e.contract_end_date BETWEEN :on AND :until
          AND NOT EXISTS (SELECT 1 FROM contract_reminders r
                           WHERE r.employee_id = e.id AND r.contract_end_date = e.contract_end_date
                             AND r.status IN ('sent', 'logged', 'no_recipient'))
        ORDER BY e.contract_end_date`,
    )
    .all({ on, until });

  return rows.map((r) => {
    const recipient = recipientFor(r, hrEmail);
    return {
      employee_id: r.id,
      employee_no: r.employee_no,
      employee_name: `${r.first_name} ${r.last_name}`,
      job_title: r.job_title,
      department_name: r.department_name,
      start_date: r.start_date,
      contract_end_date: r.contract_end_date,
      days_left: daysBetween(on, r.contract_end_date),
      recipient,
      recipient_name: r.manager_email ? r.manager_name : r.head_email ? r.head_name : "HR",
      review_url: appUrl ? `${appUrl}/employees/${r.id}?review=contract` : null,
    };
  });
}

// The notifier reports back after trying to send a reminder
export function recordReminder(db, input) {
  const employeeId = Number(input.employee_id);
  if (!employeeId || !isDate(input.contract_end_date)) throw new HttpError(400, "employee_id and contract_end_date are required.");
  if (!REMINDER_STATUSES.includes(input.status)) throw new HttpError(400, `status must be one of ${REMINDER_STATUSES.join(", ")}.`);
  if (!db.prepare("SELECT 1 FROM employees WHERE id = ?").get(employeeId)) throw new HttpError(404, "Employee not found.");
  db.prepare(
    `INSERT INTO contract_reminders (employee_id, contract_end_date, recipient, status, error)
     VALUES (@employee_id, @contract_end_date, @recipient, @status, @error)
     ON CONFLICT (employee_id, contract_end_date) DO UPDATE SET
       recipient = excluded.recipient, status = excluded.status, error = excluded.error, sent_at = datetime('now')`,
  ).run({ employee_id: employeeId, contract_end_date: input.contract_end_date, recipient: input.recipient || null, status: input.status, error: input.error || null });
  return db.prepare("SELECT * FROM contract_reminders WHERE employee_id = ? AND contract_end_date = ?").get(employeeId, input.contract_end_date);
}

export function listReminders(db, { limit = 100 } = {}) {
  return db
    .prepare(
      `SELECT r.*, e.first_name || ' ' || e.last_name AS employee_name, e.employee_no, d.name AS department_name
         FROM contract_reminders r
         JOIN employees e ON e.id = r.employee_id
         LEFT JOIN departments d ON d.id = e.department_id
        ORDER BY r.sent_at DESC, r.id DESC
        LIMIT ?`,
    )
    .all(Number(limit) || 100);
}

// Contracts ending in the next `days` days (for the dashboard and contracts page)
export function upcomingContracts(db, days = 90, on = today()) {
  const until = addDays(on, Number(days) || 90);
  return db
    .prepare(
      `SELECT e.id, e.employee_no, e.first_name || ' ' || e.last_name AS employee_name, e.job_title, e.contract_end_date,
              e.employment_type, d.name AS department_name,
              COALESCE(m.first_name || ' ' || m.last_name, h.first_name || ' ' || h.last_name) AS decider_name,
              r.status AS reminder_status, r.sent_at AS reminder_sent_at, r.recipient AS reminder_recipient, r.decision
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN employees m ON m.id = e.manager_id
         LEFT JOIN employees h ON h.id = d.head_employee_id
         LEFT JOIN contract_reminders r ON r.employee_id = e.id AND r.contract_end_date = e.contract_end_date
        WHERE e.status = 'active' AND e.contract_end_date IS NOT NULL AND e.contract_end_date BETWEEN ? AND ?
        ORDER BY e.contract_end_date`,
    )
    .all(on, until)
    .map((r) => ({ ...r, days_left: daysBetween(on, r.contract_end_date) }));
}

export function contractHistory(db, employeeId) {
  return db.prepare("SELECT * FROM contract_history WHERE employee_id = ? ORDER BY changed_at DESC, id DESC").all(Number(employeeId));
}

// Extend a contract to a new end date, or make the employee permanent
export function extendContract(db, employeeId, { new_end_date, make_permanent, note }, changedBy) {
  const emp = getEmployee(db, employeeId);
  if (emp.status !== "active") throw new HttpError(409, "Only active employees can have their contract extended.");
  const oldEnd = emp.contract_end_date;
  return db.tx(() => {
    if (make_permanent) {
      db.prepare("UPDATE employees SET employment_type = 'permanent', contract_end_date = NULL, updated_at = datetime('now') WHERE id = ?").run(emp.id);
      db.prepare("INSERT INTO contract_history (employee_id, action, old_end_date, new_end_date, note, changed_by) VALUES (?, 'made_permanent', ?, NULL, ?, ?)").run(emp.id, oldEnd, note || null, changedBy);
    } else {
      if (!isDate(new_end_date)) throw new HttpError(400, "Choose the new contract end date.");
      if (oldEnd && new_end_date <= oldEnd) throw new HttpError(400, "The new end date must be after the current one.");
      if (new_end_date <= today()) throw new HttpError(400, "The new end date must be in the future.");
      db.prepare("UPDATE employees SET employment_type = CASE WHEN employment_type = 'permanent' THEN 'contract' ELSE employment_type END, contract_end_date = ?, updated_at = datetime('now') WHERE id = ?").run(new_end_date, emp.id);
      db.prepare("INSERT INTO contract_history (employee_id, action, old_end_date, new_end_date, note, changed_by) VALUES (?, 'extended', ?, ?, ?, ?)").run(emp.id, oldEnd, new_end_date, note || null, changedBy);
    }
    if (oldEnd) db.prepare("UPDATE contract_reminders SET decision = 'extended', decided_at = datetime('now') WHERE employee_id = ? AND contract_end_date = ?").run(emp.id, oldEnd);
    return getEmployee(db, emp.id);
  });
}

// Record that the contract will not be renewed. Nothing else changes: it simply ends on its date.
export function markNotRenewing(db, employeeId, { note }, changedBy) {
  const emp = getEmployee(db, employeeId);
  if (!emp.contract_end_date) throw new HttpError(400, "This employee has no contract end date.");
  db.tx(() => {
    db.prepare("INSERT INTO contract_history (employee_id, action, old_end_date, new_end_date, note, changed_by) VALUES (?, 'not_renewed', ?, ?, ?, ?)").run(emp.id, emp.contract_end_date, emp.contract_end_date, note || null, changedBy);
    db.prepare(
      `INSERT INTO contract_reminders (employee_id, contract_end_date, recipient, status, decision, decided_at)
       VALUES (?, ?, NULL, 'logged', 'ending', datetime('now'))
       ON CONFLICT (employee_id, contract_end_date) DO UPDATE SET decision = 'ending', decided_at = datetime('now')`,
    ).run(emp.id, emp.contract_end_date);
  });
  return getEmployee(db, emp.id);
}

// Contracts whose end date has passed without an extension end automatically ("do nothing" = let go).
// This frees the headcount slot.
export function expireContracts(db, on = today()) {
  const expired = db.prepare("SELECT id, contract_end_date FROM employees WHERE status = 'active' AND contract_end_date IS NOT NULL AND contract_end_date < ?").all(on);
  if (!expired.length) return 0;
  db.tx(() => {
    for (const e of expired) {
      db.prepare("UPDATE employees SET status = 'contract_ended', updated_at = datetime('now') WHERE id = ?").run(e.id);
      db.prepare("INSERT INTO contract_history (employee_id, action, old_end_date, new_end_date, note, changed_by) VALUES (?, 'ended', ?, ?, 'Contract ended without extension', 'system')").run(e.id, e.contract_end_date, e.contract_end_date);
    }
  });
  return expired.length;
}
