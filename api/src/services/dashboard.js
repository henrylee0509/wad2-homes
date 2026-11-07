// Numbers for the dashboard
import { today, addDays } from "../utils/dates.js";
import { listDepartments } from "./employees.js";
import { upcomingContracts, listReminders } from "./contracts.js";

export function dashboard(db, on = today()) {
  const count = (sql, ...p) => db.prepare(sql).get(...p).n;
  const monthStart = on.slice(0, 7) + "-01";
  const departments = listDepartments(db, on);
  const approved = departments.reduce((s, d) => s + (d.headcount_limit || 0), 0);
  return {
    today: on,
    totals: {
      active: count("SELECT COUNT(*) AS n FROM employees WHERE status = 'active'"),
      contract: count("SELECT COUNT(*) AS n FROM employees WHERE status = 'active' AND contract_end_date IS NOT NULL"),
      approved_headcount: approved,
      vacancies: departments.reduce((s, d) => s + (d.vacancies || 0), 0),
      over_headcount_departments: departments.filter((d) => d.over_by > 0).length,
      new_this_month: count("SELECT COUNT(*) AS n FROM employees WHERE start_date >= ? AND start_date <= ?", monthStart, on),
      on_leave_today: count("SELECT COUNT(DISTINCT employee_id) AS n FROM leave_records WHERE ? BETWEEN start_date AND end_date", on),
      contracts_ending_30d: count(
        "SELECT COUNT(*) AS n FROM employees WHERE status = 'active' AND contract_end_date BETWEEN ? AND ?",
        on,
        addDays(on, 30),
      ),
      monthly_payroll: db.prepare("SELECT COALESCE(SUM(salary), 0) AS n FROM employees WHERE status = 'active'").get().n,
    },
    departments,
    upcoming_contracts: upcomingContracts(db, 60, on),
    recent_reminders: listReminders(db, { limit: 8 }),
  };
}
