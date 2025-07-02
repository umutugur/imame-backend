// backend/models/Auction.js

const mongoose = require('mongoose');

const auctionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  startingPrice: { type: Number, required: true },
  currentPrice: { type: Number, default: 0 },
  isSigned: { type: Boolean, default: false },         // ✅ Usta imzalı mı
  images: [String],                                    // ✅ Görseller
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },

  // 🆕 Yeni eklenen alanlar:
  endsAt: { type: Date, required: true },              // 🕒 Her gün 22.00'de otomatik biter
  isEnded: { type: Boolean, default: false },          // ✅ Cronjob işaretlemesi
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paymentDeadline: { type: Date },
  receiptUploaded: { type: Boolean, default: false },
  isBannedProcessed: { type: Boolean, default: false }, // ✔️ 48 saat geçti, ban kontrolü yapıldı mı
  
  //Dekont Görseli ve bilgisi
  receiptUrl: { type: String },
receiptStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
});

module.exports = mongoose.model('Auction', auctionSchema);
