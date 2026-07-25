// utils/auctionDayKey.js
// Mezat döngüsü gün anahtarı. Gün sınırı gece yarısı DEĞİL, TR 22:00'dir;
// calculateEndsAt() zaten geçerli döngünün bitişini verir, onu tarihe çeviririz.
const calculateEndsAt = require('./calculateEndsAt');

function auctionDayKey() {
  return calculateEndsAt().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

module.exports = auctionDayKey;
