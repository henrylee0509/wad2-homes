# HR Admin Portal

An admin website for managing company HR matters:

- **Employee records:** age, address, contact details, emergency contact, department, manager, job title, salary, leave remaining, employment type and status
- **Automated contract reminders:** a month before a contract ends, the employee's manager gets an email asking whether to extend it. If nobody extends it, the contract simply ends on its date ("do nothing" = let go).
- **Department headcount:** approved headcount per department, filled vs open seats, and a check that stops departments going over their headcount unless an admin confirms
- **Leave tracking:** annual, sick, unpaid and other leave, with annual leave remaining per employee
- A dashboard, CSV export of employees, and multiple admin accounts

## Architecture

The system is three independent apps that only talk to each other over HTTP:

```
┌──────────────┐   REST /api/v1    ┌──────────────┐        ┌────────────┐
│  web (Vue)   │ ────────────────▶ │  api         │ ─────▶ │  SQLite    │
│  admin site  │  Bearer token     │  Express     │        │  hr.db     │
└──────────────┘                   └──────────────┘        └────────────┘
                                          ▲
                   /api/v1/internal/*     │ X-API-Key
                                   ┌──────────────┐  SMTP  ┌────────────┐
                                   │  notifier    │ ─────▶ │  Managers' │
                                   │  email worker│        │  inboxes   │
                                   └──────────────┘        └────────────┘
```

| App | Folder | What it does |
| --- | --- | --- |
| **API** | [`api/`](api) | Express REST API. Owns the SQLite database, all business rules (headcount limits, leave balances, contract decisions) and ends contracts that pass their end date without an extension. |
| **Web** | [`web/`](web) | Vue 3 + Bootstrap admin site, the same frontend stack as HOMES. It only calls the API. |
| **Notifier** | [`notifier/`](notifier) | Background worker. Every hour it asks the API which contracts need a reminder, emails the managers through SMTP (nodemailer), and reports each result back. It has no database access. |

Each app has its own `package.json` and `.env`, so they can run on different machines (for example, web on Vercel, API and notifier on Render or a VPS). The full endpoint list is in [docs/api.md](docs/api.md).

## Getting started

You need **Node.js 20.19 or newer**.

```bash
git clone https://github.com/hendery666/hr-admin.git
cd hr-admin
npm install                     # installs all three apps (npm workspaces)

cp api/.env.example api/.env
cp notifier/.env.example notifier/.env
cp web/.env.example web/.env
```

Set the same long random `SERVICE_API_KEY` in `api/.env` and `notifier/.env`. Then start each app in its own terminal:

```bash
npm run dev:api        # API → http://localhost:4000/api/v1
npm run dev:web        # admin site → http://localhost:5173
npm run dev:notifier   # email worker (checks every hour)
```

Log in at http://localhost:5173 with `admin@company.com` / `ChangeMe123!` (or the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set before the first start), then change the password in **Settings**. With `SEED_DEMO_DATA=true`, the first start adds 5 departments and 19 demo employees, some with contracts ending within 30 days, so you can see reminders straight away.

## How contract reminders work

1. Each contract employee has a **contract end date**.
2. Every hour, the notifier calls `GET /api/v1/internal/contract-reminders/due`. The API returns active contracts ending within the reminder window (30 days by default, adjustable in **Settings**) that haven't had a reminder yet.
3. For each one, the notifier emails whoever should decide:
   1. the employee's **manager**;
   2. otherwise the **department head**;
   3. otherwise the **HR email** from Settings.

   The email includes the employee's details and a **Review contract** button that opens their page in the admin site.
4. The notifier reports the result to `POST /api/v1/internal/contract-reminders`. Each contract end date gets **one** reminder. Failed sends are retried on the next run.
5. In the admin site, the manager or HR can:
   - **Extend** the contract by 3, 6, 12 or 24 months, or to a chosen date. This starts a new reminder cycle for the new end date.
   - **Make the employee permanent.**
   - **Mark it as not renewing.** This is optional and only for the record.
6. **If nobody does anything, the contract ends on its end date.** The API marks the employee as *Contract ended*, which frees their headcount slot. Every change is kept in the employee's contract history.

### Sending real emails

Without SMTP settings, the notifier prints emails to its console, which is handy for demos. To send real emails, fill in the `SMTP_*` settings in `notifier/.env`. For Gmail:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-character-app-password
MAIL_FROM="HR Admin <you@gmail.com>"
```

Gmail needs an **App Password**, not your normal password: Google Account → Security → 2-Step Verification → App passwords.

To run the check from a cron job instead of keeping the notifier running, use `npm run once -w notifier`.

## Headcount

Each department has an **approved headcount**: 0 means no limit. The Departments page shows filled seats, open seats, how far over a department is, monthly payroll and contracts ending in the next 90 days. You can raise or lower the headcount with the +/– buttons.

Adding an employee to a full department, moving someone into one, or making an inactive employee active again is blocked with a "department is full" message. An admin can choose **Save anyway** to go over the limit. Employees whose contract ended, or who resigned or were terminated, don't count towards headcount.

## Tests

```bash
npm test               # API tests: starts the API on an in-memory database and calls every main endpoint
```

The 18 tests cover login, employee validation, headcount limits, the reminder list (including no duplicate sends and retrying failed ones), extending contracts, contracts ending automatically, and leave balances.

## Deployment

- **Web:** any static host. On Vercel, set the root directory to `web` and add `VITE_API_URL` (for example `https://your-api.onrender.com/api/v1`). `web/vercel.json` already handles page refreshes.
- **API:** any Node host with a persistent disk for the SQLite file (`DATABASE_FILE`). Start it with `npm start -w api`. Set `CORS_ORIGINS` and `WEB_URL` to your web app's address.
- **Notifier:** a background worker running `npm start -w notifier`, or a scheduled job running `npm run once -w notifier`. Set `API_URL` to your API.

## Project structure

```
├── api/
│   ├── src/
│   │   ├── index.js          # starts the API and the hourly contract-expiry job
│   │   ├── app.js            # routes (/api/v1)
│   │   ├── db.js             # SQLite schema and helpers
│   │   ├── auth.js           # password hashing and login tokens
│   │   ├── seed.js           # first admin account and demo data
│   │   ├── services/         # employees, departments, leave, contracts, dashboard
│   │   └── utils/dates.js
│   └── test/api.test.js
├── notifier/
│   └── src/                  # index.js (worker), mailer.js (SMTP), templates.js (email)
├── web/
│   └── src/
│       ├── api.js            # the web app's only connection to the backend
│       ├── router.js
│       ├── views/            # dashboard, employees, departments, contracts, leave, settings
│       └── components/
└── docs/api.md               # API reference
```
