// utils/mailer.js
// E-posta gönderimi. Öncelik sırası:
//   1) BREVO_API_KEY varsa → Brevo HTTP API (HTTPS/443, buluttan güvenilir; Render'da SMTP engelli)
//   2) SMTP_* varsa → nodemailer (yerel/alternatif)
//   3) hiçbiri yoksa → konsola yaz (dev fallback), akış kesilmesin
const nodemailer = require('nodemailer');
const axios = require('axios');
const dns = require('dns');

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {
  /* eski Node sürümlerinde yoksa yok say */
}

// "İmame <no-reply@site.com>" → { name, email }
function parseSender(raw) {
  const fallbackEmail = process.env.SMTP_USER || 'no-reply@imame.app';
  if (!raw) return { name: 'İmame', email: fallbackEmail };
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { name: (m[1] || 'İmame').trim(), email: m[2].trim() };
  return { name: 'İmame', email: raw.trim() };
}

// ── 1) Brevo HTTP API ──
async function sendViaBrevo({ to, subject, text, html }) {
  const sender = parseSender(process.env.MAIL_FROM);
  const res = await axios.post(
    'https://api.brevo.com/v3/smtp/email',
    {
      sender,
      to: [{ email: to }],
      subject,
      textContent: text || undefined,
      htmlContent: html || undefined,
    },
    {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    }
  );
  return { messageId: res.data?.messageId, provider: 'brevo' };
}

// ── 2) SMTP (nodemailer) ──
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
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transporter;
}

/**
 * sendMail({ to, subject, text, html })
 * Brevo API > SMTP > konsol sırasıyla dener.
 */
async function sendMail({ to, subject, text, html }) {
  if (process.env.BREVO_API_KEY) {
    try {
      return await sendViaBrevo({ to, subject, text, html });
    } catch (err) {
      // Brevo API hatasını anlaşılır logla (yanıt gövdesiyle)
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      const e = new Error(`Brevo API hatası: ${detail}`);
      throw e;
    }
  }

  const t = getTransporter();
  if (!t) {
    console.log('📧 [mailer] E-posta sağlayıcı yapılandırılmamış — konsola yazdırılıyor:');
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
