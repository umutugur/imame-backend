// utils/feedRanking.js
// Saf sıralama mantığı (I/O yok, test edilebilir).
// Öncelik: 1) görülme kovası artan  2) teklif/gösterim oranı azalan  3) sabit rastgelelik
const BUCKET_SIZE = 10;

// FNV-1a 32-bit → 0..1 arası deterministik değer
function hash01(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0xffffffff;
}

/**
 * rankAuctions(candidates, seed)
 * candidates: [{ _id, impressionCount, bidCount }]
 * seed: kullanıcı kimliği (girişli) veya istemci tohumu (misafir)
 * dönüş: sıralanmış [{ id, bucket, merit, jitter }]
 */
function rankAuctions(candidates, seed) {
  return candidates
    .map((a) => {
      const impressions = a.impressionCount || 0;
      const bids = a.bidCount || 0;
      return {
        id: a._id,
        bucket: Math.floor(impressions / BUCKET_SIZE),
        merit: bids / Math.max(impressions, 1),
        jitter: hash01(`${a._id}:${seed}`),
      };
    })
    .sort((x, y) => x.bucket - y.bucket || y.merit - x.merit || x.jitter - y.jitter);
}

module.exports = { rankAuctions, hash01, BUCKET_SIZE };
