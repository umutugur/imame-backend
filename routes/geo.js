// routes/geo.js — il / ilçe / mahalle referans verisi.
//
// Ham JSON'lar (data/geo) toplam ~10.8 MB. Bunlar eskiden /seller altında statik
// olarak servis ediliyordu, yani herkes tek istekle 2.8 MB'lık dosyaları
// indirebiliyordu. Artık dosyalar statik yolun dışında; panel yalnızca seçtiği
// ilçenin mahallelerini çekiyor.
//
// İndeks ilk istekte kurulur (açılışta değil) — normal API trafiği bu maliyeti
// ödemesin diye. Bellekte yalnızca {id, ad} tutulur, ham kayıtlar atılır.
const express = require('express');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

let index = null;

function buildIndex() {
  if (index) return index;

  const sehirler = require('../data/geo/sehirler.json');
  const ilceler = require('../data/geo/ilceler.json');

  const iller = sehirler.map((s) => ({ id: s.sehir_id, ad: s.sehir_adi }));

  const ilcelerByIl = new Map();
  for (const i of ilceler) {
    const key = String(i.sehir_id);
    if (!ilcelerByIl.has(key)) ilcelerByIl.set(key, []);
    ilcelerByIl.get(key).push({ id: i.ilce_id, ad: i.ilce_adi });
  }

  const mahallelerByIlce = new Map();
  for (const dosya of ['mahalleler-1', 'mahalleler-2', 'mahalleler-3', 'mahalleler-4']) {
    const yol = `../data/geo/${dosya}.json`;
    for (const m of require(yol)) {
      const key = String(m.ilce_id);
      if (!mahallelerByIlce.has(key)) mahallelerByIlce.set(key, []);
      mahallelerByIlce.get(key).push({ id: m.mahalle_id, ad: m.mahalle_adi });
    }
    // Ham JSON'u require önbelleğinden düşür; 10.8 MB'ı boşuna tutmayalım.
    delete require.cache[require.resolve(yol)];
  }

  index = { iller, ilcelerByIl, mahallelerByIlce };
  return index;
}

const byAd = (a, b) => a.ad.localeCompare(b.ad, 'tr');

router.get('/api/geo/iller', requireAuth(['admin']), (_req, res) => {
  const { iller } = buildIndex();
  res.json({ ok: true, items: [...iller].sort(byAd) });
});

router.get('/api/geo/ilceler', requireAuth(['admin']), (req, res) => {
  const { ilcelerByIl } = buildIndex();
  const list = ilcelerByIl.get(String(req.query.ilId || '')) || [];
  res.json({ ok: true, items: [...list].sort(byAd) });
});

router.get('/api/geo/mahalleler', requireAuth(['admin']), (req, res) => {
  const { mahallelerByIlce } = buildIndex();
  const list = mahallelerByIlce.get(String(req.query.ilceId || '')) || [];
  res.json({ ok: true, items: [...list].sort(byAd) });
});

module.exports = router;
