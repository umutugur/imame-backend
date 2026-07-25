# Satıcı Paneli — Yeniden Tasarım ve Zenginleştirme

**Tarih:** 2026-07-25
**Repo:** `imame-backend` (panel, backend tarafından statik servis edilir)
**Durum:** Onaylandı — uygulama planı bekliyor

---

## 1. Bugünkü durum ve problem

Panel tek dosyadır: `seller/seller.html` (615 satır, CSS + JS gömülü), `/seller` yolundan
statik servis edilir. İçeriği:

- Giriş görünümü (`POST /api/auth/login` ile JWT alır)
- 4 KPI: bugün / bu hafta / geçen hafta cirosu + bekleyen dekont sayısı
- 3 sekme: **Mezat Ekle**, **Mezatlarım**, **Dekontlar**

Eksikler:

1. **Teşhir körlüğü.** `impressionCount` ve `bidCount` verileri artık mevcut ama panel
   göstermiyor. Satıcı, ilanının kaç kişiye ulaştığını ve neden teklif almadığını göremiyor.
2. **Ban riski görünmüyor.** Dekont sekmesi `/api/receipts/mine/:sellerId` kullanıyor; bu uç
   yalnızca `receiptUploaded: true` olanları döndürüyor. Yani **dekontu henüz yüklenmemiş**
   (kazananın 48 saatlik süresi işleyen, ban riski taşıyan) mezatlar hiç listelenmiyor.
3. **Düzenleme yok.** Backend'de mezat güncelleme ucu hiç yok. Başlıkta yazım hatası veya
   yanlış fiyat düzeltilemiyor.
4. **Dosya sınırı.** 615 satırlık tek dosyaya üç yeni yetenek + redesign eklenirse 1500+
   satıra çıkar; bakımı zorlaşır.

## 2. Kapsam

**Dahil:** performans analitiği, kazanan & ödeme takibi, mezat düzenleme/silme, görsel
yeniden tasarım, dosya yapısının bölünmesi.

**Hariç (YAGNI):** alıcıyla mesajlaşma, toplu mezat ekleme (CSV/ızgara), satıcı puanı ve
yorumları, mezat zamanlama (ileri tarihli yayın).

**Konumlandırma:** Panel tek başına yeterli olacak şekilde tasarlanır; mobil satıcı
ekranlarıyla birebir özellik eşitliği hedeflenmez.

## 3. Görsel yön — "Heritage Pro"

Tarayıcı mockup'ında üç yön karşılaştırıldı, **B** seçildi.

- **Kenar çubuğu:** koyu espresso (`#241609`), altın vurgular, serif logo kilidi. Marka
  kimliği burada yaşar.
- **Çalışma alanı:** aydınlık (`#f7f4ee`), yüksek kontrast, yoğun ve taranabilir tablo.
  Günde saatlerce kullanılacak bir iş aracı olduğu için okunabilirlik önceliklidir.
- **Tipografi:** başlıklar Fraunces (serif), gövde ve tablo Manrope. Google Fonts CDN.
- **Vurgu:** altın gradient (`#e0c06a → #c9a24b`) yalnızca aktif sekme ve birincil eylemde.
- **Durum rozetleri:** dönüşümü yüksek yeşil, düşük turuncu; bekleyen dekont sayısı kenar
  çubuğunda kırmızı rozet.

Gerekçe: Mobil uygulamanın tümüyle sıcak krem dünyası (Yön A) tablo yoğun bir ekranda
kontrastı düşürüyordu; tümüyle koyu arayüz (Yön C) ise markadan kopuyordu. B ikisini ayırır:
kimlik kenarda, verimlilik ortada.

## 4. Dosya yapısı

Tek dosya bölünür. **Derleme adımı yoktur** — native ES modülleri kullanılır, Render'ın
statik servisi olduğu gibi çalışır.

```
seller/index.html      → yalnızca iskelet + modül girişi
seller/styles.css      → Heritage Pro tasarım sistemi
seller/js/api.js       → fetch sarmalayıcı, token saklama, hata normalleştirme
seller/js/auth.js      → giriş, oturum, çıkış
seller/js/auctions.js  → liste + analitik, oluştur, düzenle, sil
seller/js/orders.js    → kazanan & ödeme takibi, dekont onay/ret
seller/js/main.js      → önyükleme, sekme yönlendirme, KPI hesaplama
```

`seller/seller.html` silinir. `seller/seller-assets/*.json` (il/ilçe/mahalle) olduğu gibi kalır.

**Yönlendirme notu:** `index.js` içindeki `app.use('/seller', express.static(...))`,
`routes/sellerPanel.js` içindeki `GET /seller` rotasından **önce** çalışır. `index.html`
oluşturulduğunda statik servis onu doğrudan sunar (dizin isteği → `index.html`). Karışıklık
olmaması için `routes/sellerPanel.js` içindeki `GET /seller` de `index.html`'e yönlendirilir.

## 5. Backend değişiklikleri

### 5.1 `GET /api/seller/auctions` genişletilir

Bu uç, panelin **tek veri kaynağı** olur; analitik ve sipariş takibi ayrı istek gerektirmez.

Eklenen alanlar: `description`, `impressionCount`, `bidCount`, `paymentDeadline`,
`receiptUrl`, `isBannedProcessed`; `winner` alanı `name email phone address` ile populate edilir.

Mevcut alanlar korunur: `_id title currentPrice startingPrice endsAt images isSigned isEnded
receiptStatus`. Yanıt şekli (`{ ok: true, items }`) değişmez.

### 5.2 `PUT /api/seller/auctions/:id` — YENİ

`requireAuth(['seller','admin'])`. Sahiplik: `auction.seller === req.user.id` (admin muaf).
Gövde `multipart/form-data` (oluşturma ucuyla aynı biçim): `title`, `description`, `isSigned`,
`startingPrice`, opsiyonel `images` (en fazla 5).

Kurallar:

| Durum | İzin |
|---|---|
| `isEnded: true` | 403 — biten mezat düzenlenemez |
| Aktif, `bidCount === 0` | Başlık, açıklama, görsel, başlangıç fiyatı |
| Aktif, `bidCount > 0` | Başlık, açıklama, görsel. **`startingPrice` yok sayılır** (teklif verenlere karşı adil) |

"Teklif var mı" kontrolü, mezat dokümanındaki **`bidCount` alanından** yapılır (teklif verildiğinde
`routes/bid.js` içinde atomik olarak artar ve mevcut kayıtlar için `backfillBidCounts.js` ile
düzeltilmiştir). `Bid` koleksiyonuna ayrıca sorgu atılmaz.

Ek davranış: teklif yokken `startingPrice` değişirse `currentPrice` de aynı değere çekilir
(ikisi başlangıçta eşittir). Yeni görsel gönderilirse `images` dizisi **tümüyle değiştirilir**;
gönderilmezse dokunulmaz.

Yanıt: `{ ok: true, item }`.

### 5.3 Silme

Yeni uç yazılmaz. Mevcut `POST /api/auctions/delete/:auctionId` kullanılır (sebep alır,
satıcıya bildirim gönderir, admin veya mezat sahibi yetkisi zaten kontrol edilir).

## 6. Panel bölümleri

### 6.1 Genel Bakış
Mevcut ciro KPI'ları (bugün / bu hafta / geçen hafta) korunur — hesaplama mantığı değişmez.
Üzerine eklenir: **toplam görüntülenme**, **ortalama teklif/mezat**, **dönüşüm oranı**.
Bekleyen dekont sayısı kenar çubuğunda rozet olarak gösterilir.

### 6.2 Mezatlarım
Her satırda görsel, başlık, fiyat ve **👁 görüntülenme · 🔨 teklif · % dönüşüm** rozetleri.
Dönüşüm = `bidCount / max(impressionCount, 1)`, istemcide hesaplanır.

Sıralama seçenekleri: en yeni, en çok görüntülenen, en çok teklif alan, **dönüşümü en düşük**.
Son seçenek satıcının sorunlu ilanlarını bulmasını sağlar (çok görüntülenip teklif almayan =
fiyat veya fotoğraf sorunu).

Satır eylemleri: **Düzenle**, **Sil**.

### 6.3 Siparişler (yeni)
Kaynak: aynı `GET /api/seller/auctions` yanıtı, istemcide `isEnded && winner` filtresiyle.
Böylece §1'deki 2. eksik kapanır — dekontu yüklenmemiş mezatlar da listelenir.

Her satırda: kazanan adı ve iletişim bilgisi, kazanma fiyatı, **48 saatlik geri sayım**
(`paymentDeadline`), dekont durumu rozeti (yüklenmedi / bekliyor / onaylandı / reddedildi),
dekont görselini büyütme, **Onayla** / **Reddet** eylemleri
(`PATCH /api/receipts/:auctionId/approve|reject`).

Süresi dolmuş ve dekont yüklenmemiş kayıtlar ayrıca işaretlenir (kazanan ban sürecine girmiştir).

### 6.4 Mezat Ekle / Düzenle
Mevcut form korunur; düzenleme kipinde alanlar dolu gelir ve §5.2 kurallarına göre
`startingPrice` alanı gerektiğinde kilitlenir (kilit sebebi kullanıcıya yazıyla belirtilir).

## 7. Hata durumları

| Durum | Davranış |
|---|---|
| Token süresi dolmuş / 401 | Oturum temizlenir, giriş görünümüne dönülür, bilgi mesajı |
| Düzenleme reddedildi (403) | Sunucunun mesajı forma yazılır; alanlar korunur |
| Görsel yükleme başarısız | Satır hata durumuna geçer, form verisi kaybolmaz |
| Ağ hatası | Sekme içinde tekrar-dene aksiyonlu hata kutusu |
| Yetkisiz rol (satıcı değil) | Giriş sonrası "bu panel satıcılar içindir" mesajı |

## 8. Doğrulama

Depoda test çatısı yok; doğrulama komut ve gözlemle yapılır:

- Backend: değişen dosyalarda `node --check`; sunucu açılış dumanı testi.
- `curl` ile: satıcı token'ıyla `GET /api/seller/auctions` yeni alanları döndürüyor;
  `PUT` başka satıcının mezatında 403; biten mezatta 403; teklifli mezatta `startingPrice`
  değişmiyor; teklifsiz mezatta değişiyor.
- Panel: tarayıcıda giriş → dört bölüm açılıyor, analitik rozetleri doluyor, düzenleme
  kaydediliyor, dekont onay/ret çalışıyor.
- Konsol hatası olmaması ve modül importlarının çözülmesi.

## 9. Kapsam dışı bırakılanların gerekçesi

- **Toplu mezat ekleme:** Ayrı ve büyük bir tasarım problemi (fotoğraf eşleştirme, kuyruk,
  kısmi başarı). Satıcılar gerçekten yüksek hacimle geldiğinde kendi spec'iyle ele alınmalı.
- **Mesajlaşma:** Mobilde mevcut; panele taşımak sohbet arayüzü ve okunmamış takibi gerektirir.
- **Zamanlama:** `endsAt` sunucuda `calculateEndsAt()` ile sabit hesaplanıyor; ileri tarihli
  yayın bu sözleşmeyi ve cron mantığını değiştirir.
