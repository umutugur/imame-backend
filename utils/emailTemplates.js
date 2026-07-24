// utils/emailTemplates.js
// İmame HTML e-posta şablonları — TAM dark-mode-dayanıklı.
// Mail istemcileri (özellikle mobil karanlık mod) HER HTML rengini (koyu dahil)
// bozuyor ve HTML blokları görsellerle aynı genişliğe oturmuyor. Bu yüzden tasarımın
// TAMAMI görsel: üst + kod bandı + alt, üçü de 600px (hizalı), Cloudinary'de barındırılıyor.
// Görsel pikselleri dark-mode'dan etkilenmez → her cihaz/modda BİREBİR aynı.
// Kod, kod bandı görseline Cloudinary text-overlay ile GÖMÜLÜR (dinamik).
// Kopyalanabilirlik için: altta AYRICA altın renkli düz kod satırı (altın hem açık
// hem koyu zeminde okunur → dark-mode güvenli tek metin rengi).
// Kaynak HTML + üretim notları: scripts/email-assets/.

const CLD = 'https://res.cloudinary.com/dlazcw1gc/image/upload';
const IMG_TOP = `${CLD}/v1784927107/imame-brand/reset_top.png`;
const IMG_BOTTOM = `${CLD}/v1784927108/imame-brand/reset_bottom.png`;

// Kod bandı: statik espresso görsel + koda göre dinamik text-overlay
function codeBandUrl(code) {
  const spaced = String(code).split('').join('%20'); // rakamlar arası boşluk
  return `${CLD}/l_text:Georgia_82_bold:${spaced},co_rgb:f5e9d4,g_south,y_38/imame-brand/reset_band.png`;
}

function resetPasswordEmail(code) {
  const subject = 'İmame — Şifre sıfırlama kodunuz';
  const text =
    `İmame şifre sıfırlama kodunuz: ${code}\n\n` +
    `Bu kod 15 dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayabilir, şifreniz değişmez.`;

  const imgStyle = 'display:block;width:100%;max-width:600px;height:auto;border:0;';

  const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"></head>
<body style="margin:0;padding:0;background:#d8cdb8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#d8cdb8;padding:26px 0;">
    <tr><td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr><td style="font-size:0;line-height:0;">
          <img src="${IMG_TOP}" width="600" alt="İmame — Doğrulama Kodunuz" style="${imgStyle}">
        </td></tr>
        <tr><td style="font-size:0;line-height:0;">
          <img src="${codeBandUrl(code)}" width="600" alt="Doğrulama kodu: ${code}" style="${imgStyle}">
        </td></tr>
        <tr><td style="font-size:0;line-height:0;">
          <img src="${IMG_BOTTOM}" width="600" alt="" style="${imgStyle}">
        </td></tr>

        <!-- Kopyalanabilir kod (altın = dark-mode güvenli metin) -->
        <tr><td align="center" style="padding:16px 12px 0;">
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#a1743b;">Kodu kopyalamak için:&nbsp;</span>
          <span style="font-family:'Courier New',monospace;font-size:15px;font-weight:bold;letter-spacing:2px;color:#a1743b;">${code}</span>
        </td></tr>
      </table>

    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

module.exports = { resetPasswordEmail };
