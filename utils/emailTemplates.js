// utils/emailTemplates.js
// İmame HTML e-posta şablonları — KOYU (dark) heritage tasarım.
// Neden koyu: mail istemcileri (Gmail/Outlook/mobil) karanlık modda açık-zeminli
// mailleri zorla koyulaştırıp renkleri bozuyor. Koyu tasarım her iki modda da
// TUTARLI kalır ve uygulamanın koyu heritage kimliğiyle eşleşir.
// Email-client uyumu: tablo tabanlı, inline stil, web fontu YOK (Georgia), gradient YOK.
// Logo koyu üstünde okunsun diye krem madalyon içinde; Cloudinary'de barındırılıyor.

// Krem madalyon + altın çerçeve GÖRSELE gömülü (Cloudinary transform). Kritik:
// karanlık mod istemcileri HTML/CSS arka planlarını koyulaştırır ama GÖRSEL
// içeriğine dokunmaz — böylece logonun arkasındaki krem her yerde krem kalır.
const LOGO_URL =
  'https://res.cloudinary.com/dlazcw1gc/image/upload/e_trim/c_pad,w_440,h_248,b_rgb:fffdf7,r_28,bo_3px_solid_rgb:c9a24b/imame-brand/logo.png';

const B = {
  page: '#160d07',       // sayfa zemini (en koyu)
  card: '#241609',       // kart zemini (espresso)
  plate: '#2f1e10',      // kod plaketi zemini
  footer: '#120a05',     // footer bandı
  gold: '#c9a24b',
  goldSoft: '#a1743b',
  goldLine: 'rgba(201,162,75,0.30)',
  cream: '#f5e9d4',      // başlık / ana metin
  creamHi: '#fffdf7',    // madalyon zemini
  body: '#d6c4a8',       // gövde metni
  muted: '#a08a68',      // ikincil
  faint: '#8a7355',      // en soluk
};

function ornament() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="border-bottom:1px solid ${B.goldLine};font-size:0;line-height:0;">&nbsp;</td>
    <td style="width:44px;text-align:center;color:${B.gold};font-size:15px;line-height:15px;">&#10070;</td>
    <td style="border-bottom:1px solid ${B.goldLine};font-size:0;line-height:0;">&nbsp;</td>
  </tr></table>`;
}

function shell({ kicker, heading, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
<body style="margin:0;padding:0;background:${B.page};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${B.page};padding:30px 12px;">
    <tr><td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:${B.card};border:1px solid ${B.goldSoft};border-radius:18px;">
        <tr><td style="padding:10px;">

          <!-- İç altın hairline çerçeve -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${B.goldLine};border-radius:12px;">
            <tr><td style="padding:36px 40px 8px 40px;text-align:center;">

              <!-- Logo: krem madalyon + altın çerçeve görsele gömülü (dark-mode güvenli) -->
              <img src="${LOGO_URL}" width="240" alt="İmame" style="display:block;margin:0 auto;width:240px;max-width:72%;height:auto;">

              <div style="margin:24px 0 4px;">${ornament()}</div>

              ${kicker ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:${B.muted};margin-top:18px;">${kicker}</div>` : ''}
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;color:${B.cream};font-weight:bold;margin-top:6px;">${heading}</div>

            </td></tr>

            <tr><td style="padding:6px 40px 30px 40px;">${bodyHtml}</td></tr>

            <!-- Footer bandı -->
            <tr><td style="background:${B.footer};border-radius:0 0 12px 12px;padding:22px 40px;text-align:center;">
              <div style="font-family:Georgia,serif;font-size:15px;letter-spacing:3px;color:${B.cream};font-weight:bold;">İMAME</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:${B.faint};margin-top:10px;line-height:1.6;">Bu e-posta otomatik gönderildi · Lütfen yanıtlamayınız.</div>
            </td></tr>

          </table>

        </td></tr>
      </table>

    </td></tr>
  </table>
</body></html>`;
}

function resetPasswordEmail(code) {
  const subject = 'İmame — Şifre sıfırlama kodunuz';
  const text =
    `İmame şifre sıfırlama kodunuz: ${code}\n\n` +
    `Bu kod 15 dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayabilir, şifreniz değişmez.`;

  const bodyHtml = `
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:${B.body};margin:14px 0 22px 0;text-align:center;">
      Hesabınız için bir şifre sıfırlama isteği aldık. Yeni şifrenizi belirlemek için
      aşağıdaki doğrulama kodunu uygulamaya girin.
    </p>

    <!-- Kod plaketi -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="background:${B.plate};border:1.5px solid ${B.gold};border-radius:14px;">
          <tr><td style="padding:22px 42px;text-align:center;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:${B.gold};margin-bottom:12px;">DOĞRULAMA KODU</div>
            <div style="font-family:Georgia,'Courier New',monospace;font-size:40px;font-weight:bold;letter-spacing:14px;color:${B.creamHi};padding-left:14px;">${code}</div>
          </td></tr>
        </table>
      </td></tr>
    </table>

    <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${B.gold};margin:22px 0 6px 0;text-align:center;font-weight:bold;">
      Bu kod 15 dakika süreyle geçerlidir
    </p>
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.65;color:${B.muted};margin:0;text-align:center;">
      Bu isteği siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz — şifreniz değişmeden kalır.
    </p>`;

  return { subject, text, html: shell({ kicker: 'ŞİFRE SIFIRLAMA', heading: 'Doğrulama Kodunuz', bodyHtml }) };
}

module.exports = { resetPasswordEmail };
