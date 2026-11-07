// SQLite database: schema, small helpers and first-run setup.
// Uses better-sqlite3. If it isn't installed, falls back to Node's built-in
// node:sqlite (Node 22.5+), which has the same prepare/run/get/all API.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function openDatabase(file) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  try {
    const Database = require("better-sqlite3");
    return new Database(file);
  } catch {
    const { DatabaseSync } = require("node:sqlite");
    return new DatabaseSync(file);
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS departments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  code             TEXT,
  head_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  headcount_limit  INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_no             TEXT NOT NULL UNIQUE,
  first_name              TEXT NOT NULL,
  last_name               TEXT NOT NULL,
  date_of_birth           TEXT,
  gender                  TEXT,
  email                   TEXT,
  phone                   TEXT,
  address                 TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  department_id           INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  job_title               TEXT,
  manager_id              INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  employment_type         TEXT NOT NULL DEFAULT 'permanent',  -- permanent | contract | part_time | intern
  start_date              TEXT,
  contract_end_date       TEXT,                                -- NULL for permanent staff
  salary                  REAL NOT NULL DEFAULT 0,             -- monthly, in SGD
  annual_leave_days       REAL NOT NULL DEFAULT 14,            -- yearly entitlement
  status                  TEXT NOT NULL DEFAULT 'active',      -- active | resigned | terminated | contract_ended
  notes                   TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leave_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type  TEXT NOT NULL DEFAULT 'annual',   -- annual | sick | unpaid | other
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  days        REAL NOT NULL,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One reminder per employee per contract end date, so emails are never sent twice
CREATE TABLE IF NOT EXISTS contract_reminders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contract_end_date TEXT NOT NULL,
  recipient         TEXT,
  status            TEXT NOT NULL,              -- sent | logged | failed | no_recipient
  error             TEXT,
  decision          TEXT,                       -- extended | ending | NULL (no action)
  decided_at        TEXT,
  sent_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (employee_id, contract_end_date)
);

CREATE TABLE IF NOT EXISTS contract_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,                   -- extended | made_permanent | ended | not_renewed
  old_end_date TEXT,
  new_end_date TEXT,
  note         TEXT,
  changed_by   TEXT,
  changed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_contract   ON employees(contract_end_date);
CREATE INDEX IF NOT EXISTS idx_leave_employee       ON leave_records(employee_id);
`;

export const DEFAULT_SETTINGS = {
  company_name: "Acme Pte Ltd",
  reminder_days_before: "30",
  hr_email: "",
  app_url: "http://localhost:5173",
};

export function createDb(file = process.env.DATABASE_FILE || "data/hr.db") {
  const db = openDatabase(file);
  db.exec("PRAGMA foreign_keys = ON");
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);

  const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

  // Run fn inside a transaction (works with both SQLite drivers)
  db.tx = (fn) => {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };

  db.getSetting = (key) => db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value ?? DEFAULT_SETTINGS[key];
  db.getSettings = () => {
    const out = { ...DEFAULT_SETTINGS };
    for (const row of db.prepare("SELECT key, value FROM settings").all()) out[row.key] = row.value;
    return out;
  };
  db.setSetting = (key, value) =>
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(value ?? ""));

  return db;
}
