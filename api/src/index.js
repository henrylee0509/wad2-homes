// Starts the HR API and its daily contract-expiry job.
import "dotenv/config";
import { createDb } from "./db.js";
import { createApp } from "./app.js";
import { ensureAdmin, seedDemoData } from "./seed.js";
import { expireContracts } from "./services/contracts.js";

const db = createDb();
ensureAdmin(db);
if (String(process.env.SEED_DEMO_DATA).toLowerCase() === "true") seedDemoData(db);

// Contracts that reached their end date without an extension end automatically.
// Runs at start-up and every hour (it's idempotent, so running often is harmless).
function runExpiry() {
  try {
    const n = expireContracts(db);
    if (n) console.log(`📄 Ended ${n} contract(s) that reached their end date without an extension`);
  } catch (err) {
    console.error("Contract expiry job failed:", err);
  }
}
runExpiry();
setInterval(runExpiry, 60 * 60 * 1000).unref();

const port = Number(process.env.PORT) || 4000;
createApp(db).listen(port, () => console.log(`✅ HR API listening on http://localhost:${port}/api/v1`));
