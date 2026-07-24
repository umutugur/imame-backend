// utils/mailer.js
// Basit SMTP posta gönderici. Ortam değişkenleri eksikse (ör. yerel geliştirme)
// e-postayı göndermek yerine konsola yazdırır — akış kesilmesin diye.
const nodemailer = require('nodemailer');

let transporter = null;
let transporterChecked = false;

function getTransporter() {
  if (transporterChecked) return transporter;
  transporterChecked = true;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    transporter = null;
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter;
}

/**
 * sendMail({ to, subject, text, html })
 * SMTP ortam değişkenleri eksikse e-postayı göndermek yerine konsola yazar (dev fallback).
 */
async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();

  if (!t) {
    console.log('📧 [mailer] SMTP yapılandırılmamış — e-posta konsola yazdırılıyor:');
    console.log(`  Kime: ${to}`);
    console.log(`  Konu: ${subject}`);
    console.log(`  İçerik: ${text || html}`);
    return { devFallback: true };
  }

  return t.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
}

module.exports = { sendMail };
