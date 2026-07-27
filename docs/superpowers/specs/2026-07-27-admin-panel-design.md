# Admin Web Paneli — Tasarım Dokümanı

**Tarih:** 2026-07-27
**Repolar:** `imame-backend` (panel + uçlar), `frontend` (mobil ban ekranı düzeltmesi)
**Durum:** Onaylandı — uygulama planı bekliyor

---

## 1. Bugünkü durum

Admin işlevleri **yalnızca mobil uygulamada** var: `AdminPanelScreen` altında UserList,
AddSeller, ManageAuctions, ReceiptApproval, ViewReports, BanUser, SendNotification.

Backend'de admin yetkili uçlar: `GET /api/users/all`, `GET /api/users/banned`,
`PATCH /api/users/ban/:id`, `PATCH /api/users/unban/:id`, `GET /api/reports`,
`POST /api/notifications/send`. Ayrıca admin `POST /api/auctions/delete/:auctionId` ve
`PATCH /api/receipts/:auctionId/approve|reject` uçlarını kullanabiliyor.

Üç somut eksik:

1. **Platform körlüğü.** Toplu metrik gösteren hiçbir yer yok. `impressionCount`, `bidCount`,
   ödeme davranışı verisi toplanıyor ama kimse bakmıyor.
2. **Ban ekranı sahte.** `frontend/screens/BanUserScreen.js` içinde **hiç API çağrısı yok**;
   e-posta alıp yalnızca bir uyarı gösteriyor. Yani bugün mobilden kimse banlanamıyor.
3. **Süreli ban arayüzsüz.** `bannedUntil` alanını ekledik (cron 7 günlük ban için kullanıyor,
   giriş sırasında süresi dolmuşsa ban kalkıyor) ama admin bunu hiçbir yerden ayarlayamıyor;
   `banUser` yalnızca `isBanned: true` yazıyor, süre ve sebep almıyor.

## 2. Kapsam

**Dahil:** Mobildeki tüm admin işlevlerinin web karşılığı + platform genel bakışı, moderasyon
(şikayet + süreli ban), kullanıcı/satıcı yönetimi, tüm mezatların denetimi. Ayrıca mobil ban
ekranının gerçek hale getirilmesi.

**Hariç (YAGNI):** Rol değiştirme dışındaki yetki yönetimi, denetim günlüğü (audit log),
toplu kullanıcı işlemleri, admin hesabı oluşturma, e-posta gönderimi (push yeterli).

## 3. Mimari — paylaşılan panel altyapısı

Admin paneli satıcı paneliyle aynı tasarım sistemini ve aynı oturum mantığını kullanır.
Kopyalamak yerine ortak dosyalar taşınır:

```
panel-shared/styles.css   ← bugünkü seller/styles.css (Heritage Pro)
panel-shared/api.js       ← bugünkü seller/js/api.js
panel-shared/auth.js      ← bugünkü seller/js/auth.js (izin verilen roller parametreli)
seller/index.html + seller/js/{auctions,orders,main}.js
admin/index.html  + admin/js/{overview,users,auctions,receipts,reports,notify,main}.js
```

`auth.js` bugün satıcı paneline özel olarak `role !== 'seller' && role !== 'admin'` kontrolü
yapıyor. Ortağa taşınırken bu, `initAuth({ onLogin, allowedRoles })` biçimine çevrilir:
satıcı paneli `['seller','admin']`, admin paneli `['admin']` geçer.

`index.js` içinde `/panel-shared` ve `/admin` için statik servis eklenir; `/admin` isteği
`admin/index.html`'i sunar (satıcı panelindeki `/seller` kalıbının aynısı).

**Risk:** Bu taşıma canlıdaki satıcı panelinin yollarını değiştirir (1 CSS bağlantısı, birkaç
`import` yolu). Küçük ama canlı koda dokunuyor; taşıma sonrası satıcı paneli yeniden doğrulanır
(giriş, dört sekme, dekont görselleri).

## 4. Backend

### 4.1 `GET /api/admin/overview` — YENİ
`requireAuth(['admin'])`. Tek çağrıda platform özeti:

```json
{ "ok": true,
  "auctions": { "activeNow": 0, "createdToday": 0, "endedToday": 0, "createdThisWeek": 0 },
  "revenue":  { "today": 0, "thisWeek": 0, "lastWeek": 0 },
  "users":    { "total": 0, "newThisWeek": 0, "banned": 0, "sellers": 0 },
  "exposure": { "impressions": 0, "bids": 0, "conversion": 0 },
  "payment":  { "endedWithWinner": 0, "receiptUploaded": 0, "expiredUnpaid": 0 } }
```

Ciro tanımı satıcı paneliyle **aynı** tutulur: biten ve dekontu `approved` olan mezatların
`currentPrice` toplamı, `endsAt`'e göre Europe/Istanbul gün/hafta kovalarında.
`conversion` = `bids / max(impressions, 1)`.

### 4.2 `GET /api/admin/auctions` — YENİ
`requireAuth(['admin'])`. Panelin **hem Mezatlar hem Dekontlar** bölümünü besleyen tek kaynak
(satıcı panelindeki kalıbın aynısı).

Sorgu: `status` (`active` | `ended` | `all`, varsayılan `all`), `seller` (id), `q` (başlıkta
arama), `page` (1'den başlar), `limit` (varsayılan 50, azami 100).

Yanıt: `{ ok: true, items, total, page, limit }`. Her öğe satıcı panelindeki alanların aynısını
taşır (`impressionCount`, `bidCount`, `receiptStatus`, `receiptUrl`, `paymentDeadline`,
`winner` populate) **artı** `seller` populate (`companyName`, `email`).

Sayfalama zorunlu: mezat sayısı günde ~1000 hedefleniyor, tümü tek yanıtta dönemez.

### 4.3 `PATCH /api/users/ban/:id` — GENİŞLETİLİR
Gövde: `{ durationDays?: number, reason?: string }`.

- `durationDays` verilirse `bannedUntil = now + gün`, verilmezse **süresiz** (`bannedUntil = null`).
- `reason` yeni `banReason` alanına yazılır (`models/User.js`'e eklenir).
- `isBanned = true`.
- Kullanıcının `notificationToken`'ı varsa push gönderilir (süre ve sebep metinde geçer).
  Gönderim `utils/expoPush.js` ile, **fire-and-forget** — push hatası ban işlemini bozmaz.

`PATCH /api/users/unban/:id` ayrıca `bannedUntil` ve `banReason` alanlarını temizler.

### 4.4 `GET /api/admin/users/:id` — YENİ
`requireAuth(['admin'])`. Ban kararı için bağlam:

```json
{ "ok": true, "user": { }, "stats": { "bids": 0, "wonAuctions": 0, "receiptsUploaded": 0,
  "receiptsApproved": 0, "unpaidWins": 0 }, "recentWins": [] }
```

`unpaidWins` = kazandığı ama dekont yüklemediği ve süresi dolmuş mezat sayısı — tekrar eden
ödeme kaçağını gösterir.

### 4.5 `GET /api/admin/sellers` — YENİ
`requireAuth(['admin'])`. "Satıcılar" bölümü için satıcı listesi **ve performansı**. Bu ayrı
uç olmadan panel, her satıcı için ayrı sorgu atmak zorunda kalırdı (N+1).

```json
{ "ok": true, "items": [ { "_id": "", "companyName": "", "email": "", "createdAt": "",
  "auctionCount": 0, "activeCount": 0, "revenue": 0, "impressions": 0, "bids": 0 } ] }
```

`revenue` yine "biten + dekontu `approved`" tanımıyla; tek `Auction.aggregate` ile satıcıya
göre gruplanır.

### 4.6 `GET /api/users/all` — GENİŞLETİLİR
`q` (ad/e-posta araması), `role` filtresi ve `page`/`limit` sayfalama eklenir. Yanıt bugünkü
dizi biçimini korur mu? **Hayır** — `{ ok: true, items, total }` biçimine geçer.
Bu ucu bugün yalnızca mobil `UserListScreen` kullanıyor; o ekran da bu spec kapsamında
güncellenir (bkz. §6).

## 5. Panel bölümleri

| Bölüm | İçerik |
|---|---|
| **Genel Bakış** | §4.1 metrikleri; ödeme sağlığı ve dönüşüm öne çıkar |
| **Kullanıcılar** | Arama + rol filtresi + sayfalama; satır: ad, e-posta, rol, kayıt tarihi, ban durumu (süre dahil). Eylemler: **süreli/süresiz ban + sebep**, ban kaldır, detay (§4.4 istatistikleri) |
| **Satıcılar** | Rolü `seller` olan kullanıcılar; §4.5'ten satıcı başına mezat sayısı, ciro, dönüşüm. **Yeni satıcı ekle** formu (mevcut kayıt akışı) |
| **Mezatlar** | Tüm satıcıların mezatları; durum/satıcı/arama filtreleri, sayfalama; analitik rozetleri; **sebep bildirerek silme** |
| **Dekontlar** | Tüm satıcılar genelinde; kazanan, geri sayım, dekont görseli, onayla/reddet. Filtre: onay bekleyen / dekontu olan / süresi dolan |
| **Şikayetler** | Şikayet kuyruğu (kim, kimi, ne zaman, mesaj); şikayet edilen kullanıcıya satırdan doğrudan ban |
| **Bildirimler** | Push gönderimi (mevcut uç) |

## 6. Mobil düzeltmeler

**`frontend/screens/BanUserScreen.js`** gerçek hale getirilir:
e-posta ile kullanıcı aranır (`GET /api/users/all?q=`), bulunan kullanıcı gösterilir, süre
(süresiz / 7 / 30 gün) ve sebep seçilerek `PATCH /api/users/ban/:id` çağrılır. Sonuç tema
modalıyla bildirilir. Ekranın heritage tasarımı korunur.

**`frontend/screens/UserListScreen.js`** §4.6'daki yeni yanıt biçimine (`{ ok, items, total }`)
uyarlanır; aksi halde liste boşalır.

## 7. Hata durumları

| Durum | Davranış |
|---|---|
| Admin olmayan giriş | "Bu panel yönetici hesapları içindir", oturum açılmaz |
| Token süresi dolmuş / 401 | Oturum temizlenir, giriş görünümüne dönülür |
| Kendini banlama girişimi | Sunucu 400 döner ("Kendi hesabınızı banlayamazsınız") |
| Ban push'u başarısız | Sessizce yutulur; ban yine de uygulanır |
| Boş sonuç (arama/filtre) | Bölüm içinde bilgi mesajı, sayaçlarla birlikte |
| Ağ hatası | Bölüm içinde tekrar-dene aksiyonlu hata kutusu |

## 8. Doğrulama

Test çatısı yok; doğrulama komut ve gözlemle yapılır:

- Backend: değişen dosyalarda `node --check`, sunucu açılış dumanı testi.
- `curl` ile: admin token'ıyla dört yeni/genişletilmiş uç doğru veri döndürüyor; **satıcı
  token'ıyla `/api/admin/*` uçları 403**; süreli ban sonrası kullanıcıda `bannedUntil` ve
  `banReason` dolu; ban kaldırınca temizleniyor; kendini banlama 400.
- **Taşıma regresyonu:** `/seller` paneli taşımadan sonra hâlâ 200 dönüyor, CSS ve modüller
  yükleniyor, giriş ve dört sekme çalışıyor.
- Panel: tarayıcıda admin girişi → yedi bölüm açılıyor, metrikler doluyor, ban/onay/silme
  çalışıyor, konsolda hata yok.
- Mobil: değişen ekranlarda babel dönüşümü + tam paket derlemesi; ban akışı gerçekten
  `PATCH` isteği atıyor.

## 9. Kapsam dışı bırakılanların gerekçesi

- **Denetim günlüğü:** Kimin neyi ne zaman banladığını tutmak ayrı bir model ve her admin
  eyleminde yazma gerektirir; tek yöneticili bir sistemde henüz karşılığı yok.
- **Toplu işlemler:** Kullanıcı sayısı 52; toplu ban/silme ihtiyacı doğmadı.
- **Rol yönetimi (admin atama):** Güvenlik açısından en riskli işlem; şimdilik veritabanından
  yapılması daha güvenli.
