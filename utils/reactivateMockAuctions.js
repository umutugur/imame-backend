// utils/reactivateMockAuctions.js
//
// GEÇİCİ — App Store / Play incelemesi süresince demo içeriği ayakta tutmak için.
// İnceleme onaylandıktan sonra bu dosya, /cron/reactivate-mock-auctions ucu ve
// scripts/reactivateMockAuctions.js silinebilir.
//
// Uygulamanın modeli günlük: tüm mezatlar her gece 22:00'de biter. Satıcılar yeni
// mezat açmadığı gün uygulama tamamen boş görünüyor — inceleme görevlisi böyle bir
// ekran görürse "yetersiz içerik" gerekçesiyle reddedilme riski var. Bu iş, seed
// edilmiş demo mezatları her gece yeniden yayına alır.
//
// GÜVENLİK: yalnızca e-postası @imame.mock ile biten sahte satıcıların mezatlarına
// dokunur. Gerçek satıcıların kayıtları hiçbir koşulda değişmez.
const Auction = require('../models/Auction');
const User = require('../models/User');
const Bid = require('../models/Bid');
const calculateEndsAt = require('./calculateEndsAt');

async function reactivateMockAuctions() {
  const endsAt = calculateEndsAt();

  // 22:00'den ÖNCE çalışırsa calculateEndsAt bugünü döndürür ve /cron/end-auctions
  // mezatları anında tekrar kapatır. Böyle bir durumda hiçbir şey yapmadan çıkıyoruz.
  if (endsAt.getTime() - Date.now() < 60 * 60 * 1000) {
    return {
      ok: false,
      skipped: true,
      reason: 'Bitişe 1 saatten az var; 22:00 sonrası çalıştırın.',
      endsAt,
    };
  }

  const mockSellerIds = (
    await User.find({ email: /@imame\.mock$/ }).select('_id').lean()
  ).map((s) => s._id);

  if (!mockSellerIds.length) {
    return { ok: false, skipped: true, reason: 'Sahte satıcı bulunamadı.' };
  }

  const auctions = await Auction.find({ seller: { $in: mockSellerIds } })
    .select('_id startingPrice')
    .lean();

  const auctionIds = auctions.map((a) => a._id);
  const { deletedCount } = await Bid.deleteMany({ auction: { $in: auctionIds } });

  let reactivated = 0;
  for (const a of auctions) {
    await Auction.updateOne(
      { _id: a._id },
      {
        $set: {
          isEnded: false,
          endsAt,
          currentPrice: a.startingPrice,
          bidCount: 0,
          impressionCount: 0,
          winner: null,
          receiptUploaded: false,
          receiptUrl: null,
          receiptStatus: null,
          paymentDeadline: null,
          isBannedProcessed: false,
        },
      }
    );
    reactivated++;
  }

  return { ok: true, reactivated, clearedBids: deletedCount, endsAt };
}

module.exports = reactivateMockAuctions;
