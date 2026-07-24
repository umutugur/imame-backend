// utils/mailer.js
// Basit SMTP posta gönderici. Ortam değişkenleri eksikse (ör. yerel geliştirme)
// e-postayı göndermek yerine konsola yazdırır — akış kesilmesin diye.
const nodemailer = require('nodemailer');
const dns = require('dns');

// Render gibi IPv6 çıkışı olmayan platformlarda smtp.gmail.com önce IPv6'ya
// çözülüp `connect ENETUNREACH ...:465` ile takılıyor. IPv4'ü tercih ettir.
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {
  /* eski Node sürümlerinde yoksa yok say */
}

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
    family: 4, // IPv4'e zorla (Render IPv6 çıkışı yok)
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
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
