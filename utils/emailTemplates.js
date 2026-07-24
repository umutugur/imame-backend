// utils/emailTemplates.js
// İmame markasına uygun HTML e-posta şablonları — "müzayede daveti / sertifika"
// estetiği: parşömen krem, altın çerçeve, logo emblemi, oyma kod plaketi.
// Email-client uyumu: tablo tabanlı, inline stil, web fontu YOK (Georgia serif),
// gradient/bg-image YOK (Outlook). Logo, Cloudinary'de barındırılan URL'den gelir.

const LOGO_URL = 'https://res.cloudinary.com/dlazcw1gc/image/upload/w_420/imame-brand/logo.png';

const B = {
  espresso: '#241609',
  brown: '#4e342e',
  gold: '#a1743b',
  goldLight: '#c9a24b',
  cream: '#fffdf7',
  parchment: '#e6ddc9',
  panel: '#fbf1da',
  text: '#3d2e20',
  muted: '#8a7358',
  frame: '#d8c39a',
  hair: '#e6d7b6',
};

// Altın çizgi — elmas — altın çizgi süsleme ayıracı
function ornament() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="border-bottom:1px solid ${B.hair};font-size:0;line-height:0;">&nbsp;</td>
    <td style="width:44px;text-align:center;color:${B.gold};font-size:15px;line-height:15px;">&#10070;</td>
    <td style="border-bottom:1px solid ${B.hair};font-size:0;line-height:0;">&nbsp;</td>
  </tr></table>`;
}

// Ortak çatı: parşömen zemin + altın çerçeveli krem kart + logo emblemi + footer
function shell({ kicker, heading, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${B.parchment};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${B.parchment};padding:30px 12px;">
    <tr><td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:${B.cream};border:1px solid ${B.frame};border-radius:18px;">
        <tr><td style="padding:10px;">

          <!-- İç hairline çerçeve (sertifika hissi) -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${B.hair};border-radius:12px;">
            <tr><td style="padding:34px 40px 8px 40px;text-align:center;">

              <!-- Logo emblemi -->
              <img src="${LOGO_URL}" width="200" alt="İmame" style="display:block;margin:0 auto;width:200px;max-width:74%;height:auto;">

              <div style="margin:20px 0 4px;">${ornament()}</div>

              <!-- Başlık -->
              ${kicker ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:${B.muted};margin-top:18px;">${kicker}</div>` : ''}
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;color:${B.espresso};font-weight:bold;margin-top:6px;">${heading}</div>

            </td></tr>

            <!-- İçerik -->
            <tr><td style="padding:6px 40px 30px 40px;">${bodyHtml}</td></tr>

            <!-- Footer bandı -->
            <tr><td style="background:${B.espresso};border-radius:0 0 12px 12px;padding:22px 40px;text-align:center;">
              <div style="font-family:Georgia,serif;font-size:15px;letter-spacing:3px;color:${B.cream};font-weight:bold;">İMAME</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#9c8768;margin-top:10px;line-height:1.6;">Bu e-posta otomatik gönderildi · Lütfen yanıtlamayınız.</div>
            </td></tr>

          </table>

        </td></tr>
      </table>

    </td></tr>
  </table>
</body></html>`;
}

// Şifre sıfırlama kodu maili
function resetPasswordEmail(code) {
  const subject = 'İmame — Şifre sıfırlama kodunuz';
  const text =
    `İmame şifre sıfırlama kodunuz: ${code}\n\n` +
    `Bu kod 15 dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayabilir, şifreniz değişmez.`;

  const bodyHtml = `
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.75;color:${B.text};margin:14px 0 22px 0;text-align:center;">
      Hesabınız için bir şifre sıfırlama isteği aldık. Yeni şifrenizi belirlemek için
      aşağıdaki doğrulama kodunu uygulamaya girin.
    </p>

    <!-- Oyma kod plaketi -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" style="background:${B.panel};border:1.5px solid ${B.goldLight};border-radius:14px;">
          <tr><td style="padding:22px 40px;text-align:center;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:${B.gold};margin-bottom:12px;">DOĞRULAMA KODU</div>
            <div style="font-family:Georgia,'Courier New',monospace;font-size:40px;font-weight:bold;letter-spacing:14px;color:${B.espresso};padding-left:14px;">${code}</div>
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
