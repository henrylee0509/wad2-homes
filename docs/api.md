# HR API reference (v1)

Base URL: `http://localhost:4000/api/v1`. All requests and responses use JSON.

## Authentication

- **Admin endpoints:** send `Authorization: Bearer <token>`. Get a token from `POST /auth/login`. Tokens last 12 hours.
- **Internal endpoints** (`/internal/*`, used by the notifier): send `X-API-Key: <SERVICE_API_KEY>`.

Errors look like `{ "error": "Message for people", "code": "OPTIONAL_CODE" }`, with a matching HTTP status: 400 for invalid input, 401 when not logged in, 404 when something isn't found, and 409 for a conflict.

## Auth and admin accounts

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | `{ email, password }` | Returns `{ token, user }` |
| GET | `/auth/me` | | Current admin |
| POST | `/auth/password` | `{ current_password, new_password }` | New password must be 8+ characters |
| GET | `/users` | | Admin accounts |
| POST | `/users` | `{ name, email, password }` | Add an admin |
| DELETE | `/users/:id` | | You can't delete yourself |

## Employees

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/employees?search=&department_id=&status=&employment_type=` | List. Each employee includes `full_name`, `age`, `department_name`, `manager_name`, `leave_remaining` and `days_to_contract_end` |
| GET | `/employees/:id` | One employee, plus their `leave`, `contract_history` and direct `reports` |
| POST | `/employees` | Create. Returns **409 `HEADCOUNT_FULL`** if the department is full; send `override_headcount: true` to go over the limit anyway |
| PUT | `/employees/:id` | Update any fields. The same headcount check applies when moving department or becoming active again |
| DELETE | `/employees/:id` | Permanently delete (prefer setting `status` to `resigned`) |

Employee fields:
- `employee_no`, `first_name`, `last_name`, `date_of_birth`, `gender`
- `email`, `phone`, `address`, `emergency_contact_name`, `emergency_contact_phone`
- `department_id`, `job_title`, `manager_id`
- `employment_type`: `permanent`, `contract`, `part_time` or `intern`
- `start_date`, `contract_end_date`, `salary` (monthly, in SGD), `annual_leave_days`
- `status`: `active`, `resigned`, `terminated` or `contract_ended`
- `notes`

Dates are `YYYY-MM-DD`.

## Contracts

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/contracts/upcoming?days=90` | | Active contracts ending within `days`, with reminder status and decision |
| GET | `/contracts/reminders` | | Reminder log, newest first |
| POST | `/employees/:id/contract/extend` | `{ new_end_date, note }` or `{ make_permanent: true, note }` | Records history and starts a new reminder cycle |
| POST | `/employees/:id/contract/not-renewing` | `{ note }` | Optional, for the record only. The contract still ends on its date |

Contracts that pass their end date without an extension are set to `status: contract_ended` automatically. The API checks this at start-up and then every hour.

## Departments and headcount

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/departments` | | Each department includes `active_count`, `headcount_limit`, `vacancies`, `over_by`, `utilisation`, `monthly_payroll` and `contracts_ending_90d` |
| POST | `/departments` | `{ name, code, headcount_limit, head_employee_id }` | `headcount_limit` 0 = no limit |
| PUT | `/departments/:id` | same as POST | |
| DELETE | `/departments/:id` | | Blocked (409) while the department has active employees |

## Leave

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/leave?employee_id=&year=` | | Leave records |
| POST | `/leave` | `{ employee_id, leave_type, start_date, end_date, days?, reason?, allowNegative? }` | `days` defaults to the number of calendar days. Annual leave over the remaining balance returns **409 `INSUFFICIENT_LEAVE`** unless `allowNegative` is true |
| DELETE | `/leave/:id` | | |

`leave_type` is `annual`, `sick`, `unpaid` or `other`.

## Dashboard and settings

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/dashboard` | Totals, departments, contracts ending in 60 days, recent reminders |
| GET | `/settings` | `company_name`, `reminder_days_before`, `hr_email`, `app_url` |
| PUT | `/settings` | Any of the above. `reminder_days_before` must be 1–365 |
| GET | `/health` | `{ ok: true }`, no auth needed |

## Internal (notifier only, `X-API-Key`)

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/internal/contract-reminders/due` | | `{ company_name, reminder_days_before, reminders: [...] }`. Each reminder has the employee details, `recipient` (email), `recipient_name`, `days_left` and `review_url` |
| POST | `/internal/contract-reminders` | `{ employee_id, contract_end_date, recipient, status, error? }` | `status` is `sent`, `logged`, `failed` or `no_recipient`. A `failed` reminder is offered again on the next check; the others are final for that end date |
