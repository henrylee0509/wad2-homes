// Notifier service: asks the HR API which contracts need a reminder, emails the managers,
// and reports each result back to the API. It never touches the database directly.
//
//   npm start          keep running and check every CHECK_INTERVAL_MINUTES (default 60)
//   npm run once       check once and exit (for a cron job or scheduled task)
import "dotenv/config";
import { createMailer } from "./mailer.js";
import { contractReminderEmail } from "./templates.js";

const API_URL = (process.env.API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");
const API_KEY = process.env.SERVICE_API_KEY;
const INTERVAL_MIN = Number(process.env.CHECK_INTERVAL_MINUTES) || 60;

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "X-API-Key": API_KEY, ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${options.method || "GET"} ${path} failed (${res.status}): ${body.error || res.statusText}`);
  return body;
}

export async function checkOnce(mailer) {
  const { reminders, company_name } = await api("/internal/contract-reminders/due");
  if (!reminders.length) {
    console.log(`[${new Date().toISOString()}] No contract reminders due.`);
    return { sent: 0, failed: 0 };
  }
  let sent = 0, failed = 0;
  for (const r of reminders) {
    let result;
    if (!r.recipient) {
      result = { status: "no_recipient", error: "No manager, department head or HR email to send to" };
      console.warn(`⚠️  ${r.employee_name}: no one to email (set a manager, department head or HR email)`);
    } else {
      try {
        const email = contractReminderEmail(r, company_name);
        result = await mailer.send({ to: r.recipient, ...email });
        console.log(`✉️  ${r.employee_name} (ends ${r.contract_end_date}) → ${r.recipient} [${result.status}]`);
        sent++;
      } catch (err) {
        result = { status: "failed", error: String(err.message || err).slice(0, 500) };
        console.error(`❌ ${r.employee_name} → ${r.recipient}: ${result.error}`);
        failed++;
      }
    }
    await api("/internal/contract-reminders", {
      method: "POST",
      body: JSON.stringify({ employee_id: r.employee_id, contract_end_date: r.contract_end_date, recipient: r.recipient, ...result }),
    });
  }
  return { sent, failed };
}

async function main() {
  if (!API_KEY) {
    console.error("SERVICE_API_KEY is not set. Use the same value as in the API's .env.");
    process.exit(1);
  }
  const mailer = createMailer();
  console.log(`📬 Notifier using ${API_URL}; email ${mailer.configured ? "via SMTP" : "printed to console (SMTP not configured)"}`);
  if (mailer.configured) await mailer.verify().catch((e) => console.warn("⚠️  SMTP check failed:", e.message));

  const run = () => checkOnce(mailer).catch((err) => console.error("Reminder check failed:", err.message));
  if (process.argv.includes("--once")) {
    await run();
    return;
  }
  await run();
  setInterval(run, INTERVAL_MIN * 60 * 1000);
  console.log(`⏰ Checking for due reminders every ${INTERVAL_MIN} minute(s)`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("index.js")) main();
