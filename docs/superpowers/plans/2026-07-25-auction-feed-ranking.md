# Mezat Feed Sıralaması — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ana ekranı adil teşhirli, sayfalı bir feed'e çevirmek: kullanıcının o gün görmedikleri, genel olarak en az görülenler önce.

**Architecture:** Kullanıcı başına günlük "görüldü" kümesi hem adalet ölçümü hem sayfalama imleci olarak kullanılır. Sıralama bellekte yapılır (görülme kovası → teklif/gösterim oranı → kullanıcıya özel sabit rastgelelik). İstemci görünen kartları toplu bildirir.

**Tech Stack:** Express 5 + Mongoose 8 (CommonJS), React Native / Expo 53, MongoDB TTL indeksi.

**Spec:** `docs/superpowers/specs/2026-07-25-auction-feed-ranking-design.md`

**Not (test altyapısı):** Bu depolarda test çatısı yok. TDD yerine her görevde **`node --check` + çalışan sunucuya `curl` ile davranış doğrulaması** (frontend'de babel + bundle derlemesi) kullanılır. Doğrulama adımları beklenen çıktıyı açıkça yazar.

---

## Dosya haritası

| Dosya | Sorumluluk | Durum |
|-------|-----------|-------|
| `models/Auction.js` | `impressionCount`, `bidCount` sayaçları + indeks | Değişir |
| `models/AuctionSeen.js` | Kullanıcı-gün "görüldü" kümesi + TTL | **Yeni** |
| `utils/auctionDayKey.js` | Mezat döngüsü gün anahtarı (`YYYY-MM-DD`) | **Yeni** |
| `utils/feedRanking.js` | FNV-1a hash + sıralama fonksiyonu (saf, I/O yok) | **Yeni** |
| `middlewares/auth.js` | `optionalAuth` eklenir (token varsa çözer, yoksa geçer) | Değişir |
| `routes/auction.js` | `GET /feed`, `POST /impressions` | Değişir |
| `routes/bid.js` | Teklifte `bidCount` artırımı | Değişir |
| `scripts/backfillBidCounts.js` | Mevcut mezatların `bidCount` düzeltmesi | **Yeni** |
| `scripts/seedMockAuctions.js` | 100 mezatlık gerçekçi seed (tespih görselleri) | Yeniden yazılır |
| `frontend/screens/HomeScreen.js` | Sayfalı feed + sonsuz kaydırma + görüntülenme bildirimi | Değişir |
| `frontend/utils/feedSeed.js` | Misafir tohumu (AsyncStorage) | **Yeni** |

---

## FAZ 1 — Backend

### Task 1: Sayaçlar ve indeks (`models/Auction.js`)

**Files:** Modify `models/Auction.js`

- [ ] **Step 1: Şemaya iki sayaç ekle**

`receiptStatus` alanının hemen altına, kapanış `});` satırından önce:

```js
  // Feed sıralaması için sayaçlar
  impressionCount: { type: Number, default: 0 },
  bidCount: { type: Number, default: 0 },
```

- [ ] **Step 2: İndeksi ekle**

`module.exports` satırından hemen önce:

```js
auctionSchema.index({ isEnded: 1, impressionCount: 1 });
```

- [ ] **Step 3: Doğrula**

Run: `node --check models/Auction.js`
Expected: çıktı yok (hatasız).

- [ ] **Step 4: Commit**

```bash
git add models/Auction.js
git commit -m "feat(auction): add impression/bid counters for feed ranking"
```

---

### Task 2: Gün anahtarı ve "görüldü" modeli

**Files:** Create `utils/auctionDayKey.js`, Create `models/AuctionSeen.js`

- [ ] **Step 1: `utils/auctionDayKey.js` oluştur**

```js
// utils/auctionDayKey.js
// Mezat döngüsü gün anahtarı. Gün sınırı gece yarısı DEĞİL, TR 22:00'dir;
// calculateEndsAt() zaten geçerli döngünün bitişini verir, onu tarihe çeviririz.
const calculateEndsAt = require('./calculateEndsAt');

function auctionDayKey() {
  return calculateEndsAt().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

module.exports = auctionDayKey;
```

- [ ] **Step 2: `models/AuctionSeen.js` oluştur**

```js
// models/AuctionSeen.js
// Kullanıcı başına GÜNDE TEK doküman: o mezat döngüsünde gördüğü mezatlar.
// TTL ile 36 saat sonra otomatik silinir (mezatlar günlük olduğu için yeterli).
const mongoose = require('mongoose');

const auctionSeenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  day: { type: String, required: true },
  seen: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Auction' }],
  createdAt: { type: Date, default: Date.now },
});

auctionSeenSchema.index({ user: 1, day: 1 }, { unique: true });
auctionSeenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 129600 }); // 36 saat

module.exports = mongoose.model('AuctionSeen', auctionSeenSchema);
```

- [ ] **Step 3: Gün anahtarını doğrula**

Run: `node -e "require('dotenv').config(); console.log(require('./utils/auctionDayKey')())"`
Expected: `2026-07-25` biçiminde bir tarih (bugünkü döngünün bitiş günü).

- [ ] **Step 4: Söz dizimini doğrula**

Run: `node --check models/AuctionSeen.js && node --check utils/auctionDayKey.js`
Expected: çıktı yok.

- [ ] **Step 5: Commit**

```bash
git add models/AuctionSeen.js utils/auctionDayKey.js
git commit -m "feat(feed): add daily seen-set model and auction day key"
```

---

### Task 3: Sıralama fonksiyonu (`utils/feedRanking.js`)

**Files:** Create `utils/feedRanking.js`

- [ ] **Step 1: Dosyayı oluştur**

```js
// utils/feedRanking.js
// Saf sıralama mantığı (I/O yok, test edilebilir).
// Öncelik: 1) görülme kovası artan  2) teklif/gösterim oranı azalan  3) sabit rastgelelik
const BUCKET_SIZE = 10;

// FNV-1a 32-bit → 0..1 arası deterministik değer
function hash01(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0xffffffff;
}

/**
 * rankAuctions(candidates, seed)
 * candidates: [{ _id, impressionCount, bidCount }]
 * seed: kullanıcı kimliği (girişli) veya istemci tohumu (misafir)
 * dönüş: sıralanmış [{ id, bucket, merit, jitter }]
 */
function rankAuctions(candidates, seed) {
  return candidates
    .map((a) => {
      const impressions = a.impressionCount || 0;
      const bids = a.bidCount || 0;
      return {
        id: a._id,
        bucket: Math.floor(impressions / BUCKET_SIZE),
        merit: bids / Math.max(impressions, 1),
        jitter: hash01(`${a._id}:${seed}`),
      };
    })
    .sort((x, y) => x.bucket - y.bucket || y.merit - x.merit || x.jitter - y.jitter);
}

module.exports = { rankAuctions, hash01, BUCKET_SIZE };
```

- [ ] **Step 2: Davranışı doğrula**

Run:
```bash
node -e "
const { rankAuctions, hash01 } = require('./utils/feedRanking');
// 1) Az görülen önce gelir
const r = rankAuctions([
  { _id: 'a', impressionCount: 50, bidCount: 0 },
  { _id: 'b', impressionCount: 0,  bidCount: 0 },
], 'seed1');
console.log('az-görülen-önce:', r[0].id === 'b');
// 2) Aynı kovada yüksek oran önce
const r2 = rankAuctions([
  { _id: 'c', impressionCount: 5, bidCount: 0 },
  { _id: 'd', impressionCount: 5, bidCount: 3 },
], 'seed1');
console.log('liyakat-önce:', r2[0].id === 'd');
// 3) Aynı tohum aynı sırayı verir, farklı tohum farklı
const pool = Array.from({length:20},(_,i)=>({_id:'x'+i,impressionCount:0,bidCount:0}));
const s1 = rankAuctions(pool,'u1').map(r=>r.id).join();
const s1b= rankAuctions(pool,'u1').map(r=>r.id).join();
const s2 = rankAuctions(pool,'u2').map(r=>r.id).join();
console.log('kararlı:', s1===s1b, '| kullanıcıya-özel:', s1!==s2);
console.log('hash aralığı:', hash01('abc') >= 0 && hash01('abc') <= 1);
"
```
Expected:
```
az-görülen-önce: true
liyakat-önce: true
kararlı: true | kullanıcıya-özel: true
hash aralığı: true
```

- [ ] **Step 3: Commit**

```bash
git add utils/feedRanking.js
git commit -m "feat(feed): add deterministic fairness-first ranking"
```

---

### Task 4: `optionalAuth` middleware

**Files:** Modify `middlewares/auth.js`

- [ ] **Step 1: Fonksiyonu ekle**

Mevcut `requireAuth` tanımından sonra, `module.exports` satırından önce:

```js
// Token varsa çözer ve req.user'ı doldurur; yoksa/geçersizse sessizce devam eder.
// Misafir de erişebilen ama girişliye kişiselleşen uçlar için (feed, impressions).
function optionalAuth() {
  return async (req, res, next) => {
    try {
      const hdr = req.headers.authorization || '';
      const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
      if (!token) return next();

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const u = await User.findById(decoded.id).select('role isBanned bannedUntil');
      const stillBanned = u && u.isBanned && (!u.bannedUntil || new Date(u.bannedUntil) > new Date());
      if (u && !stillBanned) {
        req.user = { id: decoded.id, role: u.role, email: decoded.email };
      }
      next();
    } catch (e) {
      next(); // geçersiz token misafir sayılır
    }
  };
}
```

- [ ] **Step 2: Dışa aktar**

`module.exports` satırını güncelle:

```js
module.exports = { requireAuth, requireCronKey, optionalAuth };
```

> Mevcut export satırında hangi isimler varsa hepsini koru, sadece `optionalAuth` ekle.

- [ ] **Step 3: Doğrula**

Run: `node --check middlewares/auth.js && node -e "require('dotenv').config(); const m=require('./middlewares/auth'); console.log('optionalAuth:', typeof m.optionalAuth, '| requireAuth:', typeof m.requireAuth, '| requireCronKey:', typeof m.requireCronKey)"`
Expected: `optionalAuth: function | requireAuth: function | requireCronKey: function`

- [ ] **Step 4: Commit**

```bash
git add middlewares/auth.js
git commit -m "feat(auth): add optionalAuth for guest-friendly personalised routes"
```

---

### Task 5: `GET /api/auctions/feed`

**Files:** Modify `routes/auction.js`

- [ ] **Step 1: Importları ekle**

Dosyanın en üstündeki mevcut import bloğuna:

```js
const mongoose = require('mongoose');
const AuctionSeen = require('../models/AuctionSeen');
const auctionDayKey = require('../utils/auctionDayKey');
const { rankAuctions } = require('../utils/feedRanking');
const { optionalAuth } = require('../middlewares/auth');
```

> `requireAuth` zaten import edilmişse satırı `const { requireAuth, optionalAuth } = require('../middlewares/auth');` şeklinde birleştir, çift import bırakma.

- [ ] **Step 2: `/feed` route'unu ekle**

⚠️ **KRİTİK:** Bu route mutlaka `router.get('/:id', ...)` satırından **ÖNCE** gelmeli; aksi halde Express `/feed` isteğini `/:id` ile eşleştirir (`id="feed"`). Mevcut `/all` route'unun hemen ardına yerleştir.

```js
// ✅ Adil teşhirli feed — misafir + girişli (sayfalı)
router.get('/feed', optionalAuth(), async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const userId = req.user?.id || null;
    const seed = userId || String(req.query.seed || Math.random());

    // 1) Aday havuzu — sıralama için sadece küçük alanlar
    const candidates = await Auction.find({ isEnded: false })
      .select('_id impressionCount bidCount')
      .lean();

    // 2) Kullanıcının bugün gördükleri
    let seenIds = new Set();
    if (userId) {
      const doc = await AuctionSeen.findOne({ user: userId, day: auctionDayKey() })
        .select('seen')
        .lean();
      if (doc && doc.seen) seenIds = new Set(doc.seen.map(String));
    }

    // 3) Faz seçimi: görülmemişler bitince ikinci tur
    const unseen = candidates.filter((a) => !seenIds.has(String(a._id)));
    const phase = unseen.length > 0 ? 'unseen' : 'seen';
    const pool = phase === 'unseen' ? unseen : candidates;

    // 4) Sırala ve dilimle (ikinci turda offset kullanılır)
    const ranked = rankAuctions(pool, seed);
    const start = phase === 'seen' ? offset : 0;
    const ids = ranked.slice(start, start + limit).map((r) => r.id);

    // 5) Tam dokümanları çek, sırayı koru
    const docs = await Auction.find({ _id: { $in: ids } })
      .populate('seller', 'companyName')
      .lean();
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    const items = ids.map((id) => byId.get(String(id))).filter(Boolean);

    res.json({
      items,
      hasMore: phase === 'seen' ? start + limit < ranked.length : ranked.length > limit,
      phase,
    });
  } catch (err) {
    console.error('Feed listeleme hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});
```

- [ ] **Step 3: Doğrula (sunucuyu başlat)**

```bash
node --check routes/auction.js
PORT=5610 node index.js > /tmp/feed_test.log 2>&1 &
sleep 8
curl -s "http://localhost:5610/api/auctions/feed?limit=3" | head -c 200; echo
curl -s "http://localhost:5610/api/auctions/feed?limit=3" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('items:',j.items.length,'| phase:',j.phase,'| hasMore:',j.hasMore,'| seller alanı:',!!j.items[0]?.seller)})"
```
Expected: `items: 3 | phase: unseen | hasMore: true | seller alanı: true`
(Aktif mezat sayısı 3'ten azsa `items` o sayıya eşit olur.)

Sunucuyu kapatmayı unutma: `pkill -f "node index.js"`

- [ ] **Step 4: Commit**

```bash
git add routes/auction.js
git commit -m "feat(feed): add paginated fair-exposure auction feed endpoint"
```

---

### Task 6: `POST /api/auctions/impressions`

**Files:** Modify `routes/auction.js`

- [ ] **Step 1: Route'u ekle**

`/feed` route'unun hemen ardına (yine `/:id`'den önce):

```js
// ✅ Görüntülenme bildirimi — istemci görünen kartları toplu gönderir
router.post('/impressions', optionalAuth(), async (req, res) => {
  try {
    const raw = Array.isArray(req.body && req.body.auctionIds) ? req.body.auctionIds : [];
    const ids = [...new Set(raw.map(String))]
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .slice(0, 50);
    if (!ids.length) return res.json({ ok: true });

    const userId = req.user?.id || null;

    // Satıcının kendi mezatları SAYILMAZ (kendi ilanını yenileyerek şişirmesin)
    let countable = ids;
    if (userId) {
      const owned = await Auction.find({ _id: { $in: ids }, seller: userId })
        .select('_id')
        .lean();
      const ownedSet = new Set(owned.map((a) => String(a._id)));
      countable = ids.filter((id) => !ownedSet.has(id));
    }

    if (countable.length) {
      await Auction.updateMany({ _id: { $in: countable } }, { $inc: { impressionCount: 1 } });
    }

    // "Görüldü" kümesine TÜM gösterilenler yazılır (kendi mezatları dahil) —
    // tekrar gösterilmesinler diye. Sadece SAYAÇ hariç tutulur.
    if (userId) {
      await AuctionSeen.updateOne(
        { user: userId, day: auctionDayKey() },
        { $addToSet: { seen: { $each: ids } }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Görüntülenme kaydı hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});
```

- [ ] **Step 2: Uçtan uca doğrula (sayaç artıyor + görülen tekrar gelmiyor)**

```bash
node --check routes/auction.js
PORT=5610 node index.js > /tmp/feed_test.log 2>&1 &
sleep 8
# a) Misafir: sayaç artıyor mu?
ID=$(curl -s "http://localhost:5610/api/auctions/feed?limit=1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).items[0]._id))")
BEFORE=$(curl -s "http://localhost:5610/api/auctions/$ID" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).impressionCount||0))")
curl -s -X POST -H "Content-Type: application/json" -d "{\"auctionIds\":[\"$ID\"]}" http://localhost:5610/api/auctions/impressions
AFTER=$(curl -s "http://localhost:5610/api/auctions/$ID" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).impressionCount||0))")
echo "sayaç: $BEFORE → $AFTER (artmalı)"
pkill -f "node index.js"
```
Expected: `sayaç: 0 → 1` (veya mevcut değerin bir fazlası).

- [ ] **Step 3: TTL indeksinin oluştuğunu doğrula**

```bash
node -e "
require('dotenv').config();
const m=require('mongoose');
m.connect(process.env.MONGO_URI).then(async()=>{
  require('./models/AuctionSeen');
  await m.connection.db.collection('auctionseens').createIndexes([
    {key:{user:1,day:1},unique:true,name:'user_1_day_1'},
    {key:{createdAt:1},expireAfterSeconds:129600,name:'createdAt_1'}
  ]).catch(()=>{});
  const ix=await m.connection.db.collection('auctionseens').indexes();
  console.log(ix.map(i=>i.name+(i.expireAfterSeconds?' TTL='+i.expireAfterSeconds:'')).join(' | '));
  await m.disconnect();
});"
```
Expected: çıktıda `createdAt_1 TTL=129600` ve `user_1_day_1` görünür.

- [ ] **Step 4: Commit**

```bash
git add routes/auction.js
git commit -m "feat(feed): add batched impression reporting endpoint"
```

---

### Task 7: `bidCount` artırımı ve backfill

**Files:** Modify `routes/bid.js`, Create `scripts/backfillBidCounts.js`

- [ ] **Step 1: `routes/bid.js` içindeki atomik güncellemeye `$inc` ekle**

Mevcut satırları bul:

```js
    const updatedAuction = await Auction.findOneAndUpdate(
      { _id: auctionId, currentPrice: { $lt: amount } },
      { currentPrice: amount },
      { new: true }
    );
```

Şununla değiştir:

```js
    const updatedAuction = await Auction.findOneAndUpdate(
      { _id: auctionId, currentPrice: { $lt: amount } },
      { $set: { currentPrice: amount }, $inc: { bidCount: 1 } },
      { new: true }
    );
```

> Dosyadaki filtre koşulu birebir aynı olmayabilir (ör. `isEnded` kontrolü eklenmiş olabilir);
> **filtreyi olduğu gibi koru**, sadece güncelleme belgesini `$set` + `$inc` biçimine çevir.

- [ ] **Step 2: `scripts/backfillBidCounts.js` oluştur**

```js
// scripts/backfillBidCounts.js
// Tek seferlik: mevcut mezatların bidCount değerini gerçek teklif sayısına ayarlar.
// Çalıştır: node scripts/backfillBidCounts.js
require('dotenv').config();
const mongoose = require('mongoose');
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('🔌 MongoDB bağlandı');

  const counts = await Bid.aggregate([{ $group: { _id: '$auction', n: { $sum: 1 } } }]);
  const withBids = new Set(counts.map((c) => String(c._id)));

  const ops = counts.map((c) => ({
    updateOne: { filter: { _id: c._id }, update: { $set: { bidCount: c.n } } },
  }));
  if (ops.length) await Auction.bulkWrite(ops);

  // Teklifi olmayan / alanı eksik olanları 0'a çek
  const zeroed = await Auction.updateMany(
    { _id: { $nin: [...withBids].map((id) => new mongoose.Types.ObjectId(id)) } },
    { $set: { bidCount: 0 } }
  );

  console.log(`✅ ${ops.length} mezat gerçek teklif sayısıyla güncellendi.`);
  console.log(`✅ ${zeroed.modifiedCount} mezat 0'a ayarlandı.`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error('❌ Backfill hatası:', e.message);
  process.exit(1);
});
```

- [ ] **Step 3: Doğrula (script'i ÇALIŞTIRMA — seed'den sonra çalıştırılacak)**

Run: `node --check routes/bid.js && node --check scripts/backfillBidCounts.js`
Expected: çıktı yok.

- [ ] **Step 4: Commit**

```bash
git add routes/bid.js scripts/backfillBidCounts.js
git commit -m "feat(bid): maintain bidCount; add one-off backfill script"
```

---

## FAZ 2 — Frontend

### Task 8: Misafir tohumu (`frontend/utils/feedSeed.js`)

**Files:** Create `/Users/umutugur/Dev/frontend/utils/feedSeed.js`

- [ ] **Step 1: Dosyayı oluştur**

```js
// utils/feedSeed.js
// Misafir kullanıcılar için kalıcı feed tohumu. Girişli kullanıcıda sunucu
// zaten userId'yi tohum olarak kullanır; bu yalnızca misafir sırasını kararlı kılar.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'feedSeed';
let cached = null;

export async function getFeedSeed() {
  if (cached) return cached;
  try {
    let seed = await AsyncStorage.getItem(KEY);
    if (!seed) {
      seed = Math.random().toString(36).slice(2, 12);
      await AsyncStorage.setItem(KEY, seed);
    }
    cached = seed;
    return seed;
  } catch {
    return 'guest';
  }
}
```

- [ ] **Step 2: Doğrula**

Run: `cd /Users/umutugur/Dev/frontend && node -e "require('@babel/core').transformFileSync('utils/feedSeed.js',{presets:['babel-preset-expo']}); console.log('BABEL_OK')"`
Expected: `BABEL_OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/umutugur/Dev/frontend
git add utils/feedSeed.js
git commit -m "feat(feed): persist guest feed seed"
```

---

### Task 9: HomeScreen — sayfalı feed + görüntülenme takibi

**Files:** Modify `/Users/umutugur/Dev/frontend/screens/HomeScreen.js`

> Bu ekran reklam serpiştirme (`buildFeed`) fonksiyonunu **dışa aktarır** ve `FavoritesScreen`
> onu içe aktarır. **`buildFeed` imzası değişmeyecek** (`(auctions) => rows`).

- [ ] **Step 1: Importları ve sabitleri güncelle**

Dosyanın üst kısmını şu hale getir (mevcut `buildFeed` fonksiyonunu ve `COLUMNS`/`ROWS_BETWEEN_ADS` sabitlerini **olduğu gibi bırak**):

```js
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, ActivityIndicator, Text } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import axios from 'axios';

import { Screen, AuctionCard, CountdownHero, EmptyState } from '../components/ui';
import InlineBannerAd from '../components/InlineBannerAd';
import { getFeedSeed } from '../utils/feedSeed';
import { colors, spacing, typography } from '../theme/tokens';

const API = 'https://imame-backend.onrender.com';
const PAGE_SIZE = 20;
```

- [ ] **Step 2: Bileşen gövdesini değiştir**

`export default function HomeScreen() {` içindeki state ve veri çekme bloğunu şununla değiştir
(`renderItem` ve `styles` bir sonraki adımda):

```js
export default function HomeScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [auctions, setAuctions] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [phase, setPhase] = useState('unseen');

  const offsetRef = useRef(0);          // yalnızca 'seen' fazında kullanılır
  const loadedIds = useRef(new Set());  // liste içi tekrarları önler
  const reported = useRef(new Set());   // oturum içinde bildirilmiş ID'ler
  const pending = useRef(new Set());    // gönderilmeyi bekleyenler
  const flushTimer = useRef(null);

  // Görülen kartları toplu bildir (best-effort; hata sessizce yutulur)
  const flush = useCallback(() => {
    const ids = [...pending.current];
    pending.current.clear();
    if (!ids.length) return;
    axios.post(`${API}/api/auctions/impressions`, { auctionIds: ids }).catch(() => {});
  }, []);

  const fetchPage = useCallback(
    async ({ reset = false } = {}) => {
      try {
        const seed = await getFeedSeed();
        const params = { limit: PAGE_SIZE, seed };
        if (!reset && phase === 'seen') params.offset = offsetRef.current;

        const res = await axios.get(`${API}/api/auctions/feed`, { params });
        const { items = [], hasMore: more = false, phase: nextPhase = 'unseen' } = res.data || {};

        if (reset) {
          loadedIds.current = new Set(items.map((a) => a._id));
          offsetRef.current = nextPhase === 'seen' ? items.length : 0;
          setAuctions(items);
        } else {
          const fresh = items.filter((a) => !loadedIds.current.has(a._id));
          fresh.forEach((a) => loadedIds.current.add(a._id));
          if (nextPhase === 'seen') offsetRef.current += items.length;
          setAuctions((prev) => [...prev, ...fresh]);
        }
        setPhase(nextPhase);
        setHasMore(more);
      } catch (err) {
        console.log('Mezatlar alınamadı:', err.message);
        setHasMore(false);
      }
    },
    [phase]
  );

  useEffect(() => {
    if (isFocused && auctions.length === 0) fetchPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  // Ekrandan ayrılırken bekleyen bildirimleri gönder
  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flush();
    };
  }, [flush]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    offsetRef.current = 0;
    setPhase('unseen');
    setHasMore(true);
    await fetchPage({ reset: true });
    setRefreshing(false);
  }, [fetchPage]);

  const handleEndReached = useCallback(async () => {
    if (loadingMore || refreshing || !hasMore) return;
    setLoadingMore(true);
    await fetchPage();
    setLoadingMore(false);
  }, [loadingMore, refreshing, hasMore, fetchPage]);

  // Görünürlük: kart %50 görünür ve >=1sn kalırsa "görüldü" sayılır.
  // onViewableItemsChanged referansı SABİT olmalı (RN aksi halde hata verir).
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: 1000 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    viewableItems.forEach((v) => {
      const row = v.item;
      if (!row || row.type === 'ad' || !Array.isArray(row.items)) return;
      row.items.forEach((a) => {
        if (a && a._id && !reported.current.has(a._id)) {
          reported.current.add(a._id);
          pending.current.add(a._id);
        }
      });
    });
    if (pending.current.size === 0) return;
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      const ids = [...pending.current];
      pending.current.clear();
      if (ids.length) {
        axios.post(`${API}/api/auctions/impressions`, { auctionIds: ids }).catch(() => {});
      }
    }, 2000);
  }).current;

  const feed = useMemo(() => buildFeed(auctions), [auctions]);
```

- [ ] **Step 3: `renderItem` ve `return` bloğunu güncelle**

```js
  const renderItem = ({ item }) => {
    if (item.type === 'ad') return <InlineBannerAd />;

    return (
      <View style={styles.row}>
        {item.items.map((auction) => (
          <View key={auction._id} style={styles.cardCol}>
            <AuctionCard
              item={auction}
              onPress={() => navigation.navigate('AuctionDetail', { auctionId: auction._id })}
            />
          </View>
        ))}
        {item.items.length < COLUMNS ? <View style={styles.cardCol} /> : null}
      </View>
    );
  };

  return (
    <Screen>
      <FlatList
        data={feed}
        renderItem={renderItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.gold}
            colors={[colors.gold]}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        ListHeaderComponent={
          <>
            <CountdownHero />
            {phase === 'seen' && auctions.length > 0 ? (
              <Text style={styles.phaseNote}>Tüm mezatları gördünüz — baştan gösteriliyor</Text>
            ) : null}
          </>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.gold} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="gavel"
            title="Henüz mezat yok"
            message="Şu anda aktif mezat bulunmuyor. Daha sonra tekrar göz atın."
          />
        }
      />
    </Screen>
  );
}
```

- [ ] **Step 4: Yeni stilleri ekle**

`StyleSheet.create({ ... })` içindeki mevcut girdileri koruyarak şunları ekle:

```js
  footer: { paddingVertical: spacing.lg, alignItems: 'center' },
  phaseNote: {
    ...typography.small,
    color: colors.gold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
```

- [ ] **Step 5: Doğrula**

```bash
cd /Users/umutugur/Dev/frontend
node -e "require('@babel/core').transformFileSync('screens/HomeScreen.js',{presets:['babel-preset-expo']}); console.log('BABEL_OK')"
grep -c "export function buildFeed" screens/HomeScreen.js   # 1 olmalı (Favorites bunu kullanıyor)
grep -n "Alert.alert\|fontWeight" screens/HomeScreen.js || echo "temiz"
```
Expected: `BABEL_OK`, ardından `1`, ardından `temiz`.

- [ ] **Step 6: Tam paket derlemesi**

```bash
cd /Users/umutugur/Dev/frontend
pkill -f "expo start" 2>/dev/null
(npx expo start --port 8094 > /tmp/m.log 2>&1 &) ; sleep 25
curl -s -o /tmp/b.js -w "%{http_code}\n" "http://localhost:8094/index.bundle?platform=ios&dev=true"
head -c 80 /tmp/b.js | grep -o '"type":"error"' && echo HATA || echo "bundle temiz"
pkill -f "expo start"
```
Expected: `200`, ardından `bundle temiz`.

- [ ] **Step 7: Commit**

```bash
cd /Users/umutugur/Dev/frontend
git add screens/HomeScreen.js
git commit -m "feat(home): paginated fair-exposure feed with impression tracking"
```

---

## FAZ 3 — Seed

### Task 10: Tespih görsellerini derle ve doğrula

**Files:** Create `scripts/seed-assets/tespih-images.json`

Amaç: **yalnızca tespih** içeren, doğrulanmış en az **12** görsel URL'si. Kur'an, seccade,
haç/rozer, kitap içeren görseller **reddedilir** (önceki seed'in sorunu buydu).

- [ ] **Step 1: Bilinen iyi görselle başla**

`8522564` (siyah zeminde ahşap tespih, kırmızı püskül) **doğrulandı, kesin kullan**:
`https://images.pexels.com/photos/8522564/pexels-photo-8522564.jpeg?auto=compress&cs=tinysrgb&w=800`

- [ ] **Step 2: Aday topla (iki kaynak)**

**Pexels** — `WebSearch` ile `pexels.com` alan adında ara (ör. "pexels tasbih beads close up",
"pexels prayer beads wooden macro"). Sonuç URL'lerindeki sondaki sayı foto ID'sidir. URL kalıbı:
`https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=800`

**Unsplash** — `WebSearch` ile `unsplash.com` alan adında ara. Sonuç
`unsplash.com/photos/<slug>` verir; gerçek görsel URL'sini şöyle çöz:

```bash
curl -s -I -L -A "Mozilla/5.0" "https://unsplash.com/photos/<slug>/download?w=800" \
  | grep -i "^location:" | tail -1 | tr -d '\r' | sed 's/[Ll]ocation: //'
```
Bu `https://images.unsplash.com/photo-...` döndürür (doğrulandı, çalışıyor).

- [ ] **Step 3: GÖRSEL OLARAK doğrula — bu adım zorunlu**

Adayları indirip iletişim sayfası (contact sheet) üret ve **Read aracıyla resmi aç, gözünle bak**:

```bash
mkdir -p /tmp/tespih && cd /tmp/tespih
# her aday için: curl -s -o cand_<n>.jpg "<URL>"
python3 - <<'PY'
from PIL import Image, ImageDraw
import glob, os
files=sorted(glob.glob('/tmp/tespih/cand_*.jpg'))
cols=5; rows=(len(files)+cols-1)//cols
sheet=Image.new('RGB',(200*cols,220*rows),'white'); d=ImageDraw.Draw(sheet)
for n,f in enumerate(files):
    try: im=Image.open(f).convert('RGB').resize((200,200))
    except: continue
    x=(n%cols)*200; y=(n//cols)*220
    sheet.paste(im,(x,y)); d.text((x+4,y+202),os.path.basename(f),fill='black')
sheet.save('/tmp/tespih/sheet.png'); print('ok',len(files))
PY
```
Sonra `Read` ile `/tmp/tespih/sheet.png` dosyasını aç. **Kur'an / seccade / kitap / haç içeren
her görseli listeden çıkar.** Yeterli sayı toplanana kadar Adım 2–3'ü tekrarla.

- [ ] **Step 4: Sonucu JSON olarak kaydet**

```json
{
  "_comment": "Yalnızca tespih içeren, görsel olarak doğrulanmış URL'ler. Kur'an/seccade/haç içeren görseller kabul edilmez.",
  "images": [
    "https://images.pexels.com/photos/8522564/pexels-photo-8522564.jpeg?auto=compress&cs=tinysrgb&w=800"
  ]
}
```

- [ ] **Step 5: Tüm URL'lerin erişilebilir olduğunu doğrula**

```bash
node -e "
const { images } = require('./scripts/seed-assets/tespih-images.json');
(async () => {
  let bad = 0;
  for (const u of images) {
    const r = await fetch(u, { method: 'HEAD' });
    const ok = r.ok && (r.headers.get('content-type')||'').startsWith('image/');
    if (!ok) { bad++; console.log('KÖTÜ:', u); }
  }
  console.log('toplam:', images.length, '| erişilemeyen:', bad);
})();"
```
Expected: `toplam: 12` (veya daha fazla) `| erişilemeyen: 0`

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-assets/tespih-images.json
git commit -m "chore(seed): curate verified tespih-only image set"
```

---

### Task 11: 100 mezatlık seed

**Files:** Rewrite `scripts/seedMockAuctions.js`

- [ ] **Step 1: Script'i yeniden yaz**

Gereksinimler:
- **100 mezat** üretir.
- Görseller `scripts/seed-assets/tespih-images.json` dosyasından okunur (sabit kodlanmaz).
- **Uzun açıklamalar:** her mezat **400–900 karakter**, 2–3 paragraf, gerçekçi Türkçe tespih
  metni (malzeme kökeni, işçilik süreci, imame/kamçı/tepelik detayı, kullanım hissi).
  Detay ekranı 280 karakterden uzun metinlerde "Devamını oku" gösterir — bu eşik aşılmalı.
- **Çeşitlilik:** en az 12 farklı tespih türü (kehribar, oltu taşı, kuka, bağa, sedef, lületaşı,
  yusr, necef, gül ağacı, sandal, zeytin ağacı, damla kehribar, sıkma kehribar, öd ağacı...)
  × farklı boncuk sayısı/çap/kamçı kombinasyonlarıyla 100 benzersiz başlık.
- **Fiyatlar:** 300–8.000₺ arası, tür ile tutarlı (kehribar pahalı, ahşap ucuz). Sıralama
  kademelerinin tamamını sınamak için farklı fiyat bantlarına dağıtılmalı.
- `isSigned` mezatların ~%35'inde true.
- Mevcut 4 mock satıcı **yeniden kullanılır** (find-or-create; `@imame.mock` e-postaları).
- `endsAt` = `calculateEndsAt()`, `isEnded: false`, `currentPrice = startingPrice`.
- `impressionCount: 0`, `bidCount: 0` alanları açıkça yazılır.
- **Tekrar çalıştırmaya karşı güvenli:** `--reset` argümanı verilirse önce
  `Auction.deleteMany({ seller: { $in: mockSellerIds } })` ile eski mock mezatları siler.
  Argümansız çalışırsa üstüne ekler ve bunu ekrana yazar.

- [ ] **Step 2: Söz dizimini doğrula**

Run: `node --check scripts/seedMockAuctions.js`
Expected: çıktı yok.

- [ ] **Step 3: Kuru çalıştırma — üretilen veriyi DB'ye yazmadan denetle**

Script sonunda `module.exports = { buildAuctions }` gibi bir dışa aktarım varsa kullan; yoksa
şu kontrolü script'e geçici bir `--dry` bayrağıyla ekle ve çalıştır:

```bash
node scripts/seedMockAuctions.js --dry
```
Expected çıktı şunları içermeli: `100 mezat`, `benzersiz başlık: 100`,
`en kısa açıklama: >=400`, `görsel sayısı: >=12`.

- [ ] **Step 4: Commit**

```bash
git add scripts/seedMockAuctions.js
git commit -m "feat(seed): 100 realistic tespih auctions with long descriptions"
```

---

### Task 12: Seed'i yükle ve backfill'i çalıştır

**Files:** yok (yalnızca çalıştırma)

- [ ] **Step 1: Eski mock mezatları temizleyip 100 mezatı yükle**

```bash
cd /Users/umutugur/Dev/imame-backend
node scripts/seedMockAuctions.js --reset
```
Expected: `✅ 100 mock mezat eklendi.`

- [ ] **Step 2: `bidCount` backfill'ini çalıştır**

```bash
node scripts/backfillBidCounts.js
```
Expected: `✅ N mezat gerçek teklif sayısıyla güncellendi.`

- [ ] **Step 3: Canlı feed'i doğrula**

```bash
curl -s "https://imame-backend.onrender.com/api/auctions/feed?limit=5&seed=test1" \
 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);
   console.log('items:',j.items.length,'| hasMore:',j.hasMore,'| phase:',j.phase);
   console.log('ilk başlık:',j.items[0].title);
   console.log('açıklama uzunluğu:',j.items[0].description.length);
   console.log('görsel:',j.items[0].images[0].slice(0,60));})"
```
Expected: `items: 5 | hasMore: true | phase: unseen`, açıklama uzunluğu **400+**.

> Not: Bu adım backend'in canlıya alınmış olmasını gerektirir. Değilse yerel sunucuda
> (`PORT=5610 node index.js`) aynı kontrolü `localhost:5610` üzerinden yap.

- [ ] **Step 4: Farklı tohumların farklı sıra verdiğini doğrula**

```bash
A=$(curl -s "https://imame-backend.onrender.com/api/auctions/feed?limit=5&seed=aaa" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).items.map(i=>i._id).join()))")
B=$(curl -s "https://imame-backend.onrender.com/api/auctions/feed?limit=5&seed=bbb" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).items.map(i=>i._id).join()))")
[ "$A" != "$B" ] && echo "✅ tohum farkı sırayı değiştiriyor" || echo "❌ sıra aynı"
```
Expected: `✅ tohum farkı sırayı değiştiriyor`

---

## Bitiş doğrulaması

- [ ] `node --check` tüm değişen backend dosyalarında temiz
- [ ] Sunucu açılışta Mongo'ya bağlanıp dinliyor
- [ ] `/api/auctions/feed` tokensiz 200, `items`/`hasMore`/`phase` alanlarıyla dönüyor
- [ ] `/api/auctions/all` hâlâ dizi döndürüyor (eski uygulama bozulmadı)
- [ ] `/api/auctions/impressions` sonrası `impressionCount` artıyor
- [ ] `auctionseens` koleksiyonunda TTL indeksi mevcut
- [ ] Frontend tam paket derlemesi temiz; `buildFeed` dışa aktarımı korunmuş
- [ ] 100 mezat yüklü, açıklamalar 400+ karakter, görsellerde Kur'an/seccade yok

## Self-Review notu

Spec kapsamı denetlendi: §4.1→T1, §4.2→T2, §4.3→T2, §5→T3, §6.1→T5, §6.2→T6, §6.3→T7,
§6.4→T1+T2 (+T6 doğrulaması), §7→T7, §8→T8+T9, §9 uç durumlar T5/T6/T9 içinde,
§10 doğrulama her görevin son adımlarında. `optionalAuth` spec'te örtük geçiyordu; T4 olarak
açıkça eklendi. `/feed` route'unun `/:id`'den önce gelmesi zorunluluğu T5'te uyarı olarak yazıldı.
