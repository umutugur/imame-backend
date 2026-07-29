// scripts/reactivateMockAuctions.js — elle çalıştırma:
//   node scripts/reactivateMockAuctions.js
//
// Normalde bu iş /cron/reactivate-mock-auctions ucuyla otomatik yapılır; bu script
// cron çalışmadığında veya elle tazelemek gerektiğinde kullanılır.
// Ayrıntı ve silme notu için utils/reactivateMockAuctions.js başlığına bakın.
require('dotenv').config();
const mongoose = require('mongoose');
const reactivateMockAuctions = require('../utils/reactivateMockAuctions');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const r = await reactivateMockAuctions();
  if (r.skipped) {
    console.log('⏭️  Atlandı:', r.reason);
  } else {
    console.log(`✅ ${r.reactivated} mezat yeniden yayında`);
    console.log(`   silinen eski teklif: ${r.clearedBids}`);
    console.log(
      `   yeni bitiş: ${r.endsAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`
    );
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error('❌ Hata:', e.message);
  process.exit(1);
});
