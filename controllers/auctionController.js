// controllers/auctionController.js

const Auction = require('../models/Auction');
const User = require('../models/User');
const { sendExpoPushNotification } = require('../utils/expoPush');


exports.deleteAuctionWithReason = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { reason } = req.body;

    // Mezatı bul
    const auction = await Auction.findById(auctionId).populate('seller');
    if (!auction) return res.status(404).json({ message: 'Mezat bulunamadı.' });

    // Satıcıya bildirim at
    // controllers/auctionController.js
if (auction.seller?.notificationToken) {
  await sendExpoPushNotification(
    auction.seller.notificationToken,
    'Mezatınız kaldırıldı',
    `Bir mezatınız silindi. Sebep: ${reason}`,
    { type: 'auction_deleted', auctionId, reason },user._id
  );
}
    // Mezatı sil
    await Auction.deleteOne({ _id: auctionId });

    return res.json({ message: 'Mezat silindi ve satıcıya bildirildi.' });
  } catch (err) {
    console.error('Mezat silme hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
};
