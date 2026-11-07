// REST API (v1). The web app and the notifier service talk to the data only through these endpoints.
import express from "express";
import cors from "cors";
import { createToken, getSecret, requireAuth, verifyPassword, hashPassword } from "./auth.js";
import * as emp from "./services/employees.js";
import * as contracts from "./services/contracts.js";
import { dashboard } from "./services/dashboard.js";
import { today } from "./utils/dates.js";

// Wrap handlers so thrown errors (sync or async) reach the error handler
const h = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out && typeof out.then === "function") out.then((v) => v !== undefined && !res.headersSent && res.json(v), next);
    else if (out !== undefined && !res.headersSent) res.json(out);
  } catch (err) {
    next(err);
  }
};

// Service-to-service auth for the notifier: "X-API-Key: <SERVICE_API_KEY>"
function requireServiceKey(req, res, next) {
  const key = process.env.SERVICE_API_KEY;
  if (!key) return res.status(503).json({ error: "SERVICE_API_KEY is not set on the API." });
  if (req.headers["x-api-key"] !== key) return res.status(401).json({ error: "Invalid service API key." });
  next();
}

export function createApp(db) {
  const app = express();
  const origins = (process.env.CORS_ORIGINS || "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: origins, allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"] }));
  app.use(express.json({ limit: "1mb" }));

  const v1 = express.Router();
  const auth = requireAuth(db);
  const by = (req) => req.user?.email || "unknown";

  v1.get("/health", h(() => ({ ok: true, service: "hr-api", time: new Date().toISOString(), today: today() })));

  // ---------- auth ----------
  v1.post("/auth/login", h((req, res) => {
    const { email, password } = req.body || {};
    const user = email && db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).trim());
    if (!user || !verifyPassword(String(password || ""), user.password_hash)) {
      res.status(401);
      return { error: "Wrong email or password." };
    }
    return { token: createToken(user, getSecret(db)), user: { id: user.id, name: user.name, email: user.email } };
  }));
  v1.get("/auth/me", auth, h((req) => ({ user: req.user })));
  v1.post("/auth/password", auth, h((req, res) => {
    const { current_password, new_password } = req.body || {};
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!verifyPassword(String(current_password || ""), user.password_hash)) { res.status(400); return { error: "Current password is wrong." }; }
    if (!new_password || String(new_password).length < 8) { res.status(400); return { error: "New password must be at least 8 characters." }; }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(String(new_password)), user.id);
    return { ok: true };
  }));

  // ---------- admin users ----------
  v1.get("/users", auth, h(() => db.prepare("SELECT id, name, email, created_at FROM users ORDER BY name").all()));
  v1.post("/users", auth, h((req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password || String(password).length < 8) { res.status(400); return { error: "Name, email and a password of 8+ characters are required." }; }
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) { res.status(409); return { error: "That email already has an account." }; }
    const id = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)").run(name, email, hashPassword(String(password))).lastInsertRowid;
    res.status(201);
    return db.prepare("SELECT id, name, email, created_at FROM users WHERE id = ?").get(id);
  }));
  v1.delete("/users/:id", auth, h((req, res) => {
    if (Number(req.params.id) === req.user.id) { res.status(400); return { error: "You can't delete your own account." }; }
    db.prepare("DELETE FROM users WHERE id = ?").run(Number(req.params.id));
    res.status(204).end();
  }));

  // ---------- dashboard ----------
  v1.get("/dashboard", auth, h(() => dashboard(db)));

  // ---------- employees ----------
  v1.get("/employees", auth, h((req) => emp.listEmployees(db, {
    search: req.query.search, departmentId: req.query.department_id, status: req.query.status, employmentType: req.query.employment_type,
  })));
  v1.get("/employees/:id", auth, h((req) => ({
    ...emp.getEmployee(db, req.params.id),
    leave: emp.listLeave(db, { employeeId: req.params.id }),
    contract_history: contracts.contractHistory(db, req.params.id),
    reports: db.prepare("SELECT id, first_name || ' ' || last_name AS full_name, job_title FROM employees WHERE manager_id = ? AND status = 'active' ORDER BY first_name").all(Number(req.params.id)),
  })));
  v1.post("/employees", auth, h((req, res) => {
    const { override_headcount, ...body } = req.body || {};
    const created = emp.createEmployee(db, body, { overrideHeadcount: !!override_headcount });
    res.status(201);
    return created;
  }));
  v1.put("/employees/:id", auth, h((req) => {
    const { override_headcount, ...body } = req.body || {};
    return emp.updateEmployee(db, req.params.id, body, { overrideHeadcount: !!override_headcount });
  }));
  v1.delete("/employees/:id", auth, h((req, res) => { emp.deleteEmployee(db, req.params.id); res.status(204).end(); }));

  // ---------- contracts ----------
  v1.get("/contracts/upcoming", auth, h((req) => contracts.upcomingContracts(db, req.query.days)));
  v1.get("/contracts/reminders", auth, h((req) => contracts.listReminders(db, { limit: req.query.limit })));
  v1.post("/employees/:id/contract/extend", auth, h((req) => contracts.extendContract(db, req.params.id, req.body || {}, by(req))));
  v1.post("/employees/:id/contract/not-renewing", auth, h((req) => contracts.markNotRenewing(db, req.params.id, req.body || {}, by(req))));

  // ---------- departments & headcount ----------
  v1.get("/departments", auth, h(() => emp.listDepartments(db)));
  v1.post("/departments", auth, h((req, res) => {
    const id = emp.saveDepartment(db, req.body || {});
    res.status(201);
    return emp.listDepartments(db).find((d) => d.id === id);
  }));
  v1.put("/departments/:id", auth, h((req) => {
    const id = emp.saveDepartment(db, req.body || {}, req.params.id);
    return emp.listDepartments(db).find((d) => d.id === id);
  }));
  v1.delete("/departments/:id", auth, h((req, res) => { emp.deleteDepartment(db, req.params.id); res.status(204).end(); }));

  // ---------- leave ----------
  v1.get("/leave", auth, h((req) => emp.listLeave(db, { employeeId: req.query.employee_id, year: req.query.year })));
  v1.post("/leave", auth, h((req, res) => { const r = emp.addLeave(db, req.body || {}); res.status(201); return r; }));
  v1.delete("/leave/:id", auth, h((req, res) => { emp.deleteLeave(db, req.params.id); res.status(204).end(); }));

  // ---------- settings ----------
  const PUBLIC_SETTINGS = ["company_name", "reminder_days_before", "hr_email", "app_url"];
  v1.get("/settings", auth, h(() => Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, db.getSetting(k)]))));
  v1.put("/settings", auth, h((req, res) => {
    const body = req.body || {};
    if (body.reminder_days_before !== undefined) {
      const n = Number(body.reminder_days_before);
      if (!Number.isInteger(n) || n < 1 || n > 365) { res.status(400); return { error: "Reminder days must be between 1 and 365." }; }
    }
    for (const k of PUBLIC_SETTINGS) if (body[k] !== undefined) db.setSetting(k, body[k]);
    return Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, db.getSetting(k)]));
  }));

  // ---------- service endpoints (notifier) ----------
  v1.get("/internal/contract-reminders/due", requireServiceKey, h(() => ({
    company_name: db.getSetting("company_name"),
    reminder_days_before: Number(db.getSetting("reminder_days_before")),
    reminders: contracts.dueReminders(db),
  })));
  v1.post("/internal/contract-reminders", requireServiceKey, h((req, res) => { const r = contracts.recordReminder(db, req.body || {}); res.status(201); return r; }));

  app.use("/api/v1", v1);
  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === "entity.parse.failed" ? 400 : 500);
    if (status >= 500) console.error(err);
    const { code, errors, department, filled, limit } = err;
    res.status(status).json({ error: status >= 500 ? "Something went wrong on the server." : err.message, code, errors, department, filled, limit });
  });

  return app;
}
