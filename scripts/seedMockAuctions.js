// backend/scripts/seedMockAuctions.js
// 100 mezatlık gerçekçi tespih seed'i (görsel olarak doğrulanmış tespih fotoğrafları,
// scripts/seed-assets/tespih-images.json içinden okunur).
//
// Çalıştır:
//   node scripts/seedMockAuctions.js            → mevcutların üstüne 100 mezat ekler
//   node scripts/seedMockAuctions.js --reset    → önce mock satıcıların mezatlarını siler, sonra 100 ekler
//   node scripts/seedMockAuctions.js --dry      → DB'ye dokunmadan üretilen veriyi denetler ve özet basar
require('dotenv').config();
const mongoose = require('mongoose');
const Auction = require('../models/Auction');
const User = require('../models/User');
const calculateEndsAt = require('../utils/calculateEndsAt');
const { images: IMAGES } = require('./seed-assets/tespih-images.json');

// ---------------------------------------------------------------------------
// Mock satıcılar (yoksa oluşturulur) — mevcut script ile birebir aynı find-or-create mantığı.
// ---------------------------------------------------------------------------
const SELLERS = [
  { email: 'kehribar.koleksiyon@imame.mock', name: 'Kehribar Koleksiyon', companyName: 'Kehribar Koleksiyon', city: 'İstanbul' },
  { email: 'oltu.sanat@imame.mock', name: 'Erzurum Oltu Sanat', companyName: 'Erzurum Oltu Sanat', city: 'Erzurum' },
  { email: 'usta.atolye@imame.mock', name: 'Usta Tesbih Atölyesi', companyName: 'Usta Tesbih Atölyesi', city: 'Bursa' },
  { email: 'anadolu.elsanatlari@imame.mock', name: 'Anadolu El Sanatları', companyName: 'Anadolu El Sanatları', city: 'Konya' },
];

async function ensureSellers() {
  const ids = [];
  for (const s of SELLERS) {
    let u = await User.findOne({ email: s.email });
    if (!u) {
      u = await User.create({
        name: s.name,
        email: s.email,
        role: 'seller',
        companyName: s.companyName,
        authorizedName: s.name,
        iban: 'TR000000000000000000000000',
        ibanName: s.name,
        bankName: 'Ziraat Bankası',
        phone: '05000000000',
        provider: 'email',
      });
      console.log(`👤 Satıcı oluşturuldu: ${s.companyName}`);
    }
    ids.push(u._id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Tespih türleri — her biri gerçekçi köken metni (3 varyant) + tür ile tutarlı fiyat bandı.
// {count} ve {mm} yer tutucuları üretim sırasında gerçek değerlerle değiştirilir.
// ---------------------------------------------------------------------------
const TYPES = [
  {
    name: 'Kehribar',
    priceMin: 1500,
    priceMax: 8000,
    origins: [
      'Baltık kıyılarından çıkarılan hakiki kehribarın {count} hanesi, uzun yıllar süren doğal fosilleşme sürecinin izlerini taşır. {mm}mm çapındaki boncuklar tek tek elden geçirilerek simetrisi bozulmadan dizilmiştir.',
      'Bu tespihin taşları, milyonlarca yıl önce reçineden oluşmuş hakiki kehribardan {count} hane halinde işlenmiştir. Işığa tutulduğunda içindeki doğal damarlar ve kehribara özgü sıcak ton netçe görülür.',
      'Kehribarın {mm}mm çapındaki {count} boncuğu, ustanın elinde teker teker yontulup cilalanarak bugünkü formuna kavuşmuştur. Her boncuk kendi doğal deseniyle diğerinden ayrılır, bu yüzden iki eş boncuk bulmak neredeyse imkânsızdır.',
    ],
  },
  {
    name: 'Oltu Taşı',
    priceMin: 400,
    priceMax: 2500,
    origins: [
      "Erzurum'un Oltu ilçesine has, yer altından çıkarılan siyah linyit taşından üretilen bu tespih {count} hane olarak elde tıraşlanmıştır. {mm}mm çapındaki boncuklar mat siyah rengini uzun yıllar korur.",
      'Oltu taşı, yalnızca Erzurum bölgesinde çıkarılan ve dünyada bir eşi bulunmayan doğal bir maddedir. Bu {count} haneli tespihte {mm}mm boncuklar geleneksel oyma teknikleriyle şekillendirilmiştir.',
      'Hakiki Oltu taşından {count} hane olarak işlenen bu tespih, hafifliği ve derin siyahlığıyla tanınır. Ustalar taşı su ile soğutarak yontar, aksi halde taş çatlayabilir; bu sabır isteyen bir zanaattır.',
    ],
  },
  {
    name: 'Kuka',
    priceMin: 350,
    priceMax: 1800,
    origins: [
      'Kuka, hindistan cevizi ağacının sert kabuklu kökünden elde edilen, zamanla koyulaşan nadir bir malzemedir. {count} haneli bu tespihte {mm}mm boncuklar doğal desenini korumuştur.',
      "Bu tespihin {count} boncuğu, yıllanmış kuka kökünden {mm}mm çapında tıraşlanmıştır. Kullanıldıkça elin teriyle rengi koyulaşır ve zamanla kendine has bir patina kazanır.",
      'Kuka ağacının nadir bulunan kök kısmından üretilen bu tespih, {count} hanesiyle koleksiyonerlerin tercihi arasındadır. {mm}mm boncuklar doğal desenlerini hiç kaybetmeden işlenmiştir.',
    ],
  },
  {
    name: 'Bağa',
    priceMin: 900,
    priceMax: 4000,
    origins: [
      'Bağa deseni, tarih boyunca tespihçilikte en çok aranan motiflerden biri olmuştur. Bu {count} haneli tespihte {mm}mm boncuklar klasik bağa çizgileriyle özenle seçilmiştir.',
      'Bu tespihin {count} boncuğu, bağaya özgü akışkan çizgileri taşıyan malzemeden {mm}mm çapında işlenmiştir. Koleksiyonluk parçalar arasında sayılır.',
      'Bağa desenli bu tespih {count} hane olarak üretilmiş, her boncuğun deseni elden geçirilerek uyumlu bir dizilim sağlanmıştır. {mm}mm çapı elde rahat bir kullanım sunar.',
    ],
  },
  {
    name: 'Sedef',
    priceMin: 500,
    priceMax: 2500,
    origins: [
      'Sedef kakma işçiliği, ince el emeği gerektiren zorlu bir sanattır. Bu {count} haneli tespihte {mm}mm boncuklar parlak beyaz tonuyla dikkat çeker.',
      'Bu tespihin {count} boncuğu, deniz kabuğundan elde edilen hakiki sedeften {mm}mm çapında hazırlanmıştır. Işığı yansıtan doğal parlaklığı her açıdan fark edilir.',
      'Sedef, yüzyıllardır süsleme sanatlarında kullanılan zarif bir malzemedir. {count} hane halinde dizilen {mm}mm boncuklar, ustanın titiz cilalama sürecinden geçmiştir.',
    ],
  },
  {
    name: 'Lületaşı',
    priceMin: 600,
    priceMax: 3000,
    origins: [
      "Eskişehir'e has lületaşı, tüy kadar hafif olmasıyla bilinir. Bu {count} haneli tespihte {mm}mm boncuklar elde oyularak şekillendirilmiştir.",
      "Bu tespihin {count} boncuğu, hakiki Eskişehir lületaşından {mm}mm çapında işlenmiştir. Zamanla elde tutuldukça krem tonu hafifçe koyulaşarak kendine has bir görünüm kazanır.",
      'Lületaşı, yumuşak dokusu sayesinde ince oymalara imkân tanıyan nadir bir taştır. {count} hane olarak hazırlanan bu tespihte {mm}mm boncuklar özenle cilalanmıştır.',
    ],
  },
  {
    name: 'Yusr',
    priceMin: 800,
    priceMax: 3500,
    origins: [
      'Yusr, Yemen ve çevresinde deniz mercanından elde edilen, mat dokusuyla bilinen özel bir malzemedir. Bu {count} haneli tespihte {mm}mm boncuklar doğal koyu tonunu korur.',
      'Bu tespihin {count} boncuğu, hakiki yusr taşından {mm}mm çapında tıraşlanmıştır. Yüzeyindeki doğal pürüzlü doku, malzemenin işlenmemiş halini yansıtır.',
      'Yusr tespihleri, sade ve vakur duruşuyla sevilen bir gelenektir. {count} hane halinde dizilen {mm}mm boncuklar, elde tutulduğunda hafif pürüzlü ve doğal bir his verir.',
    ],
  },
  {
    name: 'Necef',
    priceMin: 350,
    priceMax: 1800,
    origins: [
      'Necef taşı, kristal berraklığındaki görünümüyle ışığı adeta içine çeker. Bu {count} haneli tespihte {mm}mm boncuklar el yontması olarak hazırlanmıştır.',
      'Bu tespihin {count} boncuğu, doğal kuvars ailesinden necef taşından {mm}mm çapında işlenmiştir. Güneş ışığında boncukların içindeki ışıltı belirgin şekilde görülür.',
      'Necef, saflığı ve berraklığıyla tercih edilen bir taştır. {count} hane olarak dizilen {mm}mm boncuklar, geleneksel yöntemlerle kesilip cilalanmıştır.',
    ],
  },
  {
    name: 'Gül Ağacı',
    priceMin: 300,
    priceMax: 1200,
    origins: [
      "Isparta'nın gül bahçelerinden elde edilen gül ağacı, kesildiğinde bile hafif kokusunu uzun süre korur. Bu {count} haneli tespihte {mm}mm boncuklar doğal ahşap dokusuyla dikkat çeker.",
      'Bu tespihin {count} boncuğu, hakiki gül ağacından {mm}mm çapında tornalanmıştır. Elde ısındıkça hafif bir gül kokusu yayması, bu ağacın en sevilen özelliğidir.',
      'Gül ağacı tespihleri, doğallığı ve hafifliğiyle günlük kullanıma en uygun türlerden biridir. {count} hane olarak hazırlanan {mm}mm boncuklar özenle zımparalanmıştır.',
    ],
  },
  {
    name: 'Sandal Ağacı',
    priceMin: 350,
    priceMax: 1500,
    origins: [
      'Hindistan kökenli sandal ağacı, kokusunu yıllarca kaybetmemesiyle tanınır. Bu {count} haneli tespihte {mm}mm boncuklar koyu kahve tonuyla göz doldurur.',
      'Bu tespihin {count} boncuğu, hakiki sandal ağacından {mm}mm çapında tornalanmıştır. Avuç içinde ısındıkça karakteristik kokusu daha belirgin hale gelir.',
      'Sandal ağacı, tespihçilikte hem kokusu hem de dokusuyla tercih edilen değerli bir malzemedir. {count} hane olarak dizilen {mm}mm boncuklar özenle işlenmiştir.',
    ],
  },
  {
    name: 'Zeytin Ağacı',
    priceMin: 300,
    priceMax: 1000,
    origins: [
      "Ege'nin köklü zeytin ağaçlarından elde edilen bu tespih, {count} hane olarak doğal desenler taşıyan gövde parçalarından tornalanmıştır. {mm}mm boncuklarda ağacın yıllık halkaları net biçimde görülür.",
      'Bu tespihin {count} boncuğu, hakiki zeytin ağacından {mm}mm çapında işlenmiştir. Ağacın kendine has damarlı deseni her boncukta farklı bir görünüm oluşturur.',
      'Zeytin ağacı, sağlamlığı ve doğal desenleriyle günlük kullanıma uygun bir tespih malzemesidir. {count} hane olarak hazırlanan {mm}mm boncuklar zeytinyağıyla beslenerek cilalanmıştır.',
    ],
  },
  {
    name: 'Öd Ağacı',
    priceMin: 1200,
    priceMax: 6000,
    origins: [
      'Öd ağacı, Güneydoğu Asya ormanlarında doğal olarak reçineleşen nadir bir ağaçtan elde edilir. Bu {count} haneli tespihte {mm}mm boncuklar hafif dokunuşta bile kendine özgü kokusunu hissettirir.',
      'Bu tespihin {count} boncuğu, hakiki öd ağacından {mm}mm çapında tornalanmıştır. Malzemenin nadirliği nedeniyle koleksiyonerler arasında özellikle aranan bir türdür.',
      'Öd ağacı tespihleri, hem kokusu hem de koyu damarlı deseniyle ayrıcalıklı bir yere sahiptir. {count} hane olarak dizilen {mm}mm boncuklar özenle seçilip işlenmiştir.',
    ],
  },
  {
    name: 'Abanoz',
    priceMin: 400,
    priceMax: 1600,
    origins: [
      'Abanoz, yoğun ve simsiyah dokusuyla tespihçilikte asırlardır tercih edilen bir ağaçtır. Bu {count} haneli tespihte {mm}mm boncuklar yüksek parlaklıkta cilalanmıştır.',
      'Bu tespihin {count} boncuğu, hakiki abanoz ağacından {mm}mm çapında tornalanmıştır. Ağır ve yoğun dokusu, elde tutulduğunda hemen hissedilir.',
      'Abanoz ağacı, sertliği sayesinde yıllarca çatlamadan kullanılabilen dayanıklı bir malzemedir. {count} hane olarak hazırlanan {mm}mm boncuklar derin siyah rengiyle dikkat çeker.',
    ],
  },
  {
    name: 'Pelesenk',
    priceMin: 800,
    priceMax: 4000,
    origins: [
      'Pelesenk, Amboyna ağacının kök urlarından elde edilen, deseni asla tekrarlanmayan nadir bir malzemedir. Bu {count} haneli tespihte {mm}mm boncuklar kendine özgü ur desenleri taşır.',
      'Bu tespihin {count} boncuğu, hakiki pelesenk kökünden {mm}mm çapında tornalanmıştır. Her boncuktaki desen farklıdır, bu yüzden iki tespih birbirinin aynısı olmaz.',
      'Pelesenk ağacı, kızıl kahve tonları ve yoğun ur deseniyle koleksiyonerlerin gözdesidir. {count} hane olarak dizilen {mm}mm boncuklar özenle seçilip cilalanmıştır.',
    ],
  },
];

// İşçilik paragrafı için ortak cümle havuzu — {kamci} yer tutucusu kamçı etiketiyle değiştirilir.
const CRAFT = [
  'Boncuklar diziye geçirilmeden önce tek tek elden geçirilerek çap ve renk uyumu kontrol edilir, simetriden ödün verilmez.',
  'İmamesi, tepelik ve boncuklarla aynı malzemeden özenle tornalanarak bütünlük sağlanmıştır.',
  'Kamçı kısmı {kamci} olarak hazırlanmış, ustanın imzası niteliğindeki ince işçiliği taşır.',
  'Dizim sırasında kullanılan iplik, yıllarca yıpranmadan dayanacak şekilde özenle seçilmiştir.',
  'Tepelik bölümü, boncukların düzenini korurken tespihin genel duruşuna zarafet katar.',
  'Her boncuğun deliği elle açılmış, keskin kenarlar bırakılmadan zımparalanmıştır.',
  'İmame ve kamçı arasındaki oran, tespihin elde dururken dengeli hissettirmesi için titizlikle hesaplanmıştır.',
  'Ustalar bu tespihi geleneksel yöntemlerle, herhangi bir seri üretim aparatı kullanmadan tek tek işlemiştir.',
  'Kamçının {kamci} detayı, tespihe hem görsel hem dokunsal bir zenginlik katar.',
  'Boncukların cilalanması aşamasında doğal parlatıcılar kullanılmış, malzemenin özgün dokusu korunmuştur.',
  'İmamenin üst kısmına işlenen ince oyma detay, ustanın el işçiliğinin en görünür kanıtıdır.',
  'Tespihin genel dizilimi, hem estetik hem de günlük kullanımda rahatlık sağlayacak şekilde planlanmıştır.',
];

// Kullanım hissi / elde durma paragrafı için ortak cümle havuzu.
const FEEL = [
  'Elde çekildiğinde boncukların birbirine değme sesi, kullanan kişiye sakinleştirici bir ritim sunar.',
  'Zaman içinde elin doğal yağıyla temas eden boncuklar, kendine has bir patina kazanarak daha da değerlenir.',
  'Ağırlığı avuç içinde dengeli bir his verir, ne fazla hafif ne de yorucu derecede ağırdır.',
  'Günlük kullanımda cepte veya elde taşınmaya uygun, pratik bir boyuttadır.',
  'Sevilen birine hediye edilecek bir tespih arayanlar için hem şıklığı hem de anlamı bakımından öne çıkan bir seçimdir.',
  'Yıllar geçtikçe boncukların yüzeyinde oluşan ince çizikler, tespihin kendi hikâyesini yazmasına vesile olur.',
  'Boncukların birbirine kayışı yumuşak ve akıcıdır, çekilirken herhangi bir sertlik hissedilmez.',
  'Bu tespih, hem koleksiyon amaçlı saklanmaya hem de günlük olarak kullanılmaya uygun bir denge sunar.',
  'Kutusundan çıkarıldığı ilk andan itibaren, malzemenin doğallığı ve işçiliğin inceliği hemen fark edilir.',
  'Elde tutulduğunda ferahlatıcı bir doku hissettirir, uzun süreli kullanımda dahi rahatsızlık vermez.',
  'Vitrinde sergilense de elde çekilse de, bu tespih bulunduğu her ortamda dikkat çeken bir parça olur.',
  'Tespihi elinde tutan kişi, ustanın yıllara dayanan tecrübesini her boncukta hissedebilir.',
];

const BEAD_COUNTS = [19, 33, 41, 45, 66, 99, 101];
const DIAMETERS = [8, 9, 10, 11, 12, 13, 14, 15, 16];
const KAMCI = ['Gümüş Kamçılı', 'Püsküllü', 'Sade Kamçılı', 'Oyma Kamçılı', 'İmameli'];

const AUCTION_COUNT = 100;
const SIGNED_COUNT = 35; // ~%35
const SEED = 20260725; // sabit tohum — çalıştırma başına aynı sonucu üretir

// ---------------------------------------------------------------------------
// mulberry32 — sade, deterministik PRNG (I/O yok, saf fonksiyon)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickN(pool, n, rng) {
  const arr = pool.slice();
  const out = [];
  for (let i = 0; i < n && arr.length; i++) {
    const idx = Math.floor(rng() * arr.length);
    out.push(arr[idx]);
    arr.splice(idx, 1);
  }
  return out;
}

// Karma-radix çözümleme: 0..(BEAD_COUNTS*DIAMETERS*KAMCI - 1) aralığındaki benzersiz bir
// tamsayıyı, VERİLEN bir tür için benzersiz bir (hane, çap, kamçı) kombinasyonuna çevirir.
function comboWithinType(type, index) {
  let i = index;
  const kamci = KAMCI[i % KAMCI.length];
  i = Math.floor(i / KAMCI.length);
  const mm = DIAMETERS[i % DIAMETERS.length];
  i = Math.floor(i / DIAMETERS.length);
  const count = BEAD_COUNTS[i % BEAD_COUNTS.length];
  return { type, count, mm, kamci };
}

function buildDescription(combo, rng) {
  const originTpl = combo.type.origins[Math.floor(rng() * combo.type.origins.length)];
  const origin = originTpl.replace('{count}', combo.count).replace(/\{mm\}/g, combo.mm);

  const kamciLower = combo.kamci.toLocaleLowerCase('tr-TR');
  const craftN = rng() < 0.5 ? 1 : 2;
  const craft = pickN(CRAFT, craftN, rng)
    .map((s) => s.replace('{kamci}', kamciLower))
    .join(' ');

  const feelN = rng() < 0.5 ? 1 : 2;
  const feel = pickN(FEEL, feelN, rng).join(' ');

  const paragraphs = rng() < 0.5 ? [origin, craft, feel] : [origin, `${craft} ${feel}`];
  let desc = paragraphs.join('\n\n');

  // Güvenlik ağı: nadir kısa kombinasyonlarda 400 karakter eşiğinin altına düşmeyi önler.
  let guard = 0;
  while (desc.length < 420 && guard < 8) {
    desc += ' ' + FEEL[Math.floor(rng() * FEEL.length)];
    guard++;
  }
  return desc;
}

function buildTitle(combo) {
  return `${combo.count} Hane ${combo.type.name} Tespih ${combo.mm}mm ${combo.kamci}`;
}

function buildPrice(combo, rng) {
  // Tür bandı içinde tam uniform dağılım (0..1), hane/çap sadece hafif bir eğilim katar
  // — böylece her tür kendi bandının uçlarına da ulaşabilir.
  const countWeight = (combo.count - BEAD_COUNTS[0]) / (BEAD_COUNTS[BEAD_COUNTS.length - 1] - BEAD_COUNTS[0]);
  const mmWeight = (combo.mm - DIAMETERS[0]) / (DIAMETERS[DIAMETERS.length - 1] - DIAMETERS[0]);
  const tilt = 0.08 * (countWeight - 0.5) + 0.08 * (mmWeight - 0.5);
  const fraction = Math.min(1, Math.max(0, rng() + tilt));
  const raw = combo.type.priceMin + fraction * (combo.type.priceMax - combo.type.priceMin);
  const rounded = Math.round(raw / 10) * 10;
  return Math.min(8000, Math.max(300, rounded));
}

/**
 * buildAuctions(sellerIds) — saf üretim fonksiyonu, I/O yapmaz.
 * sellerIds: 4 satıcı id'si (ObjectId ya da dry-run için düz string olabilir)
 * dönüş: 100 mezat objesi
 */
function buildAuctions(sellerIds) {
  const rng = mulberry32(SEED);

  // Katmanlı (stratified) örnekleme: her tür ~100/14 mezatla temsil edilir, böylece
  // her türün kendi fiyat bandı içinde uçlara kadar (300₺'den 8.000₺'ye) yayılım sağlanır
  // ve "en az 12 tespih türü" gereksinimi her çalıştırmada garanti edilir.
  const perTypeCombos = BEAD_COUNTS.length * DIAMETERS.length * KAMCI.length; // 7*9*5=315
  const baseCount = Math.floor(AUCTION_COUNT / TYPES.length); // 7
  let remainder = AUCTION_COUNT - baseCount * TYPES.length; // 2

  const combos = [];
  TYPES.forEach((type) => {
    const n = baseCount + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;

    // Bu tür için 0..314 aralığından n benzersiz kombinasyon indeksi seç.
    const order = Array.from({ length: perTypeCombos }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.slice(0, n).forEach((idx) => combos.push(comboWithinType(type, idx)));
  });

  // Mezat sırasını türlere göre gruplanmış halden karıştır (feed'de art arda aynı tür gelmesin).
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [combos[i], combos[j]] = [combos[j], combos[i]];
  }

  // isSigned dağılımı: 100 pozisyondan SIGNED_COUNT tanesi true olacak şekilde karıştır.
  const signedFlags = Array.from({ length: AUCTION_COUNT }, (_, i) => i < SIGNED_COUNT);
  for (let i = signedFlags.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [signedFlags[i], signedFlags[j]] = [signedFlags[j], signedFlags[i]];
  }

  const endsAt = calculateEndsAt();

  return combos.map((combo, i) => {
    const title = buildTitle(combo);
    const description = buildDescription(combo, rng);
    const startingPrice = buildPrice(combo, rng);
    const imgCount = rng() < 0.6 ? 1 : 2;
    const images = pickN(IMAGES, imgCount, rng);
    const seller = sellerIds[i % sellerIds.length];

    return {
      title,
      description,
      startingPrice,
      currentPrice: startingPrice,
      isSigned: signedFlags[i],
      images,
      seller,
      endsAt,
      isEnded: false,
      impressionCount: 0,
      bidCount: 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Kuru çalıştırma özeti — DB'ye dokunmadan üretilen veriyi denetler.
// ---------------------------------------------------------------------------
function printSummary(auctions) {
  const titles = auctions.map((a) => a.title);
  const uniqueTitles = new Set(titles).size;
  const descLens = auctions.map((a) => a.description.length);
  const minDesc = Math.min(...descLens);
  const maxDesc = Math.max(...descLens);
  const prices = auctions.map((a) => a.startingPrice);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const signedCount = auctions.filter((a) => a.isSigned).length;
  const usedTypes = new Set(auctions.map((a) => a.title.split(' Hane ')[1].split(' Tespih')[0])).size;
  const usedImages = new Set(auctions.flatMap((a) => a.images)).size;

  console.log(`${auctions.length} mezat üretildi.`);
  console.log(`benzersiz başlık: ${uniqueTitles}`);
  console.log(`kullanılan tespih türü sayısı: ${usedTypes}`);
  console.log(`en kısa açıklama: ${minDesc} (>=400 olmalı)`);
  console.log(`en uzun açıklama: ${maxDesc} (<=900 hedef)`);
  console.log(`fiyat aralığı: ${minPrice}₺ - ${maxPrice}₺`);
  console.log(`isSigned: ${signedCount} / ${auctions.length} (%${Math.round((signedCount / auctions.length) * 100)})`);
  console.log(`görsel havuzu: ${IMAGES.length} (>=12 olmalı) | mezatlarda kullanılan benzersiz görsel: ${usedImages}`);
}

// ---------------------------------------------------------------------------
// Ana akış
// ---------------------------------------------------------------------------
async function run() {
  const dry = process.argv.includes('--dry');
  const reset = process.argv.includes('--reset');

  if (dry) {
    const dummySellerIds = ['dry-seller-0', 'dry-seller-1', 'dry-seller-2', 'dry-seller-3'];
    const auctions = buildAuctions(dummySellerIds);
    printSummary(auctions);
    return;
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('🔌 MongoDB bağlandı');

  const sellerIds = await ensureSellers();
  const endsAt = calculateEndsAt();
  console.log(`🕒 Bitiş: ${endsAt.toISOString()} (TR 22:00)`);

  if (reset) {
    const del = await Auction.deleteMany({ seller: { $in: sellerIds } });
    console.log(`🗑️  ${del.deletedCount} eski mock mezat silindi.`);
  } else {
    console.log('ℹ️  --reset verilmedi, mevcut mezatların üstüne ekleniyor.');
  }

  const docs = buildAuctions(sellerIds);
  const inserted = await Auction.insertMany(docs);
  console.log(`✅ ${inserted.length} mock mezat eklendi.`);

  await mongoose.disconnect();
  console.log('👋 Bağlantı kapatıldı.');
  process.exit(0);
}

if (require.main === module) {
  run().catch((err) => {
    console.error('❌ Seed hatası:', err.message);
    process.exit(1);
  });
}

module.exports = { buildAuctions, TYPES, BEAD_COUNTS, DIAMETERS, KAMCI };
