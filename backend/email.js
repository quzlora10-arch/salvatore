const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false") === "true";

  if (!host || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP ayarları eksik. .env dosyasını doldurun.");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return transporter;
}

async function sendVerificationCode(email, code) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  await getTransporter().sendMail({
    from,
    to: email,
    subject: "Salvatore doğrulama kodunuz",
    text: `Salvatore hesabınızı tamamlamak için doğrulama kodunuz: ${code}\n\nKod 10 dakika geçerlidir.`,
    html: `<div style="font-family:Arial,sans-serif"><h2>Salvatore</h2><p>Hesabınızı tamamlamak için doğrulama kodunuz:</p><div style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</div><p>Bu kod 10 dakika geçerlidir.</p></div>`
  });
}

module.exports = { sendVerificationCode };
