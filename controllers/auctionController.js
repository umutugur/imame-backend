// controllers/auctionController.js

const Auction = require('../models/Auction');
const User = require('../models/User');
const { sendPushNotification } = require('../routes/sendPushNotification');

exports.deleteAuctionWithReason = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { reason } = req.body;

    // Mezatı bul
    const auction = await Auction.findById(auctionId).populate('seller');
    if (!auction) return res.status(404).json({ message: 'Mezat bulunamadı.' });

    // Satıcıya bildirim at
    if (auction.seller?.notificationToken) {
      await sendPushNotification({
        to: auction.seller.notificationToken,
        title: 'Mezatınız kaldırıldı',
        body: `Bir mezatınız silindi. Sebep: ${reason}`,
        data: { type: 'auction_deleted', auctionId, reason }
      });
    }

    // Mezatı sil
    await Auction.deleteOne({ _id: auctionId });

    return res.json({ message: 'Mezat silindi ve satıcıya bildirildi.' });
  } catch (err) {
    console.error('Mezat silme hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
};
