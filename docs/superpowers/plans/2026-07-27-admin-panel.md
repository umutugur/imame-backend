# Admin Web Paneli — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mobildeki tüm admin işlevlerinin web karşılığı + platform genel bakışı, denetim günlüğü, toplu işlemler ve rol yönetimi; ayrıca sahte olan mobil ban ekranının gerçek hale getirilmesi.

**Architecture:** Satıcı paneliyle ortak dosyalar `panel-shared/` altına taşınır (tek tasarım sistemi, tek oturum modülü). Tüm admin uçları tek `routes/admin.js` dosyasında toplanır; `/api/users/*` üzerindeki mevcut uçlar yerinde genişletilir. Panel, satıcı panelindeki kanıtlanmış kalıbı izler: `main.js` veriyi çeker, saf render modüllerine dağıtır.

**Tech Stack:** Express 5 + Mongoose 8 (CommonJS), vanilla ES modules, Heritage Pro CSS, React Native (mobil düzeltmeler).

**Spec:** `docs/superpowers/specs/2026-07-27-admin-panel-design.md`

**Not (test altyapısı):** Depoda test çatısı yok. TDD yerine **`node --check` + çalışan sunucuya `curl`** (panel/mobil: babel + bundle + tarayıcı) kullanılır. Her doğrulama adımı beklenen çıktıyı yazar.

---

## Dosya haritası ve sahiplik

Paralel ajanlar için **dosya sahipliği bağlayıcıdır** — iki ajan aynı dosyaya yazmaz.

| Sahip | Dosyalar | Görevler |
|---|---|---|
| **A — Ortak altyapı** | `panel-shared/{styles.css,api.js,auth.js}`, `seller/index.html`, `seller/js/{auctions,orders,main}.js` (yalnız import yolları), `index.js`, `models/AdminLog.js`, `models/User.js`, `utils/adminLog.js` | 1–3 |
| **B — Admin uçları** | `routes/admin.js` (YENİ, tek dosya) | 4–7 |
| **C — Kullanıcı uçları** | `controllers/userController.js`, `routes/user.js` | 8–9 |
| **D — Admin paneli** | `admin/index.html`, `admin/js/*` | 10–13 |
| **E — Mobil** | `frontend/screens/{BanUserScreen,UserListScreen}.js` | 14–15 |

**Süpervizör (ajan değil):** Görev 16 — entegrasyon, satıcı paneli regresyonu, canlıya alma.

### Modül sözleşmesi (bağlayıcı)

```js
// panel-shared/api.js  — satıcı panelindeki api.js ile AYNI, yalnızca yeri değişir
export function getToken() / getUser() / setSession({token,user}) / clearSession()
export function onUnauthorized(fn)
export async function apiFetch(url, opts)   // 401/403 → oturum temizler, 'unauthorized' fırlatır
export async function apiJson(url, opts)    // JSON çözer, {ok:false} veya !res.ok → hata fırlatır

// panel-shared/auth.js — TEK fark: izin verilen roller parametreli
export function initAuth({ onLogin, allowedRoles })  // allowedRoles: ['seller','admin'] | ['admin']
export function logout(reason) / showApp() / showLogin()

// utils/adminLog.js (backend)
logAdminAction(req, { action, targetType, targetId, meta })  // fire-and-forget, await GEREKMEZ
```

### Admin paneli DOM sözleşmesi (bağlayıcı)

`admin/index.html` bu ID'leri boş kapsayıcı olarak sağlar; `admin/js/*` doldurur.

```
#loginView #loginEmail #loginPassword #loginBtn #loginMsg
#appView #adminName #logoutBtn #nav (a[data-tab]) #navReportBadge
#tab-overview #tab-users #tab-sellers #tab-auctions #tab-receipts #tab-reports #tab-notify #tab-logs
overview : #ovAuctions #ovRevenue #ovUsers #ovExposure #ovConversion #ovUnpaid
users    : #userSearch #userRole #userRows #usersMsg #userBulkBar #userBulkCount
sellers  : #sellerRows #sellersMsg #newSellerName #newSellerEmail #newSellerPass #newSellerCompany #newSellerBtn #newSellerMsg
auctions : #aucStatus #aucSeller #aucSearch #aucRows #aucMsg #aucBulkBar #aucBulkCount
receipts : #recFilter #recRows #recMsg
reports  : #reportRows #reportsMsg
notify   : #notifyTitle #notifyBody #notifyBtn #notifyMsg
logs     : #logAction #logRows #logsMsg
modal    : #imgModal #modalImg #modalClose
banModal : #banModal #banUserName #banDuration #banReason #banConfirm #banCancel
```

---

## FAZ 1 — Ortak altyapı (Ajan A)

### Task 1: Ortak dosyaları taşı, satıcı panelini bağla

**Files:** Create `panel-shared/{styles.css,api.js,auth.js}`; Delete `seller/styles.css`, `seller/js/{api.js,auth.js}`; Modify `seller/index.html`, `seller/js/{auctions,orders,main}.js`, `index.js`

- [ ] **Step 1: Dosyaları git ile taşı (geçmiş korunur)**

```bash
mkdir -p panel-shared
git mv seller/styles.css panel-shared/styles.css
git mv seller/js/api.js  panel-shared/api.js
git mv seller/js/auth.js panel-shared/auth.js
```

- [ ] **Step 2: `panel-shared/auth.js` içindeki rol kontrolünü parametreli yap**

Şu satırı bul (47. satır civarı):

```js
      if (data.user?.role !== 'seller' && data.user?.role !== 'admin') {
        throw new Error('Bu panel satıcı hesapları içindir.');
      }
```

Şununla değiştir:

```js
      if (!allowedRoles.includes(data.user?.role)) {
        throw new Error(
          allowedRoles.includes('seller')
            ? 'Bu panel satıcı hesapları içindir.'
            : 'Bu panel yönetici hesapları içindir.'
        );
      }
```

Ve fonksiyon imzasını güncelle:

```js
export function initAuth({ onLogin, allowedRoles = ['seller', 'admin'] }) {
```

- [ ] **Step 3: Satıcı panelinin yollarını güncelle**

`seller/index.html` — CSS bağlantısı:
```html
<link rel="stylesheet" href="/panel-shared/styles.css">
```

`seller/js/auctions.js` ve `seller/js/orders.js` — ilk import satırı:
```js
import { apiJson } from '/panel-shared/api.js';
```

`seller/js/main.js` — ilk iki import:
```js
import { apiJson, getToken, getUser } from '/panel-shared/api.js';
import { initAuth, showApp, showLogin } from '/panel-shared/auth.js';
```

`seller/js/main.js` içindeki `initAuth` çağrısına rolleri ekle:
```js
initAuth({ onLogin: startApp, allowedRoles: ['seller', 'admin'] });
```

- [ ] **Step 4: `index.js` statik servisleri ekle**

`app.use('/seller', express.static(...))` satırının hemen yanına:

```js
app.use('/panel-shared', express.static(path.join(__dirname, 'panel-shared')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
```

- [ ] **Step 5: Satıcı panelinin BOZULMADIĞINI doğrula (regresyon)**

```bash
node --check index.js
PORT=5630 node index.js > /tmp/a1.log 2>&1 &
sleep 9
for p in /seller /panel-shared/styles.css /panel-shared/api.js /panel-shared/auth.js /seller/js/main.js /seller/js/auctions.js /seller/js/orders.js; do
  curl -s -o /dev/null -w "  %{http_code}  $p\n" -L "http://localhost:5630$p"
done
echo "--- eski yollar artık 404 olmalı ---"
curl -s -o /dev/null -w "  %{http_code}  /seller/styles.css (404 beklenir)\n" "http://localhost:5630/seller/styles.css"
echo "--- seller/index.html doğru yolu gösteriyor mu ---"
curl -s -L "http://localhost:5630/seller" | grep -c "panel-shared/styles.css"
pkill -f "node index.js"
```
Expected: ilk yedi yol `200`, `/seller/styles.css` `404`, son komut `1`.

- [ ] **Step 6: Commit**

```bash
git add -A panel-shared seller index.js
git commit -m "refactor(panels): extract shared panel assets"
```

---

### Task 2: `AdminLog` modeli ve `banReason` alanı

**Files:** Create `models/AdminLog.js`; Modify `models/User.js`

- [ ] **Step 1: `models/AdminLog.js` oluştur**

```js
// models/AdminLog.js
// Yönetici eylemlerinin kalıcı denetim kaydı. TTL YOKTUR — amacı kalıcılıktır.
const mongoose = require('mongoose');

const adminLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorEmail: { type: String },
  action: {
    type: String,
    required: true,
    enum: [
      'ban', 'unban', 'role_change', 'auction_delete',
      'receipt_approve', 'receipt_reject', 'notification_send',
      'bulk_ban', 'bulk_unban', 'bulk_auction_delete',
    ],
  },
  targetType: { type: String }, // 'user' | 'auction' | 'broadcast'
  targetId: { type: mongoose.Schema.Types.ObjectId },
  meta: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
});

adminLogSchema.index({ createdAt: -1 });
adminLogSchema.index({ actor: 1, createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AdminLog', adminLogSchema);
```

- [ ] **Step 2: `models/User.js`'e `banReason` ekle**

`bannedUntil` alanının hemen altına:

```js
    banReason: { type: String, default: null },
```

- [ ] **Step 3: Doğrula**

```bash
node --check models/AdminLog.js && node --check models/User.js
node -e "
require('dotenv').config(); const m=require('mongoose');
m.connect(process.env.MONGO_URI).then(async()=>{
  const L=require('./models/AdminLog');
  await L.createCollection().catch(()=>{});
  await L.syncIndexes();
  const ix=await m.connection.db.collection('adminlogs').indexes();
  console.log('indeksler:', ix.map(i=>i.name).join(' | '));
  const U=require('./models/User');
  console.log('banReason şemada:', !!U.schema.path('banReason'));
  await m.disconnect();
});"
```
Expected: `indeksler:` çıktısında `createdAt_-1`, `actor_1_createdAt_-1`, `action_1_createdAt_-1` görünür; `banReason şemada: true`.

- [ ] **Step 4: Commit**

```bash
git add models/AdminLog.js models/User.js
git commit -m "feat(admin): add AdminLog model and user banReason field"
```

---

### Task 3: `utils/adminLog.js`

**Files:** Create `utils/adminLog.js`

- [ ] **Step 1: Dosyayı oluştur**

```js
// utils/adminLog.js
// Yönetici eylemini denetim günlüğüne yazar.
// FIRE-AND-FORGET: çağıran await ETMEZ; günlük yazımı başarısız olursa asıl işlem bozulmaz.
const AdminLog = require('../models/AdminLog');

function logAdminAction(req, { action, targetType, targetId, meta = {} }) {
  const actorId = req && req.user && req.user.id;
  if (!actorId) return;

  AdminLog.create({
    actor: actorId,
    actorEmail: (req.user && req.user.email) || undefined,
    action,
    targetType,
    targetId,
    meta,
  }).catch((e) => {
    console.error('⚠️ Denetim kaydı yazılamadı:', action, e.message);
  });
}

module.exports = { logAdminAction };
```

- [ ] **Step 2: Doğrula**

```bash
node --check utils/adminLog.js
node -e "
require('dotenv').config(); const m=require('mongoose');
m.connect(process.env.MONGO_URI).then(async()=>{
  const { logAdminAction } = require('./utils/adminLog');
  const U=require('./models/User');
  const admin=await U.findOne({role:'admin'});
  logAdminAction({user:{id:String(admin._id),email:admin.email}},{action:'ban',targetType:'user',targetId:admin._id,meta:{test:true}});
  await new Promise(r=>setTimeout(r,1200));
  const L=require('./models/AdminLog');
  const son=await L.findOne({'meta.test':true}).lean();
  console.log('kayıt yazıldı:', !!son, '| eylem:', son && son.action);
  await L.deleteMany({'meta.test':true});
  console.log('test kaydı temizlendi');
  await m.disconnect();
});"
```
Expected: `kayıt yazıldı: true | eylem: ban` ve `test kaydı temizlendi`.

- [ ] **Step 3: Commit**

```bash
git add utils/adminLog.js
git commit -m "feat(admin): add fire-and-forget audit logging helper"
```

---

## FAZ 2 — Admin uçları (Ajan B, tek dosya: `routes/admin.js`)

Bu fazın tamamı **yeni bir dosyada** yazılır ve sonunda `index.js`'e bağlanır. `index.js`'i
Ajan A sahiplendiği için **bağlama işini süpervizör yapar** (Görev 16); Ajan B yalnızca
`routes/admin.js` dosyasını üretir ve testlerini geçici bir mount ile yapar.

### Task 4: İskelet + `GET /api/admin/overview`

**Files:** Create `routes/admin.js`

- [ ] **Step 1: Dosya iskeleti ve ortak yardımcılar**

```js
// routes/admin.js — yönetici uçları. Hepsi requireAuth(['admin']) ile korunur.
const express = require('express');
const mongoose = require('mongoose');
const { requireAuth } = require('../middlewares/auth');
const { logAdminAction } = require('../utils/adminLog');
const Auction = require('../models/Auction');
const User = require('../models/User');
const Bid = require('../models/Bid');
const AdminLog = require('../models/AdminLog');
const { sendExpoPushNotification } = require('../utils/expoPush');

const router = express.Router();
const TZ_OFFSET_H = 3; // Türkiye kalıcı UTC+3

// Europe/Istanbul gün/hafta sınırları (satıcı paneliyle aynı tanım)
function istanbulBounds() {
  const now = new Date();
  const shifted = new Date(now.getTime() + TZ_OFFSET_H * 3600 * 1000);
  const y = shifted.getUTCFullYear(), m = shifted.getUTCMonth(), d = shifted.getUTCDate();
  const startToday = new Date(Date.UTC(y, m, d, 0, 0, 0));
  const wd = new Date(Date.UTC(y, m, d, 12, 0, 0)).getUTCDay(); // 0=Paz
  const shift = wd === 0 ? -6 : 1 - wd;                          // Pazartesi başlangıç
  const startWeek = new Date(Date.UTC(y, m, d + shift, 0, 0, 0));
  const startPrevWeek = new Date(startWeek.getTime() - 7 * 24 * 3600 * 1000);
  return { startToday, startWeek, startPrevWeek };
}

const clampLimit = (v, def = 50, max = 100) =>
  Math.min(Math.max(parseInt(v, 10) || def, 1), max);
const pageOf = (v) => Math.max(parseInt(v, 10) || 1, 1);

module.exports = router;
```

- [ ] **Step 2: `GET /api/admin/overview`**

`module.exports` satırından önce ekle:

```js
// ── Platform genel bakışı ──
router.get('/api/admin/overview', requireAuth(['admin']), async (req, res) => {
  try {
    const { startToday, startWeek, startPrevWeek } = istanbulBounds();

    const [
      activeNow, createdToday, endedToday, createdThisWeek,
      totalUsers, newThisWeek, bannedUsers, sellers,
      exposureAgg, revenueAgg, paymentAgg,
    ] = await Promise.all([
      Auction.countDocuments({ isEnded: false }),
      Auction.countDocuments({ createdAt: { $gte: startToday } }),
      Auction.countDocuments({ isEnded: true, endsAt: { $gte: startToday } }),
      Auction.countDocuments({ createdAt: { $gte: startWeek } }),
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startWeek } }),
      User.countDocuments({ isBanned: true }),
      User.countDocuments({ role: 'seller' }),
      Auction.aggregate([
        { $group: { _id: null, impressions: { $sum: '$impressionCount' }, bids: { $sum: '$bidCount' } } },
      ]),
      Auction.aggregate([
        { $match: { isEnded: true, receiptStatus: 'approved' } },
        { $group: {
            _id: null,
            today: { $sum: { $cond: [{ $gte: ['$endsAt', startToday] }, '$currentPrice', 0] } },
            thisWeek: { $sum: { $cond: [{ $gte: ['$endsAt', startWeek] }, '$currentPrice', 0] } },
            lastWeek: { $sum: { $cond: [
              { $and: [{ $gte: ['$endsAt', startPrevWeek] }, { $lt: ['$endsAt', startWeek] }] },
              '$currentPrice', 0] } },
        } },
      ]),
      Auction.aggregate([
        { $match: { isEnded: true, winner: { $ne: null } } },
        { $group: {
            _id: null,
            endedWithWinner: { $sum: 1 },
            receiptUploaded: { $sum: { $cond: [{ $ifNull: ['$receiptUrl', false] }, 1, 0] } },
            expiredUnpaid: { $sum: { $cond: [
              { $and: [
                { $not: [{ $ifNull: ['$receiptUrl', false] }] },
                { $lt: ['$paymentDeadline', new Date()] },
              ] }, 1, 0] } },
        } },
      ]),
    ]);

    const exposure = exposureAgg[0] || { impressions: 0, bids: 0 };
    const revenue = revenueAgg[0] || { today: 0, thisWeek: 0, lastWeek: 0 };
    const payment = paymentAgg[0] || { endedWithWinner: 0, receiptUploaded: 0, expiredUnpaid: 0 };

    res.json({
      ok: true,
      auctions: { activeNow, createdToday, endedToday, createdThisWeek },
      revenue: { today: revenue.today, thisWeek: revenue.thisWeek, lastWeek: revenue.lastWeek },
      users: { total: totalUsers, newThisWeek, banned: bannedUsers, sellers },
      exposure: {
        impressions: exposure.impressions || 0,
        bids: exposure.bids || 0,
        conversion: (exposure.bids || 0) / Math.max(exposure.impressions || 0, 1),
      },
      payment: {
        endedWithWinner: payment.endedWithWinner || 0,
        receiptUploaded: payment.receiptUploaded || 0,
        expiredUnpaid: payment.expiredUnpaid || 0,
      },
    });
  } catch (e) {
    console.error('Admin overview hatası:', e);
    res.status(500).json({ ok: false, message: 'Özet alınamadı' });
  }
});
```

- [ ] **Step 3: Geçici mount ile doğrula**

```bash
node --check routes/admin.js
# index.js'i DEĞİŞTİRME — geçici test sunucusu kur
cat > /tmp/tsrv.js <<'EOF'
require('dotenv').config();
const express=require('express'); const mongoose=require('mongoose');
const app=express(); app.use(express.json());
app.use(require('/Users/umutugur/Dev/imame-backend/routes/admin.js'));
mongoose.connect(process.env.MONGO_URI).then(()=>app.listen(5631,()=>console.log('test srv 5631')));
EOF
node /tmp/tsrv.js > /tmp/b1.log 2>&1 &
sleep 8
TOK=$(node -e "require('dotenv').config();const jwt=require('jsonwebtoken');const m=require('mongoose');m.connect(process.env.MONGO_URI).then(async()=>{const U=require('./models/User');const a=await U.findOne({role:'admin'});console.log(jwt.sign({id:String(a._id),role:'admin',email:a.email},process.env.JWT_SECRET,{expiresIn:'1h'}));await m.disconnect();})")
curl -s -H "Authorization: Bearer $TOK" http://localhost:5631/api/admin/overview -o /tmp/ov.json
node -e "
const j=require('/tmp/ov.json');
console.log('ok:',j.ok);
console.log('  aktif mezat:',j.auctions.activeNow,'| bugün eklenen:',j.auctions.createdToday);
console.log('  kullanıcı:',j.users.total,'| satıcı:',j.users.sellers,'| banlı:',j.users.banned);
console.log('  gösterim:',j.exposure.impressions,'| teklif:',j.exposure.bids);
console.log('  biten+kazananlı:',j.payment.endedWithWinner,'| dekontlu:',j.payment.receiptUploaded,'| ödenmemiş:',j.payment.expiredUnpaid);
"
pkill -f "node /tmp/tsrv.js"
```
Expected: `ok: true` ve tüm sayılar sayısal (0 olabilir ama `undefined`/`NaN` olamaz).

- [ ] **Step 4: Commit**

```bash
git add routes/admin.js
git commit -m "feat(admin-api): add platform overview endpoint"
```

---

### Task 5: `GET /api/admin/auctions` ve `GET /api/admin/sellers`

**Files:** Modify `routes/admin.js`

- [ ] **Step 1: Mezat listesi ucu**

```js
// ── Tüm mezatlar (Mezatlar + Dekontlar bölümlerinin ortak kaynağı) ──
router.get('/api/admin/auctions', requireAuth(['admin']), async (req, res) => {
  try {
    const limit = clampLimit(req.query.limit);
    const page = pageOf(req.query.page);
    const filter = {};

    if (req.query.status === 'active') filter.isEnded = false;
    else if (req.query.status === 'ended') filter.isEnded = true;

    if (req.query.seller && mongoose.Types.ObjectId.isValid(req.query.seller)) {
      filter.seller = req.query.seller;
    }
    if (req.query.q) {
      filter.title = { $regex: String(req.query.q).trim(), $options: 'i' };
    }

    const [items, total] = await Promise.all([
      Auction.find(filter)
        .select(
          '_id title currentPrice startingPrice endsAt images isSigned isEnded ' +
          'receiptStatus receiptUrl paymentDeadline impressionCount bidCount winner seller createdAt'
        )
        .populate('winner', 'name email phone')
        .populate('seller', 'companyName email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Auction.countDocuments(filter),
    ]);

    res.json({ ok: true, items, total, page, limit });
  } catch (e) {
    console.error('Admin mezat listesi hatası:', e);
    res.status(500).json({ ok: false, message: 'Mezatlar alınamadı' });
  }
});
```

- [ ] **Step 2: Satıcı performansı ucu**

```js
// ── Satıcılar + performans (tek aggregate; panel N+1 sorgu atmasın diye) ──
router.get('/api/admin/sellers', requireAuth(['admin']), async (req, res) => {
  try {
    const sellers = await User.find({ role: 'seller' })
      .select('_id name companyName email createdAt isBanned')
      .sort({ createdAt: -1 })
      .lean();

    const stats = await Auction.aggregate([
      { $group: {
          _id: '$seller',
          auctionCount: { $sum: 1 },
          activeCount: { $sum: { $cond: [{ $eq: ['$isEnded', false] }, 1, 0] } },
          impressions: { $sum: '$impressionCount' },
          bids: { $sum: '$bidCount' },
          revenue: { $sum: { $cond: [
            { $and: [{ $eq: ['$isEnded', true] }, { $eq: ['$receiptStatus', 'approved'] }] },
            '$currentPrice', 0] } },
      } },
    ]);
    const byId = new Map(stats.map((s) => [String(s._id), s]));

    const items = sellers.map((s) => {
      const st = byId.get(String(s._id)) || {};
      return {
        ...s,
        auctionCount: st.auctionCount || 0,
        activeCount: st.activeCount || 0,
        impressions: st.impressions || 0,
        bids: st.bids || 0,
        revenue: st.revenue || 0,
      };
    });

    res.json({ ok: true, items });
  } catch (e) {
    console.error('Admin satıcı listesi hatası:', e);
    res.status(500).json({ ok: false, message: 'Satıcılar alınamadı' });
  }
});
```

- [ ] **Step 3: Doğrula**

```bash
node --check routes/admin.js
node /tmp/tsrv.js > /tmp/b2.log 2>&1 & sleep 8
TOK=$(node -e "require('dotenv').config();const jwt=require('jsonwebtoken');const m=require('mongoose');m.connect(process.env.MONGO_URI).then(async()=>{const U=require('./models/User');const a=await U.findOne({role:'admin'});console.log(jwt.sign({id:String(a._id),role:'admin',email:a.email},process.env.JWT_SECRET,{expiresIn:'1h'}));await m.disconnect();})")
curl -s -H "Authorization: Bearer $TOK" "http://localhost:5631/api/admin/auctions?limit=3&status=all" -o /tmp/aa.json
node -e "const j=require('/tmp/aa.json');const a=j.items[0]||{};console.log('mezatlar → ok:',j.ok,'| dönen:',j.items.length,'| toplam:',j.total);console.log('  satıcı populate:',!!a.seller,'| impressionCount alanı:',a.impressionCount!==undefined)"
curl -s -H "Authorization: Bearer $TOK" "http://localhost:5631/api/admin/sellers" -o /tmp/as.json
node -e "const j=require('/tmp/as.json');const s=j.items[0]||{};console.log('satıcılar → ok:',j.ok,'| adet:',j.items.length);console.log('  ilk:',s.companyName,'| mezat:',s.auctionCount,'| ciro:',s.revenue)"
pkill -f "node /tmp/tsrv.js"
```
Expected: mezatlarda `ok: true`, `dönen: 3` (veya daha az), `satıcı populate: true`, `impressionCount alanı: true`; satıcılarda `ok: true` ve en az bir satıcı sayılarıyla.

- [ ] **Step 4: Commit**

```bash
git add routes/admin.js
git commit -m "feat(admin-api): add paginated auctions list and seller performance"
```

---

### Task 6: `GET /api/admin/users/:id` ve `GET /api/admin/logs`

**Files:** Modify `routes/admin.js`

- [ ] **Step 1: Kullanıcı detayı**

```js
// ── Kullanıcı detayı: ban kararı için bağlam ──
router.get('/api/admin/users/:id', requireAuth(['admin']), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ ok: false, message: 'Geçersiz kullanıcı kimliği' });
    }
    const user = await User.findById(req.params.id)
      .select('-password -resetCode -resetCodeExpires')
      .lean();
    if (!user) return res.status(404).json({ ok: false, message: 'Kullanıcı bulunamadı' });

    const now = new Date();
    const [bids, wonAuctions, receiptsUploaded, receiptsApproved, unpaidWins, recentWins] =
      await Promise.all([
        Bid.countDocuments({ user: user._id }),
        Auction.countDocuments({ winner: user._id }),
        Auction.countDocuments({ winner: user._id, receiptUrl: { $nin: [null, ''] } }),
        Auction.countDocuments({ winner: user._id, receiptStatus: 'approved' }),
        Auction.countDocuments({
          winner: user._id,
          $or: [{ receiptUrl: null }, { receiptUrl: '' }, { receiptUrl: { $exists: false } }],
          paymentDeadline: { $lt: now },
        }),
        Auction.find({ winner: user._id })
          .select('title currentPrice endsAt receiptStatus receiptUrl')
          .sort({ endsAt: -1 })
          .limit(10)
          .lean(),
      ]);

    res.json({
      ok: true,
      user,
      stats: { bids, wonAuctions, receiptsUploaded, receiptsApproved, unpaidWins },
      recentWins,
    });
  } catch (e) {
    console.error('Admin kullanıcı detayı hatası:', e);
    res.status(500).json({ ok: false, message: 'Kullanıcı alınamadı' });
  }
});
```

- [ ] **Step 2: Denetim günlüğü listesi**

```js
// ── Denetim günlüğü ──
router.get('/api/admin/logs', requireAuth(['admin']), async (req, res) => {
  try {
    const limit = clampLimit(req.query.limit);
    const page = pageOf(req.query.page);
    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.actor && mongoose.Types.ObjectId.isValid(req.query.actor)) {
      filter.actor = req.query.actor;
    }

    const [items, total] = await Promise.all([
      AdminLog.find(filter)
        .populate('actor', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AdminLog.countDocuments(filter),
    ]);

    res.json({ ok: true, items, total, page, limit });
  } catch (e) {
    console.error('Denetim günlüğü hatası:', e);
    res.status(500).json({ ok: false, message: 'Kayıtlar alınamadı' });
  }
});
```

- [ ] **Step 3: Doğrula**

```bash
node --check routes/admin.js
node /tmp/tsrv.js > /tmp/b3.log 2>&1 & sleep 8
TOK=$(node -e "require('dotenv').config();const jwt=require('jsonwebtoken');const m=require('mongoose');m.connect(process.env.MONGO_URI).then(async()=>{const U=require('./models/User');const a=await U.findOne({role:'admin'});console.log(jwt.sign({id:String(a._id),role:'admin',email:a.email},process.env.JWT_SECRET,{expiresIn:'1h'}));await m.disconnect();})")
UID=$(node -e "require('dotenv').config();const m=require('mongoose');m.connect(process.env.MONGO_URI).then(async()=>{const U=require('./models/User');const u=await U.findOne({role:'buyer'});console.log(String(u._id));await m.disconnect();})")
curl -s -H "Authorization: Bearer $TOK" "http://localhost:5631/api/admin/users/$UID" -o /tmp/ud.json
node -e "const j=require('/tmp/ud.json');console.log('detay → ok:',j.ok,'| şifre sızdı mı:',('password' in (j.user||{})),'| teklif:',j.stats.bids,'| ödenmemiş:',j.stats.unpaidWins)"
curl -s -o /dev/null -w "  bozuk id → HTTP %{http_code} (400 beklenir)\n" -H "Authorization: Bearer $TOK" "http://localhost:5631/api/admin/users/bozuk"
curl -s -H "Authorization: Bearer $TOK" "http://localhost:5631/api/admin/logs?limit=5" -o /tmp/lg.json
node -e "const j=require('/tmp/lg.json');console.log('günlük → ok:',j.ok,'| kayıt:',j.items.length,'| toplam:',j.total)"
pkill -f "node /tmp/tsrv.js"
```
Expected: `detay → ok: true | şifre sızdı mı: false`, bozuk id `400`, `günlük → ok: true`.

- [ ] **Step 4: Commit**

```bash
git add routes/admin.js
git commit -m "feat(admin-api): add user detail with payment history and audit log listing"
```

---

### Task 7: Toplu işlemler

**Files:** Modify `routes/admin.js`

- [ ] **Step 1: Üç toplu uç**

```js
const BULK_MAX = 100;

// Ortak: geçerli, tekil, azami BULK_MAX kimlik listesi
function normalizeIds(raw) {
  return [...new Set((Array.isArray(raw) ? raw : []).map(String))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .slice(0, BULK_MAX);
}

// ── Toplu ban ──
// Güvenlik: isteği yapanın kendisi ve DİĞER ADMİNLER listeden çıkarılır; aksi halde
// tek çağrıyla tüm yönetici kadrosu kilitlenebilirdi. Tek tek ban için /api/users/ban/:id.
router.patch('/api/admin/users/bulk-ban', requireAuth(['admin']), async (req, res) => {
  try {
    const ids = normalizeIds(req.body && req.body.userIds);
    if (!ids.length) return res.status(400).json({ ok: false, message: 'Kullanıcı seçilmedi' });

    const { durationDays, reason } = req.body || {};
    const skipped = [];
    const targets = [];

    const users = await User.find({ _id: { $in: ids } }).select('_id role').lean();
    const found = new Set(users.map((u) => String(u._id)));
    ids.forEach((id) => { if (!found.has(id)) skipped.push({ id, reason: 'Kullanıcı bulunamadı' }); });

    for (const u of users) {
      const id = String(u._id);
      if (id === req.user.id) { skipped.push({ id, reason: 'Kendi hesabınız' }); continue; }
      if (u.role === 'admin') { skipped.push({ id, reason: 'Yönetici hesabı' }); continue; }
      targets.push(id);
    }

    if (targets.length) {
      const days = Number(durationDays);
      const bannedUntil = Number.isFinite(days) && days > 0
        ? new Date(Date.now() + days * 24 * 3600 * 1000)
        : null;
      await User.updateMany(
        { _id: { $in: targets } },
        { $set: { isBanned: true, bannedUntil, banReason: reason || null } }
      );
      targets.forEach((id) =>
        logAdminAction(req, {
          action: 'bulk_ban', targetType: 'user', targetId: id,
          meta: { durationDays: days || null, reason: reason || null },
        })
      );
    }

    res.json({ ok: true, affected: targets.length, skipped });
  } catch (e) {
    console.error('Toplu ban hatası:', e);
    res.status(500).json({ ok: false, message: 'Toplu ban başarısız' });
  }
});

// ── Toplu ban kaldırma ──
router.patch('/api/admin/users/bulk-unban', requireAuth(['admin']), async (req, res) => {
  try {
    const ids = normalizeIds(req.body && req.body.userIds);
    if (!ids.length) return res.status(400).json({ ok: false, message: 'Kullanıcı seçilmedi' });

    await User.updateMany(
      { _id: { $in: ids } },
      { $set: { isBanned: false, bannedUntil: null, banReason: null } }
    );
    ids.forEach((id) =>
      logAdminAction(req, { action: 'bulk_unban', targetType: 'user', targetId: id })
    );

    res.json({ ok: true, affected: ids.length, skipped: [] });
  } catch (e) {
    console.error('Toplu ban kaldırma hatası:', e);
    res.status(500).json({ ok: false, message: 'İşlem başarısız' });
  }
});

// ── Toplu mezat silme ──
router.post('/api/admin/auctions/bulk-delete', requireAuth(['admin']), async (req, res) => {
  try {
    const ids = normalizeIds(req.body && req.body.auctionIds);
    const reason = (req.body && req.body.reason) || '';
    if (!ids.length) return res.status(400).json({ ok: false, message: 'Mezat seçilmedi' });
    if (!reason.trim()) return res.status(400).json({ ok: false, message: 'Silme sebebi zorunlu' });

    const found = await Auction.find({ _id: { $in: ids } }).select('_id').lean();
    const foundIds = found.map((a) => String(a._id));
    const skipped = ids.filter((id) => !foundIds.includes(id)).map((id) => ({ id, reason: 'Bulunamadı' }));

    if (foundIds.length) {
      await Auction.deleteMany({ _id: { $in: foundIds } });
      foundIds.forEach((id) =>
        logAdminAction(req, {
          action: 'bulk_auction_delete', targetType: 'auction', targetId: id, meta: { reason },
        })
      );
    }

    res.json({ ok: true, affected: foundIds.length, skipped });
  } catch (e) {
    console.error('Toplu mezat silme hatası:', e);
    res.status(500).json({ ok: false, message: 'Toplu silme başarısız' });
  }
});
```

- [ ] **Step 2: Korkulukları doğrula (kendini ve adminleri atlama)**

```bash
node --check routes/admin.js
node /tmp/tsrv.js > /tmp/b4.log 2>&1 & sleep 8
node -e "
require('dotenv').config();const jwt=require('jsonwebtoken');const m=require('mongoose');
m.connect(process.env.MONGO_URI).then(async()=>{
  const U=require('./models/User');
  const admin=await U.findOne({role:'admin'});
  const buyer=await U.findOne({role:'buyer',isBanned:{\$ne:true}});
  require('fs').writeFileSync('/tmp/bulk.json',JSON.stringify({
    tok: jwt.sign({id:String(admin._id),role:'admin',email:admin.email},process.env.JWT_SECRET,{expiresIn:'1h'}),
    admin:String(admin._id), buyer:String(buyer._id)
  }));
  console.log('admin:',String(admin._id),'| test alıcı:',String(buyer._id));
  await m.disconnect();
});"
T=$(node -e "console.log(require('/tmp/bulk.json').tok)")
A=$(node -e "console.log(require('/tmp/bulk.json').admin)")
B=$(node -e "console.log(require('/tmp/bulk.json').buyer)")
curl -s -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d "{\"userIds\":[\"$A\",\"$B\"],\"durationDays\":7,\"reason\":\"plan testi\"}" \
  http://localhost:5631/api/admin/users/bulk-ban -o /tmp/bb.json
node -e "const j=require('/tmp/bb.json');console.log('etkilenen:',j.affected,'(1 olmalı — admin atlanmalı)');console.log('atlananlar:',JSON.stringify(j.skipped))"
# geri al
curl -s -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d "{\"userIds\":[\"$B\"]}" http://localhost:5631/api/admin/users/bulk-unban -o /dev/null
node -e "
require('dotenv').config();const m=require('mongoose');
m.connect(process.env.MONGO_URI).then(async()=>{
  const U=require('./models/User');const u=await U.findById(require('/tmp/bulk.json').buyer);
  console.log('geri alındı → isBanned:',u.isBanned,'| bannedUntil:',u.bannedUntil);
  await m.disconnect();});"
pkill -f "node /tmp/tsrv.js"
```
Expected: `etkilenen: 1`, `atlananlar` içinde admin için `Kendi hesabınız`, ve geri alma sonrası `isBanned: false | bannedUntil: null`.

- [ ] **Step 3: Commit**

```bash
git add routes/admin.js
git commit -m "feat(admin-api): bulk ban/unban/delete with self and admin protection"
```

---

## FAZ 3 — Kullanıcı uçları (Ajan C)

### Task 8: Süreli ban, ban kaldırma, rol değişimi

**Files:** Modify `controllers/userController.js`, `routes/user.js`

- [ ] **Step 1: `banUser` fonksiyonunu değiştir**

`controllers/userController.js` içindeki mevcut `exports.banUser` fonksiyonunu tamamen şununla değiştir:

```js
exports.banUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (String(userId) === String(req.user.id)) {
      return res.status(400).json({ message: 'Kendi hesabınızı banlayamazsınız' });
    }

    const { durationDays, reason } = req.body || {};
    const days = Number(durationDays);
    const bannedUntil = Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * 24 * 3600 * 1000)
      : null; // süresiz

    const user = await User.findByIdAndUpdate(
      userId,
      { isBanned: true, bannedUntil, banReason: reason || null },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı' });

    logAdminAction(req, {
      action: 'ban', targetType: 'user', targetId: user._id,
      meta: { durationDays: days || null, reason: reason || null },
    });

    // Kullanıcıyı bilgilendir — fire-and-forget, push hatası ban'ı bozmaz
    if (user.notificationToken) {
      const sure = bannedUntil
        ? `${days} gün boyunca`
        : 'süresiz olarak';
      sendExpoPushNotification(
        user.notificationToken,
        'Hesabınız askıya alındı',
        `Hesabınız ${sure} askıya alındı.${reason ? ' Sebep: ' + reason : ''}`,
        { type: 'ban', userId: String(user._id) },
        user._id
      ).catch(() => {});
    }

    res.status(200).json({ message: 'Kullanıcı banlandı', bannedUntil });
  } catch (err) {
    res.status(500).json({ message: 'Ban işlemi başarısız', error: err.message });
  }
};
```

Dosyanın en üstündeki import bloğuna ekle (zaten varsa tekrarlama):

```js
const { logAdminAction } = require('../utils/adminLog');
const { sendExpoPushNotification } = require('../utils/expoPush');
```

- [ ] **Step 2: `unbanUser`'ı güncelle**

Mevcut `exports.unbanUser` gövdesindeki güncelleme çağrısını şununla değiştir:

```js
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: false, bannedUntil: null, banReason: null },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    logAdminAction(req, { action: 'unban', targetType: 'user', targetId: user._id });
```

- [ ] **Step 3: Rol değişimi fonksiyonunu ekle**

`controllers/userController.js` sonuna:

```js
// Rol değişimi — sistemin en riskli işlemi, üç korkuluğu var.
exports.changeRole = async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!['buyer', 'seller', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Geçersiz rol' });
    }
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ message: 'Kendi rolünüzü değiştiremezsiniz' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı' });

    // Son yöneticiyi düşürme koruması: aksi halde sisteme admin erişimi tümüyle kaybolur.
    if (user.role === 'admin' && role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Sistemde en az bir yönetici kalmalı' });
      }
    }

    const oldRole = user.role;
    user.role = role;
    await user.save();

    logAdminAction(req, {
      action: 'role_change', targetType: 'user', targetId: user._id,
      meta: { from: oldRole, to: role },
    });

    res.json({ message: 'Rol güncellendi', role });
  } catch (err) {
    res.status(500).json({ message: 'Rol değiştirilemedi', error: err.message });
  }
};
```

- [ ] **Step 4: Route'u bağla**

`routes/user.js` içinde `unban` satırının hemen altına:

```js
router.patch('/:id/role', requireAuth(['admin']), changeRole);
```

ve dosyanın üstündeki destructuring import'una `changeRole` ekle.

> ⚠️ Bu route `router.get('/:id', ...)` satırından **önce** gelmelidir; aksi halde çakışma
> yaşanmaz (farklı method) ama tutarlılık için ban/unban ile aynı blokta tut.

- [ ] **Step 5: Doğrula**

```bash
node --check controllers/userController.js && node --check routes/user.js
PORT=5632 node index.js > /tmp/c1.log 2>&1 & sleep 9
node -e "
require('dotenv').config();const jwt=require('jsonwebtoken');const m=require('mongoose');
m.connect(process.env.MONGO_URI).then(async()=>{
  const U=require('./models/User');
  const admin=await U.findOne({role:'admin'});
  const buyer=await U.findOne({role:'buyer'});
  require('fs').writeFileSync('/tmp/c.json',JSON.stringify({
    tok:jwt.sign({id:String(admin._id),role:'admin',email:admin.email},process.env.JWT_SECRET,{expiresIn:'1h'}),
    admin:String(admin._id), buyer:String(buyer._id)}));
  await m.disconnect();});"
T=$(node -e "console.log(require('/tmp/c.json').tok)"); A=$(node -e "console.log(require('/tmp/c.json').admin)"); B=$(node -e "console.log(require('/tmp/c.json').buyer)")
echo "--- süreli ban ---"
curl -s -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"durationDays":7,"reason":"plan testi"}' "http://localhost:5632/api/users/ban/$B" | head -c 120; echo
node -e "require('dotenv').config();const m=require('mongoose');m.connect(process.env.MONGO_URI).then(async()=>{const U=require('./models/User');const u=await U.findById(require('/tmp/c.json').buyer);console.log('  bannedUntil dolu:',!!u.bannedUntil,'| sebep:',u.banReason);await m.disconnect();});"
echo "--- kendini banlama (400 beklenir) ---"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{}' "http://localhost:5632/api/users/ban/$A"
echo "--- kendi rolünü değiştirme (400 beklenir) ---"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"role":"buyer"}' "http://localhost:5632/api/users/$A/role"
echo "--- son yöneticiyi düşürme (400 beklenir; tek admin var) ---"
curl -s -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"role":"buyer"}' "http://localhost:5632/api/users/$A/role" | head -c 80; echo
echo "--- ban kaldır (temizlenmeli) ---"
curl -s -o /dev/null -X PATCH -H "Authorization: Bearer $T" "http://localhost:5632/api/users/unban/$B"
node -e "require('dotenv').config();const m=require('mongoose');m.connect(process.env.MONGO_URI).then(async()=>{const U=require('./models/User');const u=await U.findById(require('/tmp/c.json').buyer);console.log('  isBanned:',u.isBanned,'| bannedUntil:',u.bannedUntil,'| sebep:',u.banReason);await m.disconnect();});"
pkill -f "node index.js"
```
Expected: süreli ban sonrası `bannedUntil dolu: true | sebep: plan testi`; kendini banlama `400`; kendi rolünü değiştirme `400`; son yönetici mesajı `Sistemde en az bir yönetici kalmalı`; ban kaldırma sonrası `isBanned: false | bannedUntil: null | sebep: null`.

- [ ] **Step 6: Commit**

```bash
git add controllers/userController.js routes/user.js
git commit -m "feat(users): timed bans with reason, role change with guardrails, audit logging"
```

---

### Task 9: `GET /api/users/all` genişletme

**Files:** Modify `controllers/userController.js`

- [ ] **Step 1: `getAllUsers`'ı değiştir**

Mevcut `exports.getAllUsers` fonksiyonunu tamamen şununla değiştir:

```js
exports.getAllUsers = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const filter = {};
    if (req.query.role && ['buyer', 'seller', 'admin'].includes(req.query.role)) {
      filter.role = req.query.role;
    }
    if (req.query.q) {
      const rx = { $regex: String(req.query.q).trim(), $options: 'i' };
      filter.$or = [{ name: rx }, { email: rx }, { companyName: rx }];
    }

    const [items, total] = await Promise.all([
      User.find(filter)
        .select('-password -resetCode -resetCodeExpires')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({ ok: true, items, total, page, limit });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Kullanıcılar alınamadı', error: err.message });
  }
};
```

> ⚠️ Bu, yanıt biçimini diziden `{ ok, items, total }`'a çevirir. Tek tüketicisi mobil
> `UserListScreen`'dir ve Görev 15'te güncellenir.

- [ ] **Step 2: Doğrula**

```bash
node --check controllers/userController.js
PORT=5632 node index.js > /tmp/c2.log 2>&1 & sleep 9
T=$(node -e "console.log(require('/tmp/c.json').tok)")
curl -s -H "Authorization: Bearer $T" "http://localhost:5632/api/users/all?limit=5" -o /tmp/ua2.json
node -e "const j=require('/tmp/ua2.json');console.log('ok:',j.ok,'| dönen:',j.items.length,'| toplam:',j.total,'| şifre sızdı mı:',j.items.some(u=>'password' in u))"
curl -s -H "Authorization: Bearer $T" "http://localhost:5632/api/users/all?role=seller&limit=3" -o /tmp/ua3.json
node -e "const j=require('/tmp/ua3.json');console.log('rol filtresi → hepsi seller mı:',j.items.every(u=>u.role==='seller'))"
pkill -f "node index.js"
```
Expected: `ok: true`, `dönen: 5`, `şifre sızdı mı: false`, `rol filtresi → hepsi seller mı: true`.

- [ ] **Step 3: Commit**

```bash
git add controllers/userController.js
git commit -m "feat(users): paginated user list with search and role filter"
```

---

## FAZ 4 — Admin paneli (Ajan D)

> Referans: `seller/index.html` ve `seller/js/*.js` kanıtlanmış kalıptır. Aynı yapıyı izle:
> `main.js` veriyi çeker ve saf render modüllerine dağıtır; modüller DOM sözleşmesindeki
> ID'lere yazar. **Stil sınıfları `panel-shared/styles.css`'ten gelir; yeni CSS yazma** —
> gerekiyorsa mevcut sınıfları (`.kpi`, `.pill`, `.btn`, `.toolbar`, `.thumb`, `.modal`) kullan.

### Task 10: `admin/index.html` + `admin/js/main.js`

**Files:** Create `admin/index.html`, `admin/js/main.js`

- [ ] **Step 1: `admin/index.html`**

`seller/index.html`'i temel al; farklar: başlık "Yönetici Paneli", kenar çubuğunda **sekiz**
sekme (`overview, users, sellers, auctions, receipts, reports, notify, logs`), CSS yolu
`/panel-shared/styles.css`, script `/admin/js/main.js`. DOM sözleşmesindeki **tüm** ID'ler
tanımlanmalı. Ban için ek bir modal:

```html
<div class="modal" id="banModal">
  <div class="card" style="max-width:420px;width:100%">
    <h3 class="serif" style="margin-bottom:4px">Kullanıcıyı banla</h3>
    <div class="sub" id="banUserName" style="margin-bottom:12px"></div>
    <label for="banDuration">Süre</label>
    <select id="banDuration">
      <option value="">Süresiz</option>
      <option value="7">7 gün</option>
      <option value="30">30 gün</option>
    </select>
    <label for="banReason">Sebep</label>
    <input id="banReason" placeholder="Örn: tekrarlayan ödeme kaçağı">
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn btn-danger" id="banConfirm">Banla</button>
      <button class="btn btn-ghost" id="banCancel">Vazgeç</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: `admin/js/main.js`**

`seller/js/main.js` kalıbını izle. Farklar:

```js
import { apiJson, getToken, getUser } from '/panel-shared/api.js';
import { initAuth, showApp, showLogin } from '/panel-shared/auth.js';
import { renderOverview } from './overview.js';
import { initUsers, loadUsers } from './users.js';
import { initSellers, loadSellers } from './sellers.js';
import { initAuctions, loadAuctions } from './auctions.js';
import { initReceipts, loadReceipts } from './receipts.js';
import { loadReports } from './reports.js';
import { initNotify } from './notify.js';
import { initLogs, loadLogs } from './logs.js';

const TABS = ['overview','users','sellers','auctions','receipts','reports','notify','logs'];
```

Sekme tıklanınca ilgili `load*()` çağrılır (tembel yükleme — sekiz bölümü peşinen çekmek
gereksiz). `initAuth({ onLogin: startApp, allowedRoles: ['admin'] })`. Açılışta `overview`
yüklenir ve `#navReportBadge` şikayet sayısıyla doldurulur.

- [ ] **Step 3: Doğrula**

```bash
node --check admin/js/main.js
node -e "
const h=require('fs').readFileSync('admin/index.html','utf8');
const ids=['loginView','appView','nav','navReportBadge','tab-overview','tab-users','tab-sellers','tab-auctions','tab-receipts','tab-reports','tab-notify','tab-logs','ovAuctions','ovRevenue','ovUsers','ovExposure','ovConversion','ovUnpaid','userSearch','userRole','userRows','usersMsg','userBulkBar','userBulkCount','sellerRows','sellersMsg','newSellerName','newSellerEmail','newSellerPass','newSellerCompany','newSellerBtn','newSellerMsg','aucStatus','aucSeller','aucSearch','aucRows','aucMsg','aucBulkBar','aucBulkCount','recFilter','recRows','recMsg','reportRows','reportsMsg','notifyTitle','notifyBody','notifyBtn','notifyMsg','logAction','logRows','logsMsg','imgModal','modalImg','modalClose','banModal','banUserName','banDuration','banReason','banConfirm','banCancel'];
const eksik=ids.filter(i=>!h.includes('id=\"'+i+'\"'));
console.log(eksik.length? 'EKSİK: '+eksik.join(', ') : '✅ DOM sözleşmesindeki '+ids.length+' ID de var');
console.log('paylaşılan CSS:', h.includes('/panel-shared/styles.css')?'✓':'EKSİK');
"
```
Expected: `✅ DOM sözleşmesindeki 57 ID de var` ve `paylaşılan CSS: ✓`.

- [ ] **Step 4: Commit**

```bash
git add admin/index.html admin/js/main.js
git commit -m "feat(admin-panel): add shell, eight-tab routing and lazy section loading"
```

---

### Task 11: `overview.js`, `users.js`, `sellers.js`

**Files:** Create `admin/js/{overview.js,users.js,sellers.js}`

- [ ] **Step 1: `overview.js`**

```js
export async function renderOverview()
```
`GET /api/admin/overview` çağırır; altı KPI kutusunu doldurur:
`#ovAuctions` (aktif / bugün eklenen), `#ovRevenue` (bugün · hafta · geçen hafta),
`#ovUsers` (toplam · yeni · banlı), `#ovExposure` (gösterim · teklif),
`#ovConversion` (`%` biçiminde), `#ovUnpaid` (`expiredUnpaid / endedWithWinner` oranı —
ödeme sağlığının tek bakışta göstergesi). Para `₺` + `toLocaleString('tr-TR')`.

- [ ] **Step 2: `users.js`**

```js
export function initUsers()           // arama, rol filtresi, toplu çubuk, ban modalı bağlanır
export async function loadUsers()     // GET /api/users/all?q=&role=&page=&limit=50
```
Satır: seçim kutusu, ad, e-posta, **rol seçici** (`buyer/seller/admin` — kendi satırında
`disabled`), kayıt tarihi, ban durumu (`bannedUntil` varsa "X gün kaldı", yoksa "Süresiz"),
eylemler (Banla → modal, Ban kaldır, Detay).

- Rol değişimi: `PATCH /api/users/:id/role`, onay sorulur, sunucu hatası satırda gösterilir.
- Ban: `#banModal` açılır, `PATCH /api/users/ban/:id` gövde `{durationDays, reason}`.
- Toplu: seçim varsa `#userBulkBar` görünür, `#userBulkCount` sayıyı yazar;
  `PATCH /api/admin/users/bulk-ban|bulk-unban`. **Yanıttaki `skipped` listesi kullanıcıya
  sebepleriyle gösterilir** — sessizce yutulmaz.
- Detay: `GET /api/admin/users/:id`, istatistikler modal veya satır altı panelde.
- Tüm dinamik metinler `escapeHtml`'den geçer (kalıp: `seller/js/orders.js`).

- [ ] **Step 3: `sellers.js`**

```js
export function initSellers()         // yeni satıcı formu bağlanır
export async function loadSellers()   // GET /api/admin/sellers
```
Satır: firma, e-posta, mezat sayısı, aktif, ciro, gösterim/teklif, dönüşüm rozeti
(kalıp: `seller/js/auctions.js` içindeki `conversion` + `.pill`).
Yeni satıcı: `POST /api/auth/register` gövde `{name, email, password, role:'seller', companyName}`
(mobil `AddSellerScreen` de bu ucu kullanıyor);
başarıda liste yenilenir, mesaj `#newSellerMsg`'e yazılır.

- [ ] **Step 4: Doğrula**

```bash
for f in admin/js/overview.js admin/js/users.js admin/js/sellers.js; do node --check "$f" && echo "  ✅ $f"; done
node -e "
const u=require('fs').readFileSync('admin/js/users.js','utf8');
console.log('escapeHtml kullanımı:', u.includes('escapeHtml')?'✓':'EKSİK');
console.log('skipped gösterimi:', u.includes('skipped')?'✓':'EKSİK');
console.log('bulk uçları:', u.includes('bulk-ban')&&u.includes('bulk-unban')?'✓':'EKSİK');
console.log('rol değişimi:', u.includes('/role')?'✓':'EKSİK');
"
```
Expected: üç dosya `✅`, dört kontrol `✓`.

- [ ] **Step 5: Commit**

```bash
git add admin/js/overview.js admin/js/users.js admin/js/sellers.js
git commit -m "feat(admin-panel): overview, user management and seller performance sections"
```

---

### Task 12: `auctions.js`, `receipts.js`

**Files:** Create `admin/js/{auctions.js,receipts.js}`

- [ ] **Step 1: `auctions.js`**

```js
export function initAuctions()        // filtreler + toplu çubuk bağlanır
export async function loadAuctions()  // GET /api/admin/auctions?status=&seller=&q=&page=&limit=50
```
Satır: seçim kutusu, görsel (`.thumb`), başlık, **satıcı adı**, fiyat, gösterim, teklif,
dönüşüm rozeti, durum, eylem (Sil → sebep sorar → `POST /api/auctions/delete/:id`).
Toplu silme: `POST /api/admin/auctions/bulk-delete` gövde `{auctionIds, reason}` —
**sebep zorunlu**, boşsa istek gönderilmez. Sayfalama: toplam/sayfa bilgisi `#aucMsg`'de.

- [ ] **Step 2: `receipts.js`**

```js
export function initReceipts()
export async function loadReceipts()  // GET /api/admin/auctions?status=ended&limit=100
```
`seller/js/orders.js` ile **aynı mantık**: `isEnded && winner` filtresi, aciliyet sıralaması
(onay bekleyen → süre işleyen → kapanmış, kapanmışlar yeniden eskiye), `#recFilter` ile
daraltma (tümü / onay bekleyen / dekontu olan / süresi dolan), dekont küçük resmi
(`.thumb`, tıklayınca `#imgModal`), onayla/reddet
(`PATCH /api/receipts/:auctionId/approve|reject`). Ek olarak **satıcı adı** sütunu gösterilir.

- [ ] **Step 3: Doğrula**

```bash
for f in admin/js/auctions.js admin/js/receipts.js; do node --check "$f" && echo "  ✅ $f"; done
node -e "
const a=require('fs').readFileSync('admin/js/auctions.js','utf8');
const r=require('fs').readFileSync('admin/js/receipts.js','utf8');
console.log('toplu silmede sebep zorunlu:', a.includes('reason')?'✓':'EKSİK');
console.log('dekont filtresi:', r.includes('recFilter')?'✓':'EKSİK');
console.log('dekontsuzlar dahil (isEnded && winner):', r.includes('isEnded')&&r.includes('winner')?'✓':'EKSİK');
"
```
Expected: iki dosya `✅`, üç kontrol `✓`.

- [ ] **Step 4: Commit**

```bash
git add admin/js/auctions.js admin/js/receipts.js
git commit -m "feat(admin-panel): all-auction oversight and cross-seller receipt review"
```

---

### Task 13: `reports.js`, `notify.js`, `logs.js`

**Files:** Create `admin/js/{reports.js,notify.js,logs.js}`

- [ ] **Step 1: `reports.js`**

```js
export async function loadReports()   // GET /api/reports
```
Satır: şikayet eden, şikayet edilen, tarih, mesaj, eylem: **şikayet edilen kullanıcıyı
banla** (aynı `#banModal`'ı açar). `#navReportBadge` toplam sayıyla doldurulur.
Mesaj metni `escapeHtml`'den geçer.

- [ ] **Step 2: `notify.js`**

```js
export function initNotify()
```
`#notifyTitle` + `#notifyBody` → `POST /api/notifications/send`. Başlık ve gövde boşsa
istek gönderilmez. Gönderim sonucu `#notifyMsg`'e yazılır.

- [ ] **Step 3: `logs.js`**

```js
export function initLogs()            // #logAction filtresi bağlanır
export async function loadLogs()      // GET /api/admin/logs?action=&page=&limit=50
```
Satır: tarih (`toLocaleString('tr-TR')`), aktör (ad/e-posta), eylem (okunabilir Türkçe
etiket: `ban`→"Ban", `role_change`→"Rol değişimi", `bulk_auction_delete`→"Toplu mezat silme"
vb.), hedef türü/kimliği, `meta` özeti (sebep, süre, eski→yeni rol).

- [ ] **Step 4: Doğrula**

```bash
for f in admin/js/reports.js admin/js/notify.js admin/js/logs.js; do node --check "$f" && echo "  ✅ $f"; done
node -e "
const l=require('fs').readFileSync('admin/js/logs.js','utf8');
console.log('eylem etiketleri:', l.includes('role_change')?'✓':'EKSİK');
const r=require('fs').readFileSync('admin/js/reports.js','utf8');
console.log('şikayetten ban:', r.includes('banModal')?'✓':'EKSİK');
"
```
Expected: üç dosya `✅`, iki kontrol `✓`.

- [ ] **Step 5: Commit**

```bash
git add admin/js/reports.js admin/js/notify.js admin/js/logs.js
git commit -m "feat(admin-panel): reports queue, push composer and audit log viewer"
```

---

## FAZ 5 — Mobil (Ajan E)

### Task 14: `BanUserScreen`'i gerçek hale getir

**Files:** Modify `/Users/umutugur/Dev/frontend/screens/BanUserScreen.js`

Bu ekran bugün **hiç API çağrısı yapmıyor** — e-posta alıp yalnızca uyarı gösteriyor.

- [ ] **Step 1: Gerçek akışı yaz**

Ekranın heritage tasarımını (kök `<Screen>`, `ScreenHeader variant="plain"`,
`Input variant="underline"`, `GradientButton`) **koru**. Yeni akış:

1. E-posta girilir → `GET /api/users/all?q=<email>&limit=5` (admin token'ı `axios.defaults`
   üzerinden zaten gidiyor).
2. Sonuç yoksa `showAlert` ile "Kullanıcı bulunamadı".
3. Bulunan kullanıcı bir `Card` içinde gösterilir (ad, e-posta, rol, mevcut ban durumu).
4. Süre seçimi: üç `PressableScale` çipi — **Süresiz / 7 gün / 30 gün** (seçili olan altın).
5. Sebep: `Input variant="underline"`.
6. "Banla" → `PATCH /api/users/ban/:id` gövde `{ durationDays, reason }`
   (`durationDays` süresizde gönderilmez).
7. Sonuç `showAlert` ile bildirilir; form sıfırlanır.

Kurallar: **`Alert.alert` yasak** (`useAlert()` kullan), `fontWeight` yok, renkler
`../theme/tokens`'tan.

- [ ] **Step 2: Doğrula**

```bash
cd /Users/umutugur/Dev/frontend
node -e "require('@babel/core').transformFileSync('screens/BanUserScreen.js',{presets:['babel-preset-expo']}); console.log('BABEL_OK')"
grep -c "axios" screens/BanUserScreen.js
grep -n "Alert.alert\|fontWeight" screens/BanUserScreen.js || echo "temiz"
grep -c "users/ban/" screens/BanUserScreen.js
```
Expected: `BABEL_OK`; axios sayısı `>0`; `temiz`; `users/ban/` sayısı `1`.

- [ ] **Step 3: Commit**

```bash
cd /Users/umutugur/Dev/frontend
git add screens/BanUserScreen.js
git commit -m "fix(admin): make the ban screen actually ban"
```

---

### Task 15: `UserListScreen`'i yeni yanıt biçimine uyarla

**Files:** Modify `/Users/umutugur/Dev/frontend/screens/UserListScreen.js`

- [ ] **Step 1: Yanıt biçimini güncelle**

`GET /api/users/all` artık dizi değil `{ ok, items, total, page, limit }` döndürüyor.
Ekrandaki `setUsers(res.data)` benzeri kullanımı `setUsers(res.data.items || [])` yap.
Liste boş kalmasın diye bu değişiklik **zorunludur**. Diğer davranış korunur.

- [ ] **Step 2: Doğrula**

```bash
cd /Users/umutugur/Dev/frontend
node -e "require('@babel/core').transformFileSync('screens/UserListScreen.js',{presets:['babel-preset-expo']}); console.log('BABEL_OK')"
grep -n "res.data.items\|data?.items" screens/UserListScreen.js | head -2
```
Expected: `BABEL_OK` ve `items` kullanımını gösteren en az bir satır.

- [ ] **Step 3: Tam paket derlemesi**

```bash
cd /Users/umutugur/Dev/frontend
pkill -f "expo start" 2>/dev/null
(npx expo start --port 8097 > /tmp/m.log 2>&1 &) ; sleep 25
curl -s -o /tmp/b.js -w "%{http_code}\n" "http://localhost:8097/index.bundle?platform=ios&dev=true"
head -c 80 /tmp/b.js | grep -o '"type":"error"' && echo HATA || echo "bundle temiz"
pkill -f "expo start"
```
Expected: `200` ve `bundle temiz`.

- [ ] **Step 4: Commit**

```bash
cd /Users/umutugur/Dev/frontend
git add screens/UserListScreen.js
git commit -m "fix(admin): adapt user list to paginated response shape"
```

---

## FAZ 6 — Entegrasyon (süpervizör)

### Task 16: Bağla, denetle, canlıya al

**Files:** Modify `index.js`

- [ ] **Step 1: `routes/admin.js`'i bağla**

`index.js` içinde diğer route bağlamalarının yanına:

```js
const adminRoutes = require('./routes/admin');
app.use(adminRoutes);
```

- [ ] **Step 2: Satıcı paneli regresyonu (taşıma sonrası bozulmadı mı)**

```bash
node --check index.js
PORT=5633 node index.js > /tmp/final.log 2>&1 & sleep 9
for p in /seller /panel-shared/styles.css /seller/js/main.js /admin /admin/js/main.js; do
  curl -s -o /dev/null -w "  %{http_code}  $p\n" -L "http://localhost:5633$p"
done
pkill -f "node index.js"
```
Expected: hepsi `200`.

- [ ] **Step 3: Yetki denetimi — satıcı admin uçlarına erişemesin**

```bash
PORT=5633 node index.js > /tmp/final2.log 2>&1 & sleep 9
STOK=$(node -e "require('dotenv').config();const jwt=require('jsonwebtoken');const m=require('mongoose');m.connect(process.env.MONGO_URI).then(async()=>{const U=require('./models/User');const s=await U.findOne({role:'seller'});console.log(jwt.sign({id:String(s._id),role:'seller',email:s.email},process.env.JWT_SECRET,{expiresIn:'1h'}));await m.disconnect();})")
for p in /api/admin/overview /api/admin/auctions /api/admin/sellers /api/admin/logs; do
  curl -s -o /dev/null -w "  %{http_code}  satıcı token → $p (403 beklenir)\n" -H "Authorization: Bearer $STOK" "http://localhost:5633$p"
done
curl -s -o /dev/null -w "  %{http_code}  tokensiz → /api/admin/overview (401 beklenir)\n" "http://localhost:5633/api/admin/overview"
pkill -f "node index.js"
```
Expected: dört uç `403`, tokensiz `401`.

- [ ] **Step 4: Commit ve canlıya al**

```bash
git add index.js
git commit -m "feat(admin): mount admin routes and serve the admin panel"
git push origin hardening/security-auth:master
```

---

## Bitiş doğrulaması

- [ ] `node --check` tüm değişen backend dosyalarında ve tüm panel modüllerinde temiz
- [ ] Satıcı paneli taşıma sonrası çalışıyor (`/seller` 200, CSS ve modüller yükleniyor)
- [ ] `/admin` 200; sekiz sekme açılıyor, konsolda hata yok
- [ ] Satıcı token'ı ile `/api/admin/*` → 403; tokensiz → 401
- [ ] Süreli ban `bannedUntil` + `banReason` yazıyor; ban kaldırma temizliyor
- [ ] Kendini banlama, kendi rolünü değiştirme, son yöneticiyi düşürme → 400
- [ ] Toplu ban admin'leri ve isteği yapanı atlıyor, `skipped` sebepleriyle dönüyor
- [ ] Her yönetici eylemi `adminlogs` koleksiyonunda görünüyor
- [ ] Mobil bundle temiz; ban ekranı gerçekten `PATCH` atıyor

## Self-Review notu

Spec kapsamı denetlendi: §3 taşıma → T1; §4.1 → T4; §4.2/§4.5 → T5; §4.3 → T8; §4.4/§4.6 → T6
(model/util T2–T3); §4.7 → T7; §4.8 → T8; §4.9 → T9; §5 sekiz bölüm → T10–T13; §6 mobil →
T14–T15; §7 hata durumları ilgili görevlerin doğrulama adımlarında; §8 → T16 ve bitiş listesi.

Planda netleştirilen iki nokta (spec'te örtüktü):
1. **`index.js` sahipliği çakışıyordu** — Ajan A taşıma için, Ajan B route bağlama için
   dokunacaktı. Çözüm: bağlamayı süpervizör yapar (T16); Ajan B geçici test sunucusuyla
   (`/tmp/tsrv.js`) doğrular.
2. **Yeni satıcı oluşturma ucu** spec'te "mevcut kayıt akışı" diyordu ama hangisi olduğu
   yazılmamıştı. İlk yazımda `/api/signup` olarak geçmişti; **doğrusu `POST /api/auth/register`**
   (mobil `AddSellerScreen`'in de kullandığı uç). Self-review sırasında düzeltildi.
