// First-run setup: creates the admin account, and demo data when SEED_DEMO_DATA=true.
import { hashPassword } from "./auth.js";
import { today, addDays, addMonths } from "./utils/dates.js";

export function ensureAdmin(db) {
  const exists = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (exists) return;
  const email = process.env.ADMIN_EMAIL || "admin@company.com";
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)").run("Administrator", email, hashPassword(password));
  console.log(`👤 Created admin account ${email}${process.env.ADMIN_PASSWORD ? "" : " (password: ChangeMe123!, change it in Settings)"}`);
}

const DEPARTMENTS = [
  ["Engineering", "ENG", 8],
  ["Sales", "SAL", 5],
  ["Finance", "FIN", 3],
  ["Human Resources", "HR", 2],
  ["Operations", "OPS", 5],
];

// [first, last, dob, gender, dept, title, type, monthsAgoStarted, contractEndInDays|null, salary, leaveDays, isHead]
const PEOPLE = [
  ["Wei Ling", "Tan", "1985-04-12", "F", "Engineering", "Head of Engineering", "permanent", 72, null, 14500, 21, true],
  ["Arjun", "Nair", "1992-09-03", "M", "Engineering", "Senior Software Engineer", "permanent", 40, null, 9800, 18],
  ["Mei Xin", "Lim", "1997-01-22", "F", "Engineering", "Software Engineer", "contract", 11, 21, 6200, 14],
  ["Daniel", "Koh", "1999-06-30", "M", "Engineering", "Software Engineer", "contract", 5, 75, 5800, 14],
  ["Siti", "Rahman", "1995-11-18", "F", "Engineering", "QA Engineer", "permanent", 26, null, 6100, 14],
  ["Ryan", "Ong", "2002-03-09", "M", "Engineering", "Software Engineering Intern", "intern", 2, 28, 1200, 0],
  ["Rachel", "Goh", "1983-07-25", "F", "Sales", "Sales Director", "permanent", 90, null, 13200, 21, true],
  ["Marcus", "Lee", "1990-02-14", "M", "Sales", "Account Manager", "permanent", 30, null, 7200, 18],
  ["Priya", "Menon", "1994-12-01", "F", "Sales", "Account Executive", "contract", 10, 12, 5200, 14],
  ["Jun Hao", "Chua", "1998-08-19", "M", "Sales", "Sales Executive", "contract", 4, 140, 4300, 14],
  ["Hui Min", "Teo", "1987-05-06", "F", "Finance", "Finance Manager", "permanent", 60, null, 10500, 21, true],
  ["Kumar", "Pillai", "1991-10-27", "M", "Finance", "Accountant", "permanent", 34, null, 6400, 18],
  ["Grace", "Yeo", "1996-04-02", "F", "Finance", "Accounts Executive", "contract", 9, 45, 4200, 14],
  ["Nur Aisyah", "Ismail", "1989-09-15", "F", "Human Resources", "HR Manager", "permanent", 50, null, 9200, 21, true],
  ["Benjamin", "Sim", "1993-01-11", "M", "Human Resources", "HR Executive", "contract", 12, 25, 4800, 14],
  ["Kevin", "Ng", "1984-11-30", "M", "Operations", "Operations Manager", "permanent", 80, null, 9900, 21, true],
  ["Farah", "Hassan", "1997-07-07", "F", "Operations", "Operations Executive", "permanent", 20, null, 4500, 14],
  ["Jia Hui", "Wong", "2000-02-20", "F", "Operations", "Logistics Coordinator", "contract", 6, 8, 3900, 14],
  ["Ahmad", "Yusof", "1992-06-13", "M", "Operations", "Warehouse Supervisor", "part_time", 15, 200, 3200, 7],
];

const STREETS = ["Tampines Ave 5", "Jurong West St 42", "Ang Mo Kio Ave 3", "Bukit Timah Rd", "Punggol Field", "Clementi Ave 2", "Bedok North Rd", "Woodlands Dr 16", "Toa Payoh Lor 1", "Serangoon Ave 2"];

export function seedDemoData(db) {
  if (db.prepare("SELECT COUNT(*) AS n FROM employees").get().n > 0) return false;
  const on = today();
  db.tx(() => {
    const deptIds = {};
    for (const [name, code, limit] of DEPARTMENTS)
      deptIds[name] = Number(db.prepare("INSERT INTO departments (name, code, headcount_limit) VALUES (?, ?, ?)").run(name, code, limit).lastInsertRowid);

    const heads = {};
    const insert = db.prepare(`INSERT INTO employees
      (employee_no, first_name, last_name, date_of_birth, gender, email, phone, address, emergency_contact_name, emergency_contact_phone,
       department_id, job_title, manager_id, employment_type, start_date, contract_end_date, salary, annual_leave_days, status)
      VALUES (@employee_no, @first_name, @last_name, @date_of_birth, @gender, @email, @phone, @address, @emergency_contact_name, @emergency_contact_phone,
       @department_id, @job_title, @manager_id, @employment_type, @start_date, @contract_end_date, @salary, @annual_leave_days, 'active')`);
    // heads first so everyone else can report to them
    const ordered = [...PEOPLE].sort((a, b) => (b[11] ? 1 : 0) - (a[11] ? 1 : 0));
    ordered.forEach((p, i) => {
      const [first, last, dob, gender, dept, title, type, monthsAgo, endInDays, salary, leave, isHead] = p;
      const slug = `${first}.${last}`.toLowerCase().replace(/\s+/g, "");
      const id = Number(
        insert.run({
          employee_no: `E${String(1001 + i)}`,
          first_name: first,
          last_name: last,
          date_of_birth: dob,
          gender,
          email: `${slug}@acme.example`,
          phone: `+65 9${String(1000000 + i * 734917).slice(-7)}`,
          address: `Blk ${100 + i * 7} ${STREETS[i % STREETS.length]}, #${String(2 + (i % 12)).padStart(2, "0")}-${100 + i}, Singapore ${String(400000 + i * 12345).slice(0, 6)}`,
          emergency_contact_name: `${["Mr", "Mrs", "Ms"][i % 3]} ${last}`,
          emergency_contact_phone: `+65 8${String(2000000 + i * 51173).slice(-7)}`,
          department_id: deptIds[dept],
          job_title: title,
          manager_id: isHead ? null : heads[dept] ?? null,
          employment_type: type,
          start_date: addMonths(on, -monthsAgo),
          contract_end_date: endInDays == null ? null : addDays(on, endInDays),
          salary,
          annual_leave_days: leave,
        }).lastInsertRowid,
      );
      if (isHead) {
        heads[dept] = id;
        db.prepare("UPDATE departments SET head_employee_id = ? WHERE id = ?").run(id, deptIds[dept]);
      }
    });

    const empId = (first) => db.prepare("SELECT id FROM employees WHERE first_name = ?").get(first).id;
    const year = on.slice(0, 4);
    const leave = db.prepare("INSERT INTO leave_records (employee_id, leave_type, start_date, end_date, days, reason) VALUES (?, ?, ?, ?, ?, ?)");
    leave.run(empId("Arjun"), "annual", `${year}-03-10`, `${year}-03-14`, 5, "Family trip");
    leave.run(empId("Marcus"), "annual", `${year}-06-02`, `${year}-06-06`, 5, "Holiday");
    leave.run(empId("Siti"), "sick", `${year}-02-19`, `${year}-02-20`, 2, "MC");
    leave.run(empId("Kumar"), "annual", `${year}-08-11`, `${year}-08-13`, 3, null);
    leave.run(empId("Farah"), "annual", on, addDays(on, 1), 2, "Personal matters");
    leave.run(empId("Wei Ling"), "annual", `${year}-04-21`, `${year}-04-30`, 8, "Overseas");
  });
  console.log("🌱 Added demo departments, employees and leave records");
  return true;
}
