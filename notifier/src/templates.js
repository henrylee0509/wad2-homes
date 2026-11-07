// Contract-ending reminder email for the employee's manager.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function contractReminderEmail(r, companyName = "Your company") {
  const ends = formatDate(r.contract_end_date);
  const when = r.days_left === 0 ? "today" : r.days_left === 1 ? "tomorrow" : `in ${r.days_left} days`;
  const subject = `Action needed: ${r.employee_name}'s contract ends on ${ends}`;

  const text = [
    `Hi ${r.recipient_name || ""},`.trim(),
    "",
    `${r.employee_name}'s contract ends ${when}, on ${ends}.`,
    "",
    `Employee:   ${r.employee_name} (${r.employee_no})`,
    `Role:       ${r.job_title || "-"}`,
    `Department: ${r.department_name || "-"}`,
    `Started:    ${r.start_date ? formatDate(r.start_date) : "-"}`,
    "",
    "Please decide whether to extend the contract.",
    r.review_url ? `Review and extend it here: ${r.review_url}` : "You can extend it from the employee's page in the HR admin portal.",
    "",
    `If you don't want to renew it, you don't need to do anything: the contract will end on ${ends}.`,
    "",
    `${companyName} HR`,
  ].join("\n");

  const row = (label, value) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap">${label}</td><td style="padding:6px 0;color:#111827;font-weight:500">${esc(value || "-")}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#4338ca;color:#ffffff;padding:18px 24px;font-size:16px;font-weight:600">${esc(companyName)} · Contract review</div>
    <div style="padding:24px">
      <p style="margin:0 0 12px;color:#111827">Hi ${esc(r.recipient_name || "there")},</p>
      <p style="margin:0 0 16px;color:#111827"><strong>${esc(r.employee_name)}</strong>'s contract ends <strong>${esc(when)}</strong>, on <strong>${esc(ends)}</strong>.</p>
      <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px">
        ${row("Employee", `${r.employee_name} (${r.employee_no})`)}
        ${row("Role", r.job_title)}
        ${row("Department", r.department_name)}
        ${row("Started", r.start_date ? formatDate(r.start_date) : "")}
      </table>
      <p style="margin:0 0 16px;color:#111827">Please decide whether to extend the contract.</p>
      ${r.review_url ? `<p style="margin:0 0 20px"><a href="${esc(r.review_url)}" style="display:inline-block;background:#4338ca;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Review contract</a></p>` : ""}
      <p style="margin:0;color:#6b7280;font-size:13px">Not renewing? You don't need to do anything. The contract will end on ${esc(ends)}.</p>
    </div>
  </div>
</body></html>`;

  return { subject, text, html };
}
