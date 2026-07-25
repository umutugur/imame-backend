# Satıcı Paneli — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Satıcı panelini "Heritage Pro" diliyle yeniden tasarlamak; performans analitiği, kazanan & ödeme takibi ve mezat düzenleme yeteneklerini eklemek.

**Architecture:** Tek 615 satırlık HTML, derleme adımı olmadan native ES modüllerine bölünür. Panelin tüm verisi tek uçtan (`GET /api/seller/auctions`) gelir; `main.js` veriyi çeker ve saf render modüllerine (`auctions.js`, `orders.js`) dağıtır.

**Tech Stack:** Vanilla ES modules, CSS custom properties, Google Fonts (Fraunces + Manrope), Express 5 + Mongoose 8 (backend).

**Spec:** `docs/superpowers/specs/2026-07-25-seller-panel-redesign-design.md`

**Not (test altyapısı):** Depoda test çatısı yok. TDD yerine her görevde **`node --check` + çalışan sunucuya `curl`** (panelde: tarayıcı konsolu + görsel kontrol) kullanılır. Doğrulama adımları beklenen çıktıyı yazar.

---

## Dosya haritası

| Dosya | Sorumluluk | Durum |
|-------|-----------|-------|
| `routes/sellerPanel.js` | Liste ucu genişletilir, `PUT` eklenir, `/seller` → `index.html` | Değişir |
| `seller/index.html` | Yalnızca iskelet + tüm bölüm kapsayıcıları | **Yeni** |
| `seller/styles.css` | Heritage Pro tasarım sistemi | **Yeni** |
| `seller/js/api.js` | fetch sarmalayıcı, token/oturum saklama | **Yeni** |
| `seller/js/auth.js` | Giriş formu, oturum başlatma/bitirme | **Yeni** |
| `seller/js/auctions.js` | Mezat listesi + analitik, form (ekle/düzenle), silme | **Yeni** |
| `seller/js/orders.js` | Kazanan & ödeme takibi, dekont onay/ret | **Yeni** |
| `seller/js/main.js` | Önyükleme, sekme yönlendirme, veri akışı, KPI | **Yeni** |
| `seller/seller.html` | Silinir | **Silinir** |

### DOM sözleşmesi (bağlayıcı — modüller bu ID'lere yazar)

`index.html` bu ID'leri **boş kapsayıcı** olarak sağlar; JS modülleri doldurur.

```
#loginView  #loginEmail  #loginPassword  #loginBtn  #loginMsg
#appView    #sellerName  #logoutBtn
#nav        (içinde <a data-tab="overview|auctions|orders|form">)
#navPendingBadge
#tab-overview  #tab-auctions  #tab-orders  #tab-form
#kpiToday #kpiWeek #kpiPrevWeek #kpiViews #kpiBids #kpiConversion
#auctionSort   #auctionRows   #auctionsMsg
#orderRows     #ordersMsg
#formTitle #f-title #f-desc #f-price #f-signed #f-images #f-preview
#formPriceLock #formSubmit #formCancel #formMsg
#imgModal #modalImg #modalClose
```

### Modül sözleşmesi (bağlayıcı)

```js
// api.js
export async function apiFetch(url, opts = {})   // 401/403 → oturumu temizler, 'unauthorized' fırlatır
export function getToken()
export function getUser()
export function setSession({ token, user })
export function clearSession()
export function onUnauthorized(fn)               // auth.js giriş ekranına dönmek için kaydolur

// auth.js
export function initAuth({ onLogin })            // giriş formunu bağlar, başarıda onLogin(user) çağırır
export function logout(reason)

// auctions.js
export function renderAuctions(items, handlers)  // handlers: { onEdit(item), onDeleted() }
export function initAuctionForm({ onSaved })     // ekle/düzenle formunu bağlar
export function openCreateForm()
export function openEditForm(item)

// orders.js
export function renderOrders(items, { onChanged })

// main.js — dışa aktarım yok; önyükleme yapar
```

**Veri akışı:** `main.js` tek `GET /api/seller/auctions` çağrısı yapar → `items` dizisini
`renderAuctions`, `renderOrders` ve KPI hesabına dağıtır. Herhangi bir değişiklikten sonra
(`onSaved` / `onDeleted` / `onChanged`) `main.js` veriyi yeniden çeker ve üçünü de tazeler.

---

## FAZ 1 — Backend

### Task 1: Liste ucunu genişlet

**Files:** Modify `routes/sellerPanel.js`

- [ ] **Step 1: `select` ve `populate` güncelle**

`router.get('/api/seller/auctions', ...)` içindeki sorguyu şununla değiştir:

```js
    const items = await Auction.find({ seller: req.user.id })
      .select(
        '_id title description currentPrice startingPrice endsAt images isSigned isEnded ' +
        'receiptStatus receiptUrl paymentDeadline isBannedProcessed impressionCount bidCount winner'
      )
      .populate('winner', 'name email phone address')
      .sort({ createdAt: -1 })
      .lean();
```

Yanıt şekli (`res.json({ ok: true, items })`) **değişmez**.

- [ ] **Step 2: Doğrula**

```bash
node --check routes/sellerPanel.js
PORT=5620 node index.js > /tmp/sp.log 2>&1 &
sleep 9
TOKEN=$(node -e "require('dotenv').config();const jwt=require('jsonwebtoken');const m=require('mongoose');m.connect(process.env.MONGO_URI).then(async()=>{const U=require('./models/User');const s=await U.findOne({email:'kehribar.koleksiyon@imame.mock'});console.log(jwt.sign({id:s._id.toString(),role:'seller',email:s.email},process.env.JWT_SECRET,{expiresIn:'1h'}));await m.disconnect();})")
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:5620/api/seller/auctions" -o /tmp/sa.json
node -e "
const j=require('/tmp/sa.json'); const a=j.items[0];
console.log('ok:', j.ok, '| adet:', j.items.length);
for (const f of ['description','impressionCount','bidCount','paymentDeadline','receiptUrl','winner']) {
  console.log('  ', f, '→', f in a ? 'VAR' : 'YOK');
}"
pkill -f "node index.js"
```
Expected: `ok: true`, adet > 0 ve altı alanın hepsi `VAR`.
(`winner` ve `paymentDeadline` biten mezatı olmayan satıcıda `null` olabilir — alan yine de bulunur.)

- [ ] **Step 3: Commit**

```bash
git add routes/sellerPanel.js
git commit -m "feat(seller-api): return analytics, winner and payment fields"
```

---

### Task 2: Mezat düzenleme ucu

**Files:** Modify `routes/sellerPanel.js`

- [ ] **Step 1: `PUT` route'unu ekle**

`GET /api/seller/auctions` route'undan sonra, `module.exports` satırından önce:

```js
// ✅ Mezat düzenleme — sahiplik + iş kuralları
router.put('/api/seller/auctions/:id', requireAuth(['seller', 'admin']), upload.array('images', 5), async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.id);
    if (!auction) return res.status(404).json({ ok: false, message: 'Mezat bulunamadı' });

    const isOwner = String(auction.seller) === req.user.id;
    if (req.user.role !== 'admin' && !isOwner) {
      return res.status(403).json({ ok: false, message: 'Bu mezat size ait değil' });
    }
    if (auction.isEnded) {
      return res.status(403).json({ ok: false, message: 'Biten mezat düzenlenemez' });
    }

    const { title, description, isSigned, startingPrice } = req.body;
    if (typeof title === 'string' && title.trim()) auction.title = title.trim();
    if (typeof description === 'string') auction.description = description;
    if (isSigned !== undefined) auction.isSigned = isSigned === 'true' || isSigned === true;

    // Fiyat yalnızca hiç teklif yokken değiştirilebilir (teklif verenlere karşı adil).
    const hasBids = (auction.bidCount || 0) > 0;
    if (!hasBids && startingPrice !== undefined && startingPrice !== '') {
      const p = Number(startingPrice);
      if (!Number.isFinite(p) || p < 0) {
        return res.status(400).json({ ok: false, message: 'Geçersiz başlangıç fiyatı' });
      }
      auction.startingPrice = p;
      auction.currentPrice = p; // teklif yokken ikisi eşittir
    }

    // Yeni görsel gönderildiyse dizi TÜMÜYLE değiştirilir; gönderilmediyse dokunulmaz.
    if (req.files && req.files.length) {
      const urls = [];
      for (const file of req.files) {
        const uploaded = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'imame-mezatlar' },
            (err, result) => (err ? reject(err) : resolve(result))
          );
          stream.end(file.buffer);
        });
        urls.push(uploaded.secure_url);
      }
      auction.images = urls;
    }

    await auction.save();
    res.json({ ok: true, item: auction.toObject() });
  } catch (e) {
    console.error('Mezat güncelleme hatası:', e);
    res.status(500).json({ ok: false, message: 'Mezat güncellenemedi' });
  }
});
```

> Not: Cloudinary yükleme biçimi, aynı dosyadaki `POST /api/seller/auctions` ucunda kullanılan
> yöntemle aynı olmalıdır. O uçta farklı bir yardımcı (ör. `uploadBuffer`) varsa **onu kullan**,
> yukarıdaki bloğu ona göre uyarla — iki uç aynı yolu izlemeli.

- [ ] **Step 2: Kuralları doğrula**

```bash
node --check routes/sellerPanel.js
PORT=5620 node index.js > /tmp/sp2.log 2>&1 &
sleep 9
node -e "
require('dotenv').config();
const jwt=require('jsonwebtoken'); const m=require('mongoose');
m.connect(process.env.MONGO_URI).then(async()=>{
  const U=require('./models/User'), A=require('./models/Auction');
  const s=await U.findOne({email:'kehribar.koleksiyon@imame.mock'});
  const tok=jwt.sign({id:s._id.toString(),role:'seller',email:s.email},process.env.JWT_SECRET,{expiresIn:'1h'});
  const free=await A.findOne({seller:s._id,isEnded:false,bidCount:0});
  const withBids=await A.findOne({seller:s._id,isEnded:false,bidCount:{\$gt:0}});
  const other=await A.findOne({seller:{\$ne:s._id}});
  require('fs').writeFileSync('/tmp/t.json',JSON.stringify({tok,free:free?._id,withBids:withBids?._id,other:other?._id}));
  console.log('teklifsiz:',free?._id,'| teklifli:',withBids?._id,'| başkasının:',other?._id);
  await m.disconnect();
});"
T=$(node -e "console.log(require('/tmp/t.json').tok)")
FREE=$(node -e "console.log(require('/tmp/t.json').free)")
OTHER=$(node -e "console.log(require('/tmp/t.json').other)")
echo '--- teklifsiz mezatta fiyat DEĞİŞMELİ ---'
curl -s -X PUT -H "Authorization: Bearer $T" -F "title=Düzenleme Testi" -F "startingPrice=1234" "http://localhost:5620/api/seller/auctions/$FREE" \
 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('ok:',j.ok,'| başlık:',j.item?.title,'| fiyat:',j.item?.startingPrice,'| currentPrice:',j.item?.currentPrice)})"
echo '--- başkasının mezatı 403 dönmeli ---'
curl -s -o /dev/null -w "  HTTP %{http_code}\n" -X PUT -H "Authorization: Bearer $T" -F "title=Olmaz" "http://localhost:5620/api/seller/auctions/$OTHER"
pkill -f "node index.js"
```
Expected: birinci istek `ok: true`, başlık `Düzenleme Testi`, fiyat ve `currentPrice` `1234`;
ikinci istek `HTTP 403`.

> Teklifli mezat bulunamazsa (`teklifli: undefined`) fiyat kilidi testi atlanır — bu durumda
> kuralı elle bir teklif ekleyerek doğrula veya panelde kontrol et.

- [ ] **Step 3: Commit**

```bash
git add routes/sellerPanel.js
git commit -m "feat(seller-api): add auction edit endpoint with fairness rules"
```

---

## FAZ 2 — Panel temeli

### Task 3: Heritage Pro tasarım sistemi

**Files:** Create `seller/styles.css`

- [ ] **Step 1: Dosyayı oluştur**

Tasarım kararları (mockup'ta onaylandı): koyu espresso kenar çubuğu, aydınlık çalışma alanı,
altın vurgu yalnızca aktif sekme ve birincil eylemde.

```css
:root{
  --espresso:#241609; --sidebar:#241609; --gold:#c9a24b; --gold-lt:#e0c06a;
  --page:#f7f4ee; --card:#ffffff; --line:#e4ded2; --line-2:#eae5db;
  --ink:#241609; --ink-2:#463a2c; --muted:#8d8171;
  --ok-bg:#e6f2e6; --ok-fg:#1f6b23; --warn-bg:#fdece0; --warn-fg:#a1551b;
  --danger:#c0392b; --radius:11px;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--page);color:var(--ink-2);font-family:'Manrope',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,h3,.serif{font-family:'Fraunces',Georgia,serif}
.hidden{display:none !important}

/* Giriş */
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--espresso);padding:20px}
.login-card{width:100%;max-width:380px;background:var(--card);border-radius:16px;padding:30px}
.login-card h1{font-size:23px;color:var(--ink);margin-bottom:4px}
.login-card .sub{font-size:12.5px;color:var(--muted);margin-bottom:20px}

/* Kabuk */
.shell{display:flex;min-height:100vh}
.sidebar{width:210px;flex:none;background:var(--sidebar);padding:20px 0;display:flex;flex-direction:column}
.brand{padding:0 18px 16px;color:#f2e5cb;font-size:18px;border-bottom:1px solid rgba(216,178,90,.25)}
.brand small{display:block;font-family:'Manrope';font-size:9.5px;letter-spacing:2.5px;color:var(--gold);font-weight:700;margin-top:3px}
.nav{padding:12px 0;flex:1}
.nav a{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;color:#b6a488;font-size:13.5px;font-weight:600;text-decoration:none;cursor:pointer}
.nav a.on{color:var(--espresso);background:linear-gradient(100deg,var(--gold-lt),var(--gold));font-weight:800;margin:0 10px;border-radius:8px;padding:10px 12px}
.badge-red{background:var(--danger);color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:800}
.sidebar-foot{padding:0 18px;color:#8d7a5e;font-size:11.5px}
.main{flex:1;padding:22px 26px;overflow-x:auto}

/* KPI */
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:13px 15px}
.kpi .l{font-size:9.5px;letter-spacing:1.6px;font-weight:700;color:var(--muted)}
.kpi .v{font-family:'Fraunces',serif;font-size:22px;color:var(--ink);margin-top:4px}
.kpi .d{font-size:10.5px;color:var(--muted);margin-top:3px}
.kpi.gold{border-color:var(--gold);background:#fffaef}
.kpi.gold .v{color:#a1743b}

/* Tablo */
table{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
th{text-align:left;font-size:9.5px;letter-spacing:1.4px;font-weight:700;color:var(--muted);background:#efeae0;padding:9px 10px;border-bottom:1px solid var(--line)}
td{padding:10px;border-bottom:1px solid var(--line-2);vertical-align:middle}
tr:last-child td{border-bottom:none}
.thumb{width:40px;height:40px;border-radius:7px;object-fit:cover;display:block;background:#efe3cd}
.ttl{font-weight:700;color:var(--ink)}
.sub{font-size:10.5px;color:var(--muted);margin-top:2px}
.num{font-variant-numeric:tabular-nums;font-weight:700}
.pill{display:inline-block;padding:3px 8px;border-radius:20px;font-size:10.5px;font-weight:800}
.pill.ok{background:var(--ok-bg);color:var(--ok-fg)}
.pill.warn{background:var(--warn-bg);color:var(--warn-fg)}
.pill.neutral{background:#eee9df;color:var(--muted)}
.pill.danger{background:#fbe4e1;color:var(--danger)}

/* Form + butonlar */
label{display:block;font-size:11px;font-weight:700;letter-spacing:.4px;color:var(--muted);margin:12px 0 5px}
input,select,textarea{width:100%;font-family:inherit;font-size:13.5px;color:var(--ink);background:var(--card);border:1.5px solid var(--line);border-radius:9px;padding:10px 12px}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--gold)}
input:disabled{background:#f1ece2;color:var(--muted)}
textarea{min-height:110px;resize:vertical}
.btn{display:inline-flex;align-items:center;gap:6px;border:none;cursor:pointer;font-family:inherit;font-weight:800;font-size:13px;border-radius:9px;padding:11px 18px}
.btn-primary{background:linear-gradient(100deg,var(--gold-lt),var(--gold));color:var(--espresso)}
.btn-ghost{background:transparent;border:1.5px solid var(--line);color:var(--ink-2)}
.btn-danger{background:transparent;border:1.5px solid var(--danger);color:var(--danger)}
.btn-sm{padding:6px 11px;font-size:11.5px;border-radius:7px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:18px}
.msg{margin-top:12px;font-size:12.5px}
.msg.err{color:var(--danger)}
.msg.ok{color:var(--ok-fg)}
.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.toolbar select{width:auto}
.preview{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}
.preview img{width:64px;height:64px;object-fit:cover;border-radius:7px;border:1px solid var(--line)}
.lock-note{font-size:11px;color:var(--warn-fg);margin-top:5px}

/* Modal */
.modal{position:fixed;inset:0;background:rgba(20,12,6,.75);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
.modal.open{display:flex}
.modal img{max-width:90vw;max-height:85vh;border-radius:10px}
.modal-close{position:absolute;top:18px;right:22px;background:none;border:none;color:#f2e5cb;font-size:34px;cursor:pointer}

@media (max-width:820px){
  .shell{flex-direction:column}
  .sidebar{width:100%}
  .nav{display:flex;overflow-x:auto;padding:8px}
  .nav a.on{margin:0 4px}
}
```

- [ ] **Step 2: Doğrula**

Run: `node -e "const c=require('fs').readFileSync('seller/styles.css','utf8'); const o=(c.match(/{/g)||[]).length, cl=(c.match(/}/g)||[]).length; console.log('süslü parantez dengesi:', o===cl, o, cl);"`
Expected: `süslü parantez dengesi: true` ve iki sayı eşit.

- [ ] **Step 3: Commit**

```bash
git add seller/styles.css
git commit -m "feat(seller-panel): add Heritage Pro design system"
```

---

### Task 4: `api.js` ve `auth.js`

**Files:** Create `seller/js/api.js`, Create `seller/js/auth.js`

- [ ] **Step 1: `seller/js/api.js` oluştur**

```js
// api.js — fetch sarmalayıcı + oturum saklama.
// 401/403 alındığında oturumu temizler ve kayıtlı dinleyiciyi çağırır.
const TOKEN_KEY = 'seller_token';
const USER_KEY = 'seller_user';
let unauthorizedHandler = null;

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
export function setSession({ token, user }) {
  localStorage.setItem(TOKEN_KEY, token || '');
  localStorage.setItem(USER_KEY, JSON.stringify(user || null));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  // Eski sürümden kalan anahtarlar
  localStorage.removeItem('seller_id');
  localStorage.removeItem('user');
}
export function onUnauthorized(fn) { unauthorizedHandler = fn; }

export async function apiFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401 || res.status === 403) {
    clearSession();
    if (unauthorizedHandler) unauthorizedHandler('Oturum süreniz doldu. Lütfen tekrar giriş yapın.');
    throw new Error('unauthorized');
  }
  return res;
}

// JSON yanıtı çöz; sunucunun mesajını hataya taşır.
export async function apiJson(url, opts = {}) {
  const res = await apiFetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || (data && data.ok === false)) {
    throw new Error((data && data.message) || 'İşlem başarısız');
  }
  return data;
}
```

- [ ] **Step 2: `seller/js/auth.js` oluştur**

```js
// auth.js — giriş formu ve oturum yaşam döngüsü.
import { setSession, clearSession, onUnauthorized } from './api.js';

const $ = (id) => document.getElementById(id);

function show(view) {
  $('loginView').classList.toggle('hidden', view !== 'login');
  $('appView').classList.toggle('hidden', view !== 'app');
}

export function logout(reason) {
  clearSession();
  show('login');
  if (reason) {
    const el = $('loginMsg');
    el.textContent = reason;
    el.className = 'msg err';
  }
}

export function initAuth({ onLogin }) {
  onUnauthorized((reason) => logout(reason));
  $('logoutBtn').addEventListener('click', () => logout(''));

  const submit = async () => {
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    const msgEl = $('loginMsg');
    msgEl.textContent = 'Giriş yapılıyor…';
    msgEl.className = 'msg';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Giriş başarısız');
      if (!data.token) throw new Error('Sunucu oturum anahtarı döndürmedi');
      if (data.user?.role !== 'seller' && data.user?.role !== 'admin') {
        throw new Error('Bu panel satıcı hesapları içindir.');
      }

      setSession({ token: data.token, user: data.user });
      msgEl.textContent = '';
      show('app');
      onLogin(data.user);
    } catch (e) {
      msgEl.textContent = e.message;
      msgEl.className = 'msg err';
    }
  };

  $('loginBtn').addEventListener('click', submit);
  $('loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

export function showApp() { show('app'); }
export function showLogin() { show('login'); }
```

- [ ] **Step 3: Doğrula**

Run: `node --check seller/js/api.js && node --check seller/js/auth.js && echo OK`
Expected: `OK`
(Node ES modül söz dizimini `--check` ile doğrular; `import/export` sorun çıkarmaz.)

- [ ] **Step 4: Commit**

```bash
git add seller/js/api.js seller/js/auth.js
git commit -m "feat(seller-panel): add api wrapper and auth module"
```

---

### Task 5: `index.html` iskeleti ve `main.js`

**Files:** Create `seller/index.html`, Create `seller/js/main.js`

- [ ] **Step 1: `seller/index.html` oluştur**

DOM sözleşmesindeki tüm ID'ler burada tanımlanır.

```html
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>İmame — Satıcı Paneli</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,900&family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/seller/styles.css">
</head>
<body>

<!-- Giriş -->
<div id="loginView" class="login-wrap">
  <div class="login-card">
    <h1 class="serif">İmame</h1>
    <div class="sub">Satıcı Paneli</div>
    <label for="loginEmail">E-posta</label>
    <input id="loginEmail" type="email" placeholder="ornek@imame.com" autocomplete="username">
    <label for="loginPassword">Şifre</label>
    <input id="loginPassword" type="password" placeholder="••••••••" autocomplete="current-password">
    <button class="btn btn-primary" id="loginBtn" style="width:100%;justify-content:center;margin-top:18px">Giriş Yap</button>
    <div id="loginMsg" class="msg"></div>
  </div>
</div>

<!-- Uygulama -->
<div id="appView" class="shell hidden">
  <aside class="sidebar">
    <div class="brand serif">İMAME<small>SATICI PANELİ</small></div>
    <nav class="nav" id="nav">
      <a data-tab="overview" class="on">Genel Bakış</a>
      <a data-tab="auctions">Mezatlarım</a>
      <a data-tab="orders">Siparişler <span id="navPendingBadge" class="badge-red hidden">0</span></a>
      <a data-tab="form">Mezat Ekle</a>
    </nav>
    <div class="sidebar-foot">
      <div id="sellerName">—</div>
      <button class="btn btn-ghost btn-sm" id="logoutBtn" style="margin-top:8px;color:#b6a488;border-color:rgba(216,178,90,.3)">Çıkış</button>
    </div>
  </aside>

  <main class="main">
    <!-- Genel Bakış -->
    <section id="tab-overview">
      <h2 class="serif" style="margin-bottom:14px">Genel Bakış</h2>
      <div class="kpis">
        <div class="kpi"><div class="l">BUGÜN</div><div class="v" id="kpiToday">₺0</div><div class="d">onaylı satış</div></div>
        <div class="kpi"><div class="l">BU HAFTA</div><div class="v" id="kpiWeek">₺0</div><div class="d">onaylı satış</div></div>
        <div class="kpi"><div class="l">GEÇEN HAFTA</div><div class="v" id="kpiPrevWeek">₺0</div><div class="d">onaylı satış</div></div>
        <div class="kpi gold"><div class="l">GÖRÜNTÜLENME</div><div class="v" id="kpiViews">0</div><div class="d">tüm mezatlar</div></div>
        <div class="kpi"><div class="l">TEKLİF</div><div class="v" id="kpiBids">0</div><div class="d">toplam</div></div>
        <div class="kpi"><div class="l">DÖNÜŞÜM</div><div class="v" id="kpiConversion">%0</div><div class="d">teklif / gösterim</div></div>
      </div>
    </section>

    <!-- Mezatlarım -->
    <section id="tab-auctions" class="hidden">
      <div class="toolbar">
        <h2 class="serif">Mezatlarım</h2>
        <select id="auctionSort">
          <option value="new">En yeni</option>
          <option value="views">En çok görüntülenen</option>
          <option value="bids">En çok teklif alan</option>
          <option value="lowconv">Dönüşümü en düşük</option>
        </select>
      </div>
      <table>
        <thead><tr><th></th><th>MEZAT</th><th>FİYAT</th><th>GÖRÜNTÜLENME</th><th>TEKLİF</th><th>DÖNÜŞÜM</th><th></th></tr></thead>
        <tbody id="auctionRows"></tbody>
      </table>
      <div id="auctionsMsg" class="msg"></div>
    </section>

    <!-- Siparişler -->
    <section id="tab-orders" class="hidden">
      <h2 class="serif" style="margin-bottom:12px">Siparişler</h2>
      <table>
        <thead><tr><th>MEZAT</th><th>KAZANAN</th><th>TUTAR</th><th>KALAN SÜRE</th><th>DEKONT</th><th></th></tr></thead>
        <tbody id="orderRows"></tbody>
      </table>
      <div id="ordersMsg" class="msg"></div>
    </section>

    <!-- Ekle / Düzenle -->
    <section id="tab-form" class="hidden">
      <h2 class="serif" id="formTitle" style="margin-bottom:12px">Mezat Ekle</h2>
      <div class="card" style="max-width:640px">
        <label for="f-title">Başlık</label>
        <input id="f-title" placeholder="Örn: 33 Hane Kehribar Tespih 10mm">
        <label for="f-price">Başlangıç fiyatı (₺)</label>
        <input id="f-price" type="number" min="0" step="1">
        <div id="formPriceLock" class="lock-note hidden">Bu mezata teklif verildiği için fiyat değiştirilemez.</div>
        <label for="f-signed">Usta imzalı</label>
        <select id="f-signed"><option value="false">Hayır</option><option value="true">Evet</option></select>
        <label for="f-desc">Açıklama</label>
        <textarea id="f-desc" placeholder="Malzeme, işçilik, ölçüler…"></textarea>
        <label for="f-images">Görseller (en fazla 5)</label>
        <input id="f-images" type="file" accept="image/*" multiple>
        <div id="f-preview" class="preview"></div>
        <div style="display:flex;gap:10px;margin-top:18px">
          <button class="btn btn-primary" id="formSubmit">Kaydet</button>
          <button class="btn btn-ghost hidden" id="formCancel">Vazgeç</button>
        </div>
        <div id="formMsg" class="msg"></div>
      </div>
    </section>
  </main>
</div>

<div class="modal" id="imgModal">
  <button class="modal-close" id="modalClose">×</button>
  <img id="modalImg" alt="Dekont">
</div>

<script type="module" src="/seller/js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: `seller/js/main.js` oluştur**

```js
// main.js — önyükleme, sekme yönlendirme, tek veri akışı, KPI hesabı.
import { apiJson, getToken, getUser } from './api.js';
import { initAuth, showApp, showLogin } from './auth.js';
import { renderAuctions, initAuctionForm, openCreateForm } from './auctions.js';
import { renderOrders } from './orders.js';

const $ = (id) => document.getElementById(id);
const TZ = 'Europe/Istanbul';
const fmtTL = (n) => '₺' + Number(n || 0).toLocaleString('tr-TR');

let items = [];

/* ---------- Sekmeler ---------- */
const TABS = ['overview', 'auctions', 'orders', 'form'];
function showTab(name) {
  TABS.forEach((t) => $('tab-' + t).classList.toggle('hidden', t !== name));
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
}
function initTabs() {
  document.querySelectorAll('#nav a').forEach((a) => {
    a.addEventListener('click', () => {
      const tab = a.dataset.tab;
      if (tab === 'form') openCreateForm();
      showTab(tab);
    });
  });
}

/* ---------- KPI (mevcut mantık birebir korunur) ----------
   Ciro = biten VE dekontu onaylanmış mezatların currentPrice toplamı,
   endsAt'e göre bugün / bu hafta / geçen hafta kovalarına ayrılır (İstanbul saati). */
function istanbulParts() {
  const now = new Date();
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).reduce((o, x) => (o[x.type] = x.value, o), {});
  return { y: +p.year, m: +p.month - 1, d: +p.day };
}
function computeKpis(list) {
  const { y, m, d } = istanbulParts();
  const startToday = new Date(Date.UTC(y, m, d, 0, 0, 0));
  const anchor = new Date(Date.UTC(y, m, d, 12, 0, 0));
  const wd = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: TZ }).format(anchor);
  const shift = { Mon: 0, Tue: -1, Wed: -2, Thu: -3, Fri: -4, Sat: -5, Sun: -6 }[wd] ?? 0;
  const startWeek = new Date(Date.UTC(y, m, d + shift, 0, 0, 0));
  const startPrevWeek = new Date(startWeek.getTime() - 7 * 24 * 3600 * 1000);

  let today = 0, week = 0, prevWeek = 0, views = 0, bids = 0;

  for (const a of list) {
    views += a.impressionCount || 0;
    bids += a.bidCount || 0;
    if (!a.isEnded) continue;
    if ((a.receiptStatus || '').toLowerCase() !== 'approved') continue;
    const price = Number(a.currentPrice || 0);
    const endMs = a.endsAt ? new Date(a.endsAt).getTime() : 0;
    if (endMs >= startToday.getTime()) today += price;
    if (endMs >= startWeek.getTime()) week += price;
    if (endMs >= startPrevWeek.getTime() && endMs < startWeek.getTime()) prevWeek += price;
  }

  $('kpiToday').textContent = fmtTL(today);
  $('kpiWeek').textContent = fmtTL(week);
  $('kpiPrevWeek').textContent = fmtTL(prevWeek);
  $('kpiViews').textContent = views.toLocaleString('tr-TR');
  $('kpiBids').textContent = bids.toLocaleString('tr-TR');
  $('kpiConversion').textContent = '%' + (views ? (bids / views * 100) : 0).toFixed(1).replace('.', ',');

  const pending = list.filter((a) => a.isEnded && a.winner && (a.receiptStatus || '').toLowerCase() === 'pending' && a.receiptUrl).length;
  const badge = $('navPendingBadge');
  badge.textContent = String(pending);
  badge.classList.toggle('hidden', pending === 0);
}

/* ---------- Veri akışı ---------- */
export async function refresh() {
  const data = await apiJson('/api/seller/auctions');
  items = data.items || [];
  computeKpis(items);
  renderAuctions(items, { onEdit: () => showTab('form'), onDeleted: refresh });
  renderOrders(items, { onChanged: refresh });
}

/* ---------- Önyükleme ---------- */
function startApp(user) {
  $('sellerName').textContent = user?.companyName || user?.name || user?.email || 'Satıcı';
  refresh().catch((e) => {
    if (e.message !== 'unauthorized') $('auctionsMsg').textContent = e.message;
  });
}

initTabs();
initAuth({ onLogin: startApp });
initAuctionForm({ onSaved: async () => { await refresh(); showTab('auctions'); } });
$('modalClose').addEventListener('click', () => $('imgModal').classList.remove('open'));

if (getToken()) { showApp(); startApp(getUser()); } else { showLogin(); }
```

- [ ] **Step 3: Doğrula**

Run: `node --check seller/js/main.js && node -e "const h=require('fs').readFileSync('seller/index.html','utf8'); const ids=['loginView','appView','nav','tab-overview','tab-auctions','tab-orders','tab-form','kpiToday','kpiViews','kpiConversion','auctionRows','orderRows','f-title','formSubmit','imgModal','navPendingBadge']; const eksik=ids.filter(i=>!h.includes('id=\"'+i+'\"')); console.log(eksik.length? 'EKSİK: '+eksik.join(','): 'tüm DOM sözleşmesi ID’leri var');"`
Expected: `tüm DOM sözleşmesi ID’leri var`

- [ ] **Step 4: Commit**

```bash
git add seller/index.html seller/js/main.js
git commit -m "feat(seller-panel): add shell, tab routing and KPI pipeline"
```

---

## FAZ 3 — Bölümler

### Task 6: `auctions.js` — liste, analitik, silme

**Files:** Create `seller/js/auctions.js`

- [ ] **Step 1: Liste ve analitik render'ını yaz**

```js
// auctions.js — mezat listesi (analitik rozetleriyle), form (ekle/düzenle), silme.
import { apiJson } from './api.js';

const $ = (id) => document.getElementById(id);
const fmtTL = (n) => '₺' + Number(n || 0).toLocaleString('tr-TR');
const conversion = (a) => (a.bidCount || 0) / Math.max(a.impressionCount || 0, 1);

let cache = [];
let handlers = { onEdit: () => {}, onDeleted: () => {} };

function sortItems(list, mode) {
  const c = [...list];
  if (mode === 'views') return c.sort((a, b) => (b.impressionCount || 0) - (a.impressionCount || 0));
  if (mode === 'bids') return c.sort((a, b) => (b.bidCount || 0) - (a.bidCount || 0));
  if (mode === 'lowconv') {
    // Yalnızca yeterince gösterilmiş olanlar anlamlıdır; azları sona at.
    return c.sort((a, b) => {
      const seenA = (a.impressionCount || 0) >= 20, seenB = (b.impressionCount || 0) >= 20;
      if (seenA !== seenB) return seenA ? -1 : 1;
      return conversion(a) - conversion(b);
    });
  }
  return c; // 'new' — sunucu zaten createdAt DESC döndürüyor
}

function rowHtml(a) {
  const conv = conversion(a) * 100;
  const cls = (a.impressionCount || 0) >= 20 && conv < 1 ? 'warn' : conv > 0 ? 'ok' : 'neutral';
  const img = (a.images && a.images[0]) || '';
  const status = a.isEnded ? 'Sona erdi' : 'Aktif · 22:00';
  return `
    <tr data-id="${a._id}">
      <td>${img ? `<img class="thumb" src="${img}">` : '<div class="thumb"></div>'}</td>
      <td><div class="ttl">${escapeHtml(a.title || '')}</div>
          <div class="sub">${status}${a.isSigned ? ' · Usta imzalı' : ''}</div></td>
      <td class="num">${fmtTL(a.currentPrice || a.startingPrice)}</td>
      <td class="num">${(a.impressionCount || 0).toLocaleString('tr-TR')}</td>
      <td class="num">${a.bidCount || 0}</td>
      <td><span class="pill ${cls}">%${conv.toFixed(1).replace('.', ',')}</span></td>
      <td style="white-space:nowrap">
        ${a.isEnded ? '' : `<button class="btn btn-ghost btn-sm act-edit">Düzenle</button>
        <button class="btn btn-danger btn-sm act-del">Sil</button>`}
      </td>
    </tr>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderAuctions(items, h) {
  cache = items;
  if (h) handlers = h;
  const mode = $('auctionSort').value || 'new';
  const rows = sortItems(items, mode);
  $('auctionRows').innerHTML = rows.map(rowHtml).join('');
  $('auctionsMsg').textContent = rows.length ? '' : 'Henüz mezatınız yok.';
}

$('auctionSort').addEventListener('change', () => renderAuctions(cache));

$('auctionRows').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const item = cache.find((x) => x._id === tr.dataset.id);
  if (!item) return;

  if (e.target.classList.contains('act-edit')) {
    openEditForm(item);
    handlers.onEdit(item);
  }
  if (e.target.classList.contains('act-del')) {
    const reason = prompt('Silme sebebi (satıcıya bildirilecek):');
    if (!reason) return;
    try {
      await apiJson(`/api/auctions/delete/${item._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      handlers.onDeleted();
    } catch (err) {
      if (err.message !== 'unauthorized') $('auctionsMsg').textContent = err.message;
    }
  }
});
```

- [ ] **Step 2: Formu (ekle/düzenle) aynı dosyaya ekle**

```js
/* ---------- Form: ekle / düzenle ---------- */
let editingId = null;
let onSavedCb = () => {};

export function openCreateForm() {
  editingId = null;
  $('formTitle').textContent = 'Mezat Ekle';
  $('f-title').value = '';
  $('f-price').value = '';
  $('f-price').disabled = false;
  $('f-signed').value = 'false';
  $('f-desc').value = '';
  $('f-images').value = '';
  $('f-preview').innerHTML = '';
  $('formPriceLock').classList.add('hidden');
  $('formCancel').classList.add('hidden');
  $('formMsg').textContent = '';
}

export function openEditForm(a) {
  editingId = a._id;
  $('formTitle').textContent = 'Mezatı Düzenle';
  $('f-title').value = a.title || '';
  $('f-price').value = a.startingPrice ?? '';
  $('f-signed').value = a.isSigned ? 'true' : 'false';
  $('f-desc').value = a.description || '';
  $('f-images').value = '';
  $('f-preview').innerHTML = (a.images || []).map((u) => `<img src="${u}">`).join('');
  const locked = (a.bidCount || 0) > 0;
  $('f-price').disabled = locked;
  $('formPriceLock').classList.toggle('hidden', !locked);
  $('formCancel').classList.remove('hidden');
  $('formMsg').textContent = '';
}

export function initAuctionForm({ onSaved }) {
  onSavedCb = onSaved;

  $('f-images').addEventListener('change', () => {
    const files = [...($('f-images').files || [])].slice(0, 5);
    $('f-preview').innerHTML = files.map((f) => `<img src="${URL.createObjectURL(f)}">`).join('');
  });

  $('formCancel').addEventListener('click', () => openCreateForm());

  $('formSubmit').addEventListener('click', async () => {
    const msg = $('formMsg');
    const fd = new FormData();
    fd.append('title', $('f-title').value.trim());
    fd.append('description', $('f-desc').value);
    fd.append('isSigned', $('f-signed').value);
    if (!$('f-price').disabled) fd.append('startingPrice', $('f-price').value);
    for (const f of [...($('f-images').files || [])].slice(0, 5)) fd.append('images', f);

    if (!fd.get('title')) { msg.textContent = 'Başlık zorunlu'; msg.className = 'msg err'; return; }

    msg.textContent = 'Kaydediliyor…';
    msg.className = 'msg';
    try {
      const url = editingId ? `/api/seller/auctions/${editingId}` : '/api/seller/auctions';
      await apiJson(url, { method: editingId ? 'PUT' : 'POST', body: fd });
      msg.textContent = editingId ? 'Mezat güncellendi.' : 'Mezat eklendi.';
      msg.className = 'msg ok';
      openCreateForm();
      onSavedCb();
    } catch (e) {
      if (e.message === 'unauthorized') return;
      msg.textContent = e.message;
      msg.className = 'msg err';
    }
  });
}
```

- [ ] **Step 3: Doğrula**

Run: `node --check seller/js/auctions.js && node -e "const s=require('fs').readFileSync('seller/js/auctions.js','utf8'); ['renderAuctions','initAuctionForm','openCreateForm','openEditForm'].forEach(f=>console.log(f, s.includes('export function '+f)?'✓':'EKSİK'));"`
Expected: dördü de `✓`.

- [ ] **Step 4: Commit**

```bash
git add seller/js/auctions.js
git commit -m "feat(seller-panel): auction list with analytics, edit form and delete"
```

---

### Task 7: `orders.js` — kazanan & ödeme takibi

**Files:** Create `seller/js/orders.js`

- [ ] **Step 1: Dosyayı oluştur**

Kritik: kaynak `GET /api/seller/auctions` yanıtıdır; **dekontu yüklenmemiş** biten mezatlar da
listelenir (eski panelin göremediği ban riski burada görünür).

```js
// orders.js — biten mezatların kazanan ve ödeme takibi.
import { apiJson } from './api.js';

const $ = (id) => document.getElementById(id);
const fmtTL = (n) => '₺' + Number(n || 0).toLocaleString('tr-TR');
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let cache = [];
let onChangedCb = () => {};

function remaining(deadline) {
  if (!deadline) return { text: '—', over: false };
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { text: 'Süre doldu', over: true };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return { text: `${h}s ${m}dk`, over: false };
}

function statusPill(a) {
  const st = (a.receiptStatus || '').toLowerCase();
  if (!a.receiptUrl) return '<span class="pill neutral">Yüklenmedi</span>';
  if (st === 'approved') return '<span class="pill ok">Onaylandı</span>';
  if (st === 'rejected') return '<span class="pill danger">Reddedildi</span>';
  return '<span class="pill warn">Bekliyor</span>';
}

function rowHtml(a) {
  const w = a.winner || {};
  const r = remaining(a.paymentDeadline);
  const pending = a.receiptUrl && (a.receiptStatus || '').toLowerCase() === 'pending';
  const risky = !a.receiptUrl && r.over;
  return `
    <tr data-id="${a._id}">
      <td><div class="ttl">${escapeHtml(a.title)}</div>
          <div class="sub">${new Date(a.endsAt).toLocaleDateString('tr-TR')}</div></td>
      <td><div class="ttl">${escapeHtml(w.name || 'Bilinmiyor')}</div>
          <div class="sub">${escapeHtml(w.phone || w.email || '')}</div></td>
      <td class="num">${fmtTL(a.currentPrice)}</td>
      <td>${risky ? '<span class="pill danger">Süre doldu</span>' : `<span class="sub">${r.text}</span>`}</td>
      <td>${statusPill(a)}
          ${a.receiptUrl ? '<button class="btn btn-ghost btn-sm act-view" style="margin-left:6px">Gör</button>' : ''}</td>
      <td style="white-space:nowrap">
        ${pending ? `<button class="btn btn-primary btn-sm act-ok">Onayla</button>
                     <button class="btn btn-danger btn-sm act-no">Reddet</button>` : ''}
      </td>
    </tr>`;
}

export function renderOrders(items, { onChanged } = {}) {
  if (onChanged) onChangedCb = onChanged;
  cache = items.filter((a) => a.isEnded && a.winner);
  // Önce işlem bekleyenler, sonra süresi yaklaşanlar
  cache.sort((a, b) => new Date(a.paymentDeadline || a.endsAt) - new Date(b.paymentDeadline || b.endsAt));
  $('orderRows').innerHTML = cache.map(rowHtml).join('');
  $('ordersMsg').textContent = cache.length ? '' : 'Sonuçlanmış mezatınız yok.';
}

$('orderRows').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const a = cache.find((x) => x._id === tr.dataset.id);
  if (!a) return;

  if (e.target.classList.contains('act-view')) {
    $('modalImg').src = a.receiptUrl;
    $('imgModal').classList.add('open');
    return;
  }
  const approve = e.target.classList.contains('act-ok');
  const reject = e.target.classList.contains('act-no');
  if (!approve && !reject) return;

  try {
    await apiJson(`/api/receipts/${a._id}/${approve ? 'approve' : 'reject'}`, { method: 'PATCH' });
    onChangedCb();
  } catch (err) {
    if (err.message !== 'unauthorized') $('ordersMsg').textContent = err.message;
  }
});
```

- [ ] **Step 2: Doğrula**

Run: `node --check seller/js/orders.js && node -e "const s=require('fs').readFileSync('seller/js/orders.js','utf8'); console.log('renderOrders export:', s.includes('export function renderOrders')?'✓':'EKSİK'); console.log('dekontsuz kayıtlar da listeleniyor:', s.includes('a.isEnded && a.winner')?'✓':'EKSİK');"`
Expected: ikisi de `✓`.

- [ ] **Step 3: Commit**

```bash
git add seller/js/orders.js
git commit -m "feat(seller-panel): winner and payment tracking with receipt actions"
```

---

## FAZ 4 — Geçiş ve doğrulama

### Task 8: Eski dosyayı kaldır, rotayı güncelle

**Files:** Delete `seller/seller.html`, Modify `routes/sellerPanel.js`

- [ ] **Step 1: Rotayı `index.html`'e yönlendir**

`routes/sellerPanel.js` içindeki panel rotasını şununla değiştir:

```js
router.get('/seller', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'seller', 'index.html'));
});
```

- [ ] **Step 2: Eski dosyayı sil**

```bash
git rm seller/seller.html
```

- [ ] **Step 3: Uçtan uca doğrula**

```bash
node --check routes/sellerPanel.js
PORT=5620 node index.js > /tmp/sp3.log 2>&1 &
sleep 9
echo '--- panel ve varlıkları sunuluyor mu ---'
for p in /seller /seller/styles.css /seller/js/main.js /seller/js/api.js /seller/js/auth.js /seller/js/auctions.js /seller/js/orders.js; do
  curl -s -o /dev/null -w "  %{http_code} $p\n" "http://localhost:5620$p"
done
echo '--- adres verileri hâlâ erişilebilir mi ---'
curl -s -o /dev/null -w "  %{http_code} /seller/seller-assets/sehirler.json\n" "http://localhost:5620/seller/seller-assets/sehirler.json"
pkill -f "node index.js"
```
Expected: `/seller` için `200` (veya `301`/`302` ardından 200) ve altı JS/CSS dosyası ile
`sehirler.json` için `200`.

- [ ] **Step 4: Commit**

```bash
git add -A seller routes/sellerPanel.js
git commit -m "chore(seller-panel): replace single-file panel with modular version"
```

---

## Bitiş doğrulaması

- [ ] `node --check` tüm değişen backend dosyalarında ve beş JS modülünde temiz
- [ ] `GET /api/seller/auctions` yeni alanları döndürüyor (`impressionCount`, `bidCount`, `winner`, `paymentDeadline`, `receiptUrl`, `description`)
- [ ] `PUT /api/seller/auctions/:id`: kendi teklifsiz mezatında fiyat değişiyor; başkasının mezatında 403; biten mezatta 403
- [ ] `/seller` ve tüm statik varlıklar 200 dönüyor
- [ ] Tarayıcıda: giriş → dört sekme açılıyor, KPI'lar doluyor, analitik rozetleri görünüyor, düzenleme kaydediliyor, dekont onay/ret çalışıyor, konsolda hata yok
- [ ] `seller/seller.html` artık yok

## Self-Review notu

Spec kapsamı denetlendi: §3 görsel yön → T3; §4 dosya yapısı → T3–T7 + T8 (silme ve rota);
§5.1 → T1; §5.2 → T2; §5.3 (mevcut silme ucu) → T6; §6.1 KPI → T5; §6.2 liste+analitik+sıralama → T6;
§6.3 siparişler → T7; §6.4 form/düzenleme → T6; §7 hata durumları → `api.js`/`auth.js` (T4) ve
her bölümün mesaj alanları; §8 doğrulama → her görevin son adımları.

Ek karar (spec'te örtük, planda netleştirildi): "dönüşümü en düşük" sıralamasında en az **20
gösterim** almış mezatlar öne alınır — 3 gösterimle %0 dönüşüm anlamlı bir sinyal değildir.
