// Sends email over SMTP with nodemailer. Without SMTP settings, emails are printed to the
// console instead (status "logged"), which is handy for demos and local development.
import nodemailer from "nodemailer";

export function createMailer(env = process.env) {
  const configured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
  const from = env.MAIL_FROM || env.SMTP_USER || "HR Admin <no-reply@example.com>";

  if (!configured) {
    return {
      configured: false,
      async send({ to, subject, text }) {
        console.log(`\n📧 [email not sent: SMTP not configured]\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
        return { status: "logged" };
      },
    };
  }

  const port = Number(env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  return {
    configured: true,
    verify: () => transporter.verify(),
    async send({ to, subject, text, html }) {
      await transporter.sendMail({ from, to, subject, text, html });
      return { status: "sent" };
    },
  };
}
