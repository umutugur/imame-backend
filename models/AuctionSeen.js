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
