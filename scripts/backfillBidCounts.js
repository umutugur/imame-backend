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
