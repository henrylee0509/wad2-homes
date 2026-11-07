// End-to-end API tests: starts the API on a random port with an in-memory database
// and demo data, then calls it over HTTP.   Run: npm test (in api/)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { ensureAdmin, seedDemoData } from "../src/seed.js";
import { expireContracts } from "../src/services/contracts.js";
import { today, addDays } from "../src/utils/dates.js";

process.env.SERVICE_API_KEY = "test-service-key";
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "Password123!";
process.env.WEB_URL = "http://hr.test";

let db, server, base, token;

async function call(method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const service = (method, path, body) => call(method, path, body, { "X-API-Key": "test-service-key" });

before(async () => {
  db = createDb(":memory:");
  ensureAdmin(db);
  seedDemoData(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(() => server.close());

test("rejects wrong password and unauthenticated requests", async () => {
  assert.equal((await call("POST", "/auth/login", { email: "admin@test.local", password: "nope" })).status, 401);
  assert.equal((await call("GET", "/employees")).status, 401);
});

test("logs in", async () => {
  const r = await call("POST", "/auth/login", { email: "admin@test.local", password: "Password123!" });
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
  token = r.body.token;
  assert.equal((await call("GET", "/auth/me")).body.user.email, "admin@test.local");
});

test("lists employees with age, department and leave remaining", async () => {
  const r = await call("GET", "/employees");
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 19);
  const arjun = r.body.find((e) => e.first_name === "Arjun");
  assert.equal(arjun.department_name, "Engineering");
  assert.equal(typeof arjun.age, "number");
  assert.equal(arjun.leave_remaining, 18 - 5);
  assert.equal(arjun.manager_name, "Wei Ling Tan");
  const filtered = await call("GET", "/employees?search=nair");
  assert.deepEqual(filtered.body.map((e) => e.first_name), ["Arjun"]);
});

test("shows employee detail with leave and contract history", async () => {
  const id = (await call("GET", "/employees?search=Arjun")).body[0].id;
  const r = await call("GET", `/employees/${id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.leave.length, 1);
  assert.ok(Array.isArray(r.body.contract_history));
  assert.equal((await call("GET", "/employees/99999")).status, 404);
});

test("validates new employees", async () => {
  const r = await call("POST", "/employees", { first_name: "A", employee_no: "X1", employment_type: "contract" });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Last name is required/);
  assert.match(r.body.error, /contract end date/);
});

test("saving the edit form with empty optional fields works", async () => {
  const ahmad = (await call("GET", "/employees?search=Ahmad")).body[0];
  const form = { employee_no: ahmad.employee_no, first_name: "Ahmad", last_name: "Yusof", date_of_birth: "", gender: "", email: "", phone: "",
    address: "", emergency_contact_name: "", emergency_contact_phone: "", department_id: ahmad.department_id, job_title: "Warehouse Supervisor",
    manager_id: null, employment_type: "part_time", start_date: ahmad.start_date, contract_end_date: ahmad.contract_end_date, salary: "",
    annual_leave_days: "", status: "active", notes: "" };
  const r = await call("PUT", `/employees/${ahmad.id}`, form);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.salary, 0);
  assert.equal(r.body.annual_leave_days, 7);
  assert.equal(r.body.email, null);
});

test("enforces department headcount unless overridden", async () => {
  const depts = (await call("GET", "/departments")).body;
  const hr = depts.find((d) => d.name === "Human Resources");
  assert.equal(hr.active_count, 2);
  assert.equal(hr.headcount_limit, 2);
  assert.equal(hr.vacancies, 0);

  const person = { employee_no: "E9001", first_name: "New", last_name: "Hire", department_id: hr.id, employment_type: "permanent", salary: 4000 };
  const blocked = await call("POST", "/employees", person);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "HEADCOUNT_FULL");

  const allowed = await call("POST", "/employees", { ...person, override_headcount: true });
  assert.equal(allowed.status, 201);
  const after = (await call("GET", "/departments")).body.find((d) => d.id === hr.id);
  assert.equal(after.over_by, 1);

  // raising the approved headcount clears the overage
  const raised = await call("PUT", `/departments/${hr.id}`, { name: hr.name, code: hr.code, headcount_limit: 3, head_employee_id: hr.head_employee_id });
  assert.equal(raised.status, 200);
  assert.equal(raised.body.over_by, 0);
  assert.equal(raised.body.vacancies, 0);
});

test("moving someone into a full department is blocked", async () => {
  const fin = (await call("GET", "/departments")).body.find((d) => d.name === "Finance");
  const farah = (await call("GET", "/employees?search=Farah")).body[0];
  const r = await call("PUT", `/employees/${farah.id}`, { department_id: fin.id });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "HEADCOUNT_FULL");
});

test("internal endpoints need the service key", async () => {
  assert.equal((await call("GET", "/internal/contract-reminders/due")).status, 401);
});

test("lists contracts that need a reminder, addressed to the right manager", async () => {
  const r = await service("GET", "/internal/contract-reminders/due");
  assert.equal(r.status, 200);
  assert.equal(r.body.reminder_days_before, 30);
  const names = r.body.reminders.map((x) => x.employee_name).sort();
  // seeded contracts ending in 8, 12, 21, 25 and 28 days
  assert.deepEqual(names, ["Benjamin Sim", "Jia Hui Wong", "Mei Xin Lim", "Priya Menon", "Ryan Ong"]);
  const meiXin = r.body.reminders.find((x) => x.employee_name === "Mei Xin Lim");
  assert.equal(meiXin.recipient, "weiling.tan@acme.example");
  assert.equal(meiXin.days_left, 21);
  assert.match(meiXin.review_url, /^http:\/\/hr\.test\/employees\/\d+\?review=contract$/);
});

test("a recorded reminder is not sent again; a failed one is retried", async () => {
  const due = (await service("GET", "/internal/contract-reminders/due")).body.reminders;
  const [a, b] = due;
  assert.equal((await service("POST", "/internal/contract-reminders", { employee_id: a.employee_id, contract_end_date: a.contract_end_date, recipient: a.recipient, status: "sent" })).status, 201);
  assert.equal((await service("POST", "/internal/contract-reminders", { employee_id: b.employee_id, contract_end_date: b.contract_end_date, recipient: b.recipient, status: "failed", error: "SMTP down" })).status, 201);
  const ids = (await service("GET", "/internal/contract-reminders/due")).body.reminders.map((x) => x.employee_id);
  assert.ok(!ids.includes(a.employee_id), "sent reminder should not be due again");
  assert.ok(ids.includes(b.employee_id), "failed reminder should be retried");
  const log = (await call("GET", "/contracts/reminders")).body;
  assert.equal(log.length, 2);
});

test("extending a contract moves the end date and starts a new reminder cycle", async () => {
  const priya = (await call("GET", "/employees?search=Priya")).body[0];
  await service("POST", "/internal/contract-reminders", { employee_id: priya.id, contract_end_date: priya.contract_end_date, recipient: "x@y.z", status: "sent" });
  const newEnd = addDays(today(), 365);
  const bad = await call("POST", `/employees/${priya.id}/contract/extend`, { new_end_date: priya.contract_end_date });
  assert.equal(bad.status, 400);
  const r = await call("POST", `/employees/${priya.id}/contract/extend`, { new_end_date: newEnd, note: "Strong performer" });
  assert.equal(r.status, 200);
  assert.equal(r.body.contract_end_date, newEnd);
  const detail = (await call("GET", `/employees/${priya.id}`)).body;
  assert.equal(detail.contract_history[0].action, "extended");
  const reminder = (await call("GET", "/contracts/reminders")).body.find((x) => x.employee_id === priya.id);
  assert.equal(reminder.decision, "extended");
  const due = (await service("GET", "/internal/contract-reminders/due")).body.reminders.map((x) => x.employee_id);
  assert.ok(!due.includes(priya.id));
});

test("making a contract employee permanent clears the end date", async () => {
  const daniel = (await call("GET", "/employees?search=Daniel")).body[0];
  const r = await call("POST", `/employees/${daniel.id}/contract/extend`, { make_permanent: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.employment_type, "permanent");
  assert.equal(r.body.contract_end_date, null);
});

test("doing nothing lets the contract end and frees the headcount", async () => {
  const jiaHui = (await call("GET", "/employees?search=Jia Hui")).body[0];
  const ops = (await call("GET", "/departments")).body.find((d) => d.name === "Operations");
  const marked = await call("POST", `/employees/${jiaHui.id}/contract/not-renewing`, { note: "Project finished" });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.status, "active", "still active until the end date");

  const ended = expireContracts(db, addDays(jiaHui.contract_end_date, 1));
  assert.ok(ended >= 1);
  const after = (await call("GET", `/employees/${jiaHui.id}`)).body;
  assert.equal(after.status, "contract_ended");
  assert.equal(after.contract_history[0].action, "ended");
  const opsAfter = (await call("GET", "/departments")).body.find((d) => d.id === ops.id);
  assert.equal(opsAfter.active_count, ops.active_count - 1);
});

test("annual leave can't exceed what's left", async () => {
  const ryan = (await call("GET", "/employees?search=Ryan")).body[0]; // intern with 0 days
  const year = today().slice(0, 4);
  const r = await call("POST", "/leave", { employee_id: ryan.id, leave_type: "annual", start_date: `${year}-12-01`, end_date: `${year}-12-02` });
  assert.equal(r.status, 409);
  const sick = await call("POST", "/leave", { employee_id: ryan.id, leave_type: "sick", start_date: `${year}-12-01`, end_date: `${year}-12-02` });
  assert.equal(sick.status, 201);
  assert.equal(sick.body.days, 2);
});

test("dashboard summarises headcount and upcoming contracts", async () => {
  const r = await call("GET", "/dashboard");
  assert.equal(r.status, 200);
  assert.ok(r.body.totals.active > 0);
  assert.ok(r.body.totals.contracts_ending_30d >= 1);
  assert.equal(r.body.departments.length, 5);
  assert.ok(r.body.upcoming_contracts.every((c) => c.days_left <= 60));
});

test("settings are validated", async () => {
  assert.equal((await call("PUT", "/settings", { reminder_days_before: 0 })).status, 400);
  const r = await call("PUT", "/settings", { reminder_days_before: 45, hr_email: "hr@acme.example" });
  assert.equal(r.status, 200);
  assert.equal(r.body.reminder_days_before, "45");
});

test("departments with active staff can't be deleted", async () => {
  const eng = (await call("GET", "/departments")).body.find((d) => d.name === "Engineering");
  assert.equal((await call("DELETE", `/departments/${eng.id}`)).status, 409);
});
