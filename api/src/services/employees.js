// Employee queries, validation and headcount rules.
import { today, ageOn, daysBetween, isDate } from "../utils/dates.js";

export const EMPLOYMENT_TYPES = ["permanent", "contract", "part_time", "intern"];
export const STATUSES = ["active", "resigned", "terminated", "contract_ended"];
export const LEAVE_TYPES = ["annual", "sick", "unpaid", "other"];

const FIELDS = [
  "employee_no", "first_name", "last_name", "date_of_birth", "gender", "email", "phone", "address",
  "emergency_contact_name", "emergency_contact_phone", "department_id", "job_title", "manager_id",
  "employment_type", "start_date", "contract_end_date", "salary", "annual_leave_days", "status", "notes",
];

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const BASE_SELECT = `
  SELECT e.*,
         d.name AS department_name,
         m.first_name || ' ' || m.last_name AS manager_name,
         m.email AS manager_email,
         COALESCE((SELECT SUM(l.days) FROM leave_records l
                   WHERE l.employee_id = e.id AND l.leave_type = 'annual'
                     AND substr(l.start_date, 1, 4) = :year), 0) AS annual_leave_taken
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN employees m ON m.id = e.manager_id`;

// Adds computed fields: full name, age, leave remaining, days until contract end
export function decorate(row, on = today()) {
  if (!row) return row;
  const leaveRemaining = Math.max(0, Number(row.annual_leave_days) - Number(row.annual_leave_taken || 0));
  return {
    ...row,
    full_name: `${row.first_name} ${row.last_name}`,
    age: ageOn(row.date_of_birth, on),
    annual_leave_taken: Number(row.annual_leave_taken || 0),
    leave_remaining: leaveRemaining,
    days_to_contract_end: row.contract_end_date ? daysBetween(on, row.contract_end_date) : null,
  };
}

export function listEmployees(db, { search, departmentId, status, employmentType } = {}) {
  const where = [];
  const params = { year: today().slice(0, 4) };
  if (search) {
    where.push(`(e.first_name || ' ' || e.last_name LIKE :search OR e.employee_no LIKE :search
                 OR e.email LIKE :search OR e.job_title LIKE :search OR e.phone LIKE :search)`);
    params.search = `%${search}%`;
  }
  if (departmentId) { where.push("e.department_id = :departmentId"); params.departmentId = Number(departmentId); }
  if (status) { where.push("e.status = :status"); params.status = status; }
  if (employmentType) { where.push("e.employment_type = :employmentType"); params.employmentType = employmentType; }
  const sql = `${BASE_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY e.first_name, e.last_name`;
  return db.prepare(sql).all(params).map((r) => decorate(r));
}

export function getEmployee(db, id) {
  const row = db.prepare(`${BASE_SELECT} WHERE e.id = :id`).get({ id: Number(id), year: today().slice(0, 4) });
  if (!row) throw new HttpError(404, "Employee not found.");
  return decorate(row);
}

export function activeCount(db, departmentId, excludeEmployeeId = null) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM employees WHERE department_id = ? AND status = 'active' AND id != ?")
    .get(departmentId, excludeEmployeeId ?? -1).n;
}

// Throws 409 when adding this employee to the department would exceed its approved headcount
function checkHeadcount(db, departmentId, excludeEmployeeId, override) {
  if (!departmentId || override) return;
  const dept = db.prepare("SELECT id, name, headcount_limit FROM departments WHERE id = ?").get(departmentId);
  if (!dept) throw new HttpError(400, "Department does not exist.");
  if (dept.headcount_limit <= 0) return; // 0 = no limit set
  const filled = activeCount(db, departmentId, excludeEmployeeId);
  if (filled >= dept.headcount_limit) {
    throw new HttpError(409, `${dept.name} is at its approved headcount (${filled}/${dept.headcount_limit}). Raise the headcount or confirm to go over it.`, {
      code: "HEADCOUNT_FULL",
      department: dept.name,
      filled,
      limit: dept.headcount_limit,
    });
  }
}

function clean(input, existing = {}) {
  const out = {};
  for (const f of FIELDS) {
    if (input[f] === undefined) continue;
    let v = input[f];
    if (typeof v === "string") v = v.trim();
    if (v === "") v = null;
    out[f] = v;
  }
  // Required columns fall back to a default (or keep their current value) when left empty
  if (out.salary === null) out.salary = 0;
  if (out.annual_leave_days === null) out.annual_leave_days = existing.annual_leave_days ?? 14;
  for (const f of ["employment_type", "status"]) if (out[f] === null) delete out[f];
  const merged = { ...existing, ...out };

  const errors = [];
  if (!merged.first_name) errors.push("First name is required.");
  if (!merged.last_name) errors.push("Last name is required.");
  if (!merged.employee_no) errors.push("Employee number is required.");
  if (merged.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(merged.email)) errors.push("Email address looks invalid.");
  for (const f of ["date_of_birth", "start_date", "contract_end_date"])
    if (merged[f] && !isDate(merged[f])) errors.push(`${f.replace(/_/g, " ")} must be a date (YYYY-MM-DD).`);
  if (merged.employment_type && !EMPLOYMENT_TYPES.includes(merged.employment_type)) errors.push("Unknown employment type.");
  if (merged.status && !STATUSES.includes(merged.status)) errors.push("Unknown status.");
  if (merged.salary != null && (Number.isNaN(Number(merged.salary)) || Number(merged.salary) < 0)) errors.push("Salary must be a positive number.");
  if (merged.annual_leave_days != null && (Number.isNaN(Number(merged.annual_leave_days)) || Number(merged.annual_leave_days) < 0))
    errors.push("Annual leave days must be a positive number.");
  if (merged.employment_type === "contract" && !merged.contract_end_date) errors.push("Contract staff need a contract end date.");
  if (merged.start_date && merged.contract_end_date && merged.contract_end_date < merged.start_date)
    errors.push("Contract end date can't be before the start date.");
  if (errors.length) throw new HttpError(400, errors.join(" "), { errors });

  if (merged.employment_type === "permanent" && out.employment_type !== undefined && out.contract_end_date === undefined) out.contract_end_date = null;
  for (const f of ["department_id", "manager_id"]) if (out[f] != null) out[f] = Number(out[f]);
  for (const f of ["salary", "annual_leave_days"]) if (out[f] != null) out[f] = Number(out[f]);
  return out;
}

export function createEmployee(db, input, { overrideHeadcount = false } = {}) {
  const data = clean({ status: "active", employment_type: "permanent", ...input });
  if (db.prepare("SELECT 1 FROM employees WHERE employee_no = ?").get(data.employee_no))
    throw new HttpError(409, `Employee number ${data.employee_no} is already used.`);
  if ((data.status || "active") === "active") checkHeadcount(db, data.department_id, null, overrideHeadcount);
  const cols = Object.keys(data);
  const info = db.prepare(`INSERT INTO employees (${cols.join(", ")}) VALUES (${cols.map((c) => "@" + c).join(", ")})`).run(data);
  return getEmployee(db, info.lastInsertRowid);
}

export function updateEmployee(db, id, input, { overrideHeadcount = false } = {}) {
  const existing = db.prepare("SELECT * FROM employees WHERE id = ?").get(Number(id));
  if (!existing) throw new HttpError(404, "Employee not found.");
  const data = clean(input, existing);
  if (data.manager_id != null && data.manager_id === existing.id) throw new HttpError(400, "An employee can't be their own manager.");
  if (data.employee_no && data.employee_no !== existing.employee_no && db.prepare("SELECT 1 FROM employees WHERE employee_no = ?").get(data.employee_no))
    throw new HttpError(409, `Employee number ${data.employee_no} is already used.`);

  // Moving into a department, or becoming active again, takes a headcount slot
  const newDept = data.department_id !== undefined ? data.department_id : existing.department_id;
  const newStatus = data.status || existing.status;
  const takesNewSlot = newStatus === "active" && (existing.status !== "active" || newDept !== existing.department_id);
  if (takesNewSlot) checkHeadcount(db, newDept, existing.id, overrideHeadcount);

  const cols = Object.keys(data);
  if (cols.length) {
    db.prepare(`UPDATE employees SET ${cols.map((c) => `${c} = @${c}`).join(", ")}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id: existing.id });
  }
  return getEmployee(db, existing.id);
}

export function deleteEmployee(db, id) {
  const info = db.prepare("DELETE FROM employees WHERE id = ?").run(Number(id));
  if (!info.changes) throw new HttpError(404, "Employee not found.");
}

// ---------- departments & headcount ----------
export function listDepartments(db, on = today()) {
  const soon = new Date(Date.parse(on + "T00:00:00Z") + 90 * 86400000).toISOString().slice(0, 10);
  return db
    .prepare(
      `SELECT d.*,
              h.first_name || ' ' || h.last_name AS head_name, h.email AS head_email,
              (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id AND e.status = 'active') AS active_count,
              (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id AND e.status = 'active'
                  AND e.contract_end_date IS NOT NULL AND e.contract_end_date BETWEEN :on AND :soon) AS contracts_ending_90d,
              (SELECT COALESCE(SUM(e.salary), 0) FROM employees e WHERE e.department_id = d.id AND e.status = 'active') AS monthly_payroll
         FROM departments d
         LEFT JOIN employees h ON h.id = d.head_employee_id
        ORDER BY d.name`,
    )
    .all({ on, soon })
    .map((d) => ({
      ...d,
      vacancies: d.headcount_limit > 0 ? Math.max(0, d.headcount_limit - d.active_count) : null,
      over_by: d.headcount_limit > 0 ? Math.max(0, d.active_count - d.headcount_limit) : 0,
      utilisation: d.headcount_limit > 0 ? Math.round((100 * d.active_count) / d.headcount_limit) : null,
    }));
}

export function saveDepartment(db, input, id = null) {
  const name = String(input.name ?? "").trim();
  const limit = Number(input.headcount_limit ?? 0);
  const head = input.head_employee_id ? Number(input.head_employee_id) : null;
  if (!name) throw new HttpError(400, "Department name is required.");
  if (!Number.isInteger(limit) || limit < 0) throw new HttpError(400, "Approved headcount must be a whole number (0 means no limit).");
  if (head && !db.prepare("SELECT 1 FROM employees WHERE id = ?").get(head)) throw new HttpError(400, "Department head not found.");
  const clash = db.prepare("SELECT id FROM departments WHERE name = ? AND id != ?").get(name, id ?? -1);
  if (clash) throw new HttpError(409, `A department called ${name} already exists.`);
  const row = { name, code: input.code ? String(input.code).trim() : null, headcount_limit: limit, head_employee_id: head };
  if (id) {
    const info = db.prepare("UPDATE departments SET name=@name, code=@code, headcount_limit=@headcount_limit, head_employee_id=@head_employee_id WHERE id=@id").run({ ...row, id: Number(id) });
    if (!info.changes) throw new HttpError(404, "Department not found.");
    return Number(id);
  }
  return Number(db.prepare("INSERT INTO departments (name, code, headcount_limit, head_employee_id) VALUES (@name, @code, @headcount_limit, @head_employee_id)").run(row).lastInsertRowid);
}

export function deleteDepartment(db, id) {
  const n = db.prepare("SELECT COUNT(*) AS n FROM employees WHERE department_id = ? AND status = 'active'").get(Number(id)).n;
  if (n > 0) throw new HttpError(409, `Move the ${n} active employee(s) out of this department first.`);
  const info = db.prepare("DELETE FROM departments WHERE id = ?").run(Number(id));
  if (!info.changes) throw new HttpError(404, "Department not found.");
}

// ---------- leave ----------
export function listLeave(db, { employeeId, year } = {}) {
  const where = [];
  const params = {};
  if (employeeId) { where.push("l.employee_id = :employeeId"); params.employeeId = Number(employeeId); }
  if (year) { where.push("substr(l.start_date, 1, 4) = :year"); params.year = String(year); }
  return db
    .prepare(
      `SELECT l.*, e.first_name || ' ' || e.last_name AS employee_name, e.employee_no, d.name AS department_name
         FROM leave_records l
         JOIN employees e ON e.id = l.employee_id
         LEFT JOIN departments d ON d.id = e.department_id
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY l.start_date DESC`,
    )
    .all(params);
}

export function addLeave(db, input) {
  const employeeId = Number(input.employee_id);
  const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId);
  if (!emp) throw new HttpError(400, "Employee not found.");
  const type = input.leave_type || "annual";
  if (!LEAVE_TYPES.includes(type)) throw new HttpError(400, "Unknown leave type.");
  if (!isDate(input.start_date) || !isDate(input.end_date)) throw new HttpError(400, "Start and end dates are required (YYYY-MM-DD).");
  if (input.end_date < input.start_date) throw new HttpError(400, "End date can't be before the start date.");
  const days = input.days != null && input.days !== "" ? Number(input.days) : daysBetween(input.start_date, input.end_date) + 1;
  if (!(days > 0)) throw new HttpError(400, "Number of days must be more than 0.");
  if (type === "annual") {
    const e = getEmployee(db, employeeId);
    if (input.start_date.slice(0, 4) === today().slice(0, 4) && days > e.leave_remaining && !input.allowNegative)
      throw new HttpError(409, `${e.full_name} only has ${e.leave_remaining} day(s) of annual leave left.`, { code: "INSUFFICIENT_LEAVE" });
  }
  const info = db
    .prepare("INSERT INTO leave_records (employee_id, leave_type, start_date, end_date, days, reason) VALUES (?, ?, ?, ?, ?, ?)")
    .run(employeeId, type, input.start_date, input.end_date, days, input.reason || null);
  return db.prepare("SELECT * FROM leave_records WHERE id = ?").get(info.lastInsertRowid);
}

export function deleteLeave(db, id) {
  const info = db.prepare("DELETE FROM leave_records WHERE id = ?").run(Number(id));
  if (!info.changes) throw new HttpError(404, "Leave record not found.");
}
