# E-posta görsel kaynakları

Şifre sıfırlama mailinin açık/parşömen kısımları, dark-mode istemcilerin renkleri
bozmaması için GÖRSEL olarak render edilip Cloudinary'de barındırılır (kod ise
`utils/emailTemplates.js` içinde koyu bantta gerçek/kopyalanabilir metindir).

## Yeniden üretmek (tasarımı değiştirince)
1. `reset_top.html` / `reset_bottom.html`'i düzenle.
2. Headless Chrome ile 2x render + şeffaf kenarları kırp:
   ```bash
   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
   "$CHROME" --headless=new --disable-gpu --force-device-scale-factor=2 --hide-scrollbars \
     --default-background-color=00000000 --screenshot=top.png --window-size=600,600 reset_top.html
   # PIL ile getbbox()->crop (bkz. üretim notları)
   ```
3. Cloudinary'ye `imame-brand/reset_top` ve `reset_bottom` public_id ile overwrite yükle.
4. `utils/emailTemplates.js` içindeki `IMG_TOP` / `IMG_BOTTOM` versiyonlu URL'lerini güncelle.
