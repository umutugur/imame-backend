// utils/emailTemplates.js
// İmame HTML e-posta şablonları — DARK-MODE-DAYANIKLI hibrit yapı:
//   • Tasarımın açık/parşömen kısımları GÖRSEL olarak render edildi (Cloudinary'de
//     barındırılıyor). Mail istemcileri görsel piksellerini koyulaştıramaz → renkler
//     her cihazda, açık/koyu her modda BİREBİR aynı kalır.
//   • Doğrulama kodu gerçek HTML metindir (KOPYALANABİLİR) ve KOYU bir bant içinde
//     durur — "koyu zemin + açık yazı", dark-mode'un dokunmadığı tek HTML kombinasyonu.
// Görseller headless Chrome ile üretilip Cloudinary'ye yüklendi (bkz. scripts/).

const IMG_TOP =
  'https://res.cloudinary.com/dlazcw1gc/image/upload/v1784927107/imame-brand/reset_top.png';
const IMG_BOTTOM =
  'https://res.cloudinary.com/dlazcw1gc/image/upload/v1784927108/imame-brand/reset_bottom.png';

function resetPasswordEmail(code) {
  const subject = 'İmame — Şifre sıfırlama kodunuz';
  const text =
    `İmame şifre sıfırlama kodunuz: ${code}\n\n` +
    `Bu kod 15 dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayabilir, şifreniz değişmez.`;

  const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"></head>
<body style="margin:0;padding:0;background:#e6ddc9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e6ddc9;padding:30px 12px;">
    <tr><td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">

        <!-- Üst: kilitli açık tasarım (görsel) -->
        <tr><td style="font-size:0;line-height:0;">
          <img src="${IMG_TOP}" width="600" alt="İmame — Doğrulama Kodunuz" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
        </td></tr>

        <!-- Orta: kopyalanabilir kod, koyu bant (dark-mode güvenli) -->
        <tr><td style="background:#241609;border-left:2px solid #c9a24b;border-right:2px solid #c9a24b;padding:24px 20px 26px;text-align:center;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:#c9a24b;margin-bottom:12px;">DOĞRULAMA KODU</div>
          <div style="font-family:Georgia,'Courier New',monospace;font-size:42px;font-weight:bold;letter-spacing:14px;color:#f5e9d4;padding-left:14px;">${code}</div>
        </td></tr>

        <!-- Alt: kilitli açık tasarım (görsel) -->
        <tr><td style="font-size:0;line-height:0;">
          <img src="${IMG_BOTTOM}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
        </td></tr>

      </table>

    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

module.exports = { resetPasswordEmail };
