# Mezat Listeleme (Feed) Sıralaması — Tasarım Dokümanı

**Tarih:** 2026-07-25
**Repolar:** `imame-backend` (ana iş) + `frontend` (görüntülenme bildirimi & sonsuz kaydırma)
**Durum:** Onaylandı — uygulama planı bekliyor

---

## 1. Problem

Ana ekran şu an `GET /api/auctions/all` ile **tüm** aktif mezatları `$sample` kullanarak
**rastgele** döndürüyor. Sayfalama yok, görüntülenme takibi yok.

Sonuçlar:
- Her yenilemede sıra değiştiği için kullanıcı **bazı mezatları hiç görmeden** gün bitiyor,
  bazılarını ise tekrar tekrar görüyor.
- Hedef ölçek **günde ~1000 mezat**. Tüm liste tek yanıtta dönemez.
- Tüm mezatlar aynı gün **TR 22:00**'de bittiği için "bitişe az kaldı" gibi bir aciliyet
  sıralaması ayırt edici değil (hepsi aynı anda biter).

Basit alternatifler yetersiz: `createdAt` sıralaması (yeni/eski üstte) kalıcı olarak bir
grubu üste sabitler; saf rastgelelik ise kapsama garantisi vermez.

## 2. Hedef

**Temel: adil teşhir.** Her mezat gün içinde yeterince kullanıcıya gösterilsin; hiçbir mezat
görünmeden kapanmasın.
**Üzerine: hafif liyakat.** İlgi çeken mezatlar aynı adalet seviyesi içinde öne geçsin.

## 3. Çekirdek fikir: "görüldü" listesi imlecin yerine geçer

Kullanıcının o gün gördüğü mezatlar kaydedilir. Sayfalama şu sorguya dönüşür:

> "Bu kullanıcının bugün **görmediği**, genel olarak **en az görülen** N mezatı ver."

Kullanıcı kaydırdıkça gördükleri işaretlenir; bir sonraki sayfa onları **doğal olarak** hariç
tutar. Böylece:

- **Tekrar eden kart yok, atlanan kart yok** (yapısal garanti).
- İmleç (cursor) veya sunucu tarafı anlık görüntü (snapshot) saklamaya **gerek yok**.

## 4. Veri modeli

### 4.1 `models/Auction.js` — iki sayaç eklenir

```js
impressionCount: { type: Number, default: 0 },  // kaç kez gösterildi (global)
bidCount:        { type: Number, default: 0 },  // teklif sayısı (denormalize)
```

`bidCount` denormalize edilir; sıralamada her istekte `Bid` koleksiyonuna JOIN atmamak için.

### 4.2 `models/AuctionSeen.js` — YENİ, kullanıcı başına günde tek doküman

```js
{
  user:      { type: ObjectId, ref: 'User', required: true },
  day:       { type: String, required: true },        // mezat döngüsü anahtarı, 'YYYY-MM-DD'
  seen:      [{ type: ObjectId, ref: 'Auction' }],
  createdAt: { type: Date, default: Date.now },       // TTL
}
```

**İndeksler:**
- `{ user: 1, day: 1 }` — **unique** (upsert için)
- `{ createdAt: 1 }` — **TTL, `expireAfterSeconds: 129600`** (36 saat) → ertesi gün otomatik silinir

Kullanıcı başına günde **tek doküman** olduğu için yazma hacmi düşüktür (5.000 aktif kullanıcı =
günde 5.000 doküman, ertesi gün silinir). 1000 ObjectId içeren dizi ~24 KB'dır; sorun değil.

### 4.3 Gün anahtarı — `utils/auctionDayKey.js` (YENİ)

Gün sınırı **gece yarısı değil, TR 22:00**'dir; çünkü mezat döngüsü orada döner. Mevcut
`utils/calculateEndsAt.js` zaten geçerli döngünün bitişini (TR 22:00 → UTC 19:00) hesaplıyor.
`auctionDayKey()` bu değeri alıp `YYYY-MM-DD` biçiminde döndürür:

```js
const calculateEndsAt = require('./calculateEndsAt');
function auctionDayKey() {
  const d = calculateEndsAt();           // geçerli döngünün bitiş anı (UTC)
  return d.toISOString().slice(0, 10);   // 'YYYY-MM-DD'
}
```

Böylece "görüldü" kümesi mezat döngüsüyle **birebir** hizalanır: 22:05'te yeni döngü başladığında
kullanıcı temiz bir listeyle karşılaşır.

## 5. Sıralama algoritması

Adalet baskındır; liyakat yalnızca eşitlik bozucudur.

| Öncelik | Ölçüt | Yön |
|---------|-------|-----|
| 1 | **Görülme kovası** = `Math.floor(impressionCount / 10)` | artan (az görülen önce) |
| 2 | **Liyakat** = `bidCount / Math.max(impressionCount, 1)` | azalan |
| 3 | **Sabit rastgelelik** = `hash(auctionId + seed)` | artan |

`hash` = FNV-1a 32-bit (bağımlılık gerektirmez, deterministik), sonuç `0..1` aralığına
normalize edilir. Aynı `(auctionId, seed)` çifti her zaman aynı değeri üretir — sıra kullanıcı
için kararlıdır.

**Kova neden gerekli:** Saf `impressionCount` sıralamasında herkes aynı anda aynı "en az görülen"
mezatlara akın eder (sürü etkisi). 10'luk kova + kullanıcıya özel rastgelelik yükü dağıtır.

**Liyakat neden oran:** Ham teklif sayısı kullanılsaydı, çok gösterildiği için çok teklif alan
mezat daha da öne çıkar ve "zengin daha zengin" döngüsü oluşurdu. `teklif/gösterim` oranı,
*gösterildiğinde ilgi çeken* mezatı ödüllendirir.

**Tohum (seed):**
- Giriş yapmış kullanıcı: `seed = userId` (kullanıcı için kararlı sıra)
- Misafir: istemcinin ürettiği ve sakladığı `seed` sorgu parametresi; yoksa istek başına rastgele
  (kabul edilebilir düşüş)

**Yeni mezat** `impressionCount: 0` ile en üst kovaya girer → hızlı ilk teşhir.

## 6. API

### 6.1 `GET /api/auctions/feed` — YENİ

Kimlik doğrulama **isteğe bağlı** (misafir de kullanır; token varsa kişiselleşir).

**Sorgu:** `limit` (varsayılan 20, azami 50), `seed` (yalnızca misafirler için),
`offset` (yalnızca ikinci turda kullanılır — bkz. adım 6).

**Yanıt:**
```json
{ "items": [ /* seller populate edilmiş mezat dokümanları, sıralı */ ],
  "hasMore": true,
  "phase": "unseen" }
```

**Akış:**
1. `userId` (token varsa) ve `dayKey` belirlenir.
2. `userId` varsa `AuctionSeen.findOne({ user, day })` → `seenIds` (yoksa boş küme).
3. Aday sorgusu: `Auction.find({ isEnded: false }).select('_id impressionCount bidCount').lean()`
   — 1000 doküman için ucuzdur (küçük alanlar, `lean`).
4. Ayrıştırma: `unseen` / `seen`.
5. Havuz seçimi: `unseen` boş değilse havuz = `unseen`, `phase='unseen'`; aksi halde havuz = `seen`,
   `phase='seen'` (ikinci tur — sonsuz kaydırma çıkmaza girmesin).
6. §5'teki ölçütlerle bellek içinde sıralanır ve dilimlenir:
   - `phase='unseen'` → `havuz.slice(0, limit)`. **`offset` kullanılmaz**; görülmemişler kümesi
     her istekte küçüldüğü için imleç görevini kendisi görür.
   - `phase='seen'` → `havuz.slice(offset, offset + limit)`. İkinci turda "görüldü" kümesi artık
     daralmadığından imleç işlevi kaybolur; bu yüzden istemcinin gönderdiği `offset` kullanılır.
     Sıralama deterministik olduğu için (sayaçlar + tohum) offset tabanlı sayfalama tutarlıdır.
7. Bu ID'ler için tam dokümanlar `seller` (yalnızca `_id`, `companyName`) ile çekilir, **sıra korunur**.
8. `hasMore`:
   - `phase='unseen'` → `havuz.length > limit`
   - `phase='seen'` → `offset + limit < havuz.length`

**`GET /api/auctions/all` korunur** (davranışı değişmez, kullanımdan kaldırılmış sayılır) — mağazadaki
eski uygulama sürümü bozulmasın diye. Yeni uygulama `/feed` kullanır.

### 6.2 `POST /api/auctions/impressions` — YENİ

Kimlik doğrulama **isteğe bağlı**.

**Gövde:** `{ "auctionIds": ["...", "..."] }` — tekilleştirilir, **azami 50** ID.

**Akış:**
1. Geçersiz/fazla ID'ler ayıklanır.
2. `userId` varsa: `Auction.find({ _id: { $in: ids } }).select('seller').lean()` ile **kullanıcının
   kendi mezatları** sayımdan çıkarılır (satıcı kendi ilanını yenileyerek sayacı şişirmesin).
3. `Auction.bulkWrite` → sayılabilir ID'ler için `$inc: { impressionCount: 1 }`.
4. `userId` varsa: `AuctionSeen.updateOne({ user, day }, { $addToSet: { seen: { $each: ids } },
   $setOnInsert: { createdAt: new Date() } }, { upsert: true })`.
   **Not:** "görüldü" kümesine **tüm** gösterilen ID'ler yazılır (kendi mezatları dahil) — tekrar
   gösterilmesinler diye. Yalnızca *sayaç* hariç tutulur.
5. `{ ok: true }` döner. İstemci yanıtı beklemez (best-effort).

### 6.3 `routes/bid.js` — `bidCount` artırımı

Teklif başarıyla kaydedildikten sonra ilgili mezatta `$inc: { bidCount: 1 }`. Mevcut atomik
`findOneAndUpdate({ _id, currentPrice: { $lt: amount } }, { currentPrice: amount })` çağrısına
`$inc` eklenerek tek işlemde yapılır.

### 6.4 İndeksler

- `Auction`: `{ isEnded: 1, impressionCount: 1 }`
- `AuctionSeen`: `{ user: 1, day: 1 }` (unique), `{ createdAt: 1 }` (TTL 129600 sn)

## 7. Geriye dönük veri (backfill)

Mevcut mezatların `bidCount` değeri şema varsayılanıyla 0 olur ama gerçekte teklifleri vardır.
**Tek seferlik** `scripts/backfillBidCounts.js`: `Bid` koleksiyonunu `auction` alanına göre
gruplayıp her mezatın `bidCount` değerini gerçek sayıya ayarlar. `impressionCount` için backfill
yoktur (0'dan başlamak doğrudur — henüz ölçüm yok).

## 8. İstemci (frontend)

**`screens/HomeScreen.js`:**
- Veri kaynağı `/api/auctions/all` → **`/api/auctions/feed`** (sayfalı).
- **Sonsuz kaydırma:** `onEndReached` ile sonraki sayfa; `hasMore` false ise durur. `phase='seen'`
  dönmeye başladığında istemci bir `offset` sayacı tutar ve her sayfada `limit` kadar artırır
  (birinci turda `offset` gönderilmez).
- **Görünürlük takibi:** `onViewableItemsChanged` +
  `viewabilityConfig: { itemVisiblePercentThreshold: 50, minimumViewTime: 1000 }`
  → kart %50 görünür ve ≥1 sn kalırsa "görüldü" sayılır (hızla kaydırılanlar sayılmaz).
- **Toplu bildirim:** görülen ID'ler biriktirilir, **~2 sn debounce** ile tek
  `POST /api/auctions/impressions` isteğinde gönderilir. İstemcide tekrar gönderim olmaması için
  oturum içi tekilleştirme yapılır.
- **Satır → mezat eşlemesi:** Liste 2'li satırlardan oluştuğu için görünürlük olayı satır öğesini
  bildirir; satır içindeki her iki mezat ID'si de kaydedilir.
- **Yenile (pull-to-refresh):** liste sıfırlanır, ilk sayfa yeniden çekilir → "görmediklerim"
  baştan gelir.
- **Reklam serpiştirme korunur:** mevcut `buildFeed` (her 3 satırda bir banner) yeni öğeler
  eklendikçe yeniden hesaplanır. `buildFeed` `FavoritesScreen` tarafından da içe aktarıldığı için
  **imzası değişmez**.
- **Faz geçişi:** `phase` `'unseen'`dan `'seen'`a geçtiğinde listeye bir kez ince bir ayraç eklenir
  ("Tüm mezatları gördünüz — baştan gösteriliyor"), kullanıcı tekrarı hata sanmasın.

**`screens/FavoritesScreen.js`:** değişmez (favoriler ayrı bir listedir, sıralama uygulanmaz).

**Misafir tohumu:** uygulama ilk açılışta rastgele bir `seed` üretip `AsyncStorage`'da saklar ve
misafirken `/feed` isteklerine ekler.

## 9. Uç durumlar

| Durum | Davranış |
|-------|----------|
| Kullanıcı her şeyi gördü | `phase='seen'` ikinci tur; yine az-görülen-önce |
| Misafir kullanıcı | Kişisel takip yok; global sayaç + istemci tohumu |
| Satıcının kendi mezatı | Görüntülenme **sayılmaz**, ama "görüldü" işaretlenir |
| Bildirim isteği başarısız | Sessizce yutulur; en kötü ihtimalle bazı kartlar tekrar gösterilir |
| Hiç aktif mezat yok | Mevcut `EmptyState` |
| Aynı ID birden çok kez bildirilir | `$addToSet` + `$inc` bir kez (istemci tekilleştirir) |

## 10. Doğrulama

Depoda test altyapısı yok; doğrulama komut ve gözlemle yapılır:
- Değişen tüm dosyalarda `node --check`.
- Sunucu açılış dumanı testi (Mongo bağlantısı + dinleme).
- `curl` ile: tokensiz `/feed` 200 döner; tokenlı `/feed` farklı sıra döndürür; `/impressions`
  sonrası ilgili mezatların `impressionCount` değeri artar; ikinci `/feed` çağrısında o mezatlar
  **gelmez** (görüldü hariç tutma).
- `AuctionSeen` üzerinde TTL indeksinin oluştuğu `db.collection.getIndexes()` ile teyit edilir.
- Frontend: değişen dosyalarda babel dönüşümü + tam paket (bundle) derlemesi.

## 11. Kapsam dışı (YAGNI)

- Kategori / favori satıcı / geçmiş ilgiye göre kişiselleştirme
- Satıcı başına kota veya çeşitlilik kuralı
- Tıklama (CTR) takibi, mezat detay görüntülenme sayacı
- Yönetici paneli için teşhir istatistikleri ekranı
