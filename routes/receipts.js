// routes/receipts.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { storage } = require('../config/cloudinary');
const upload = multer({ storage });
const Auction = require('../models/Auction');
const User = require('../models/User');
const { sendExpoPushNotification } = require('../utils/expoPush'); // FCM yerine Expo

// 🔹 Satıcının kendi bitmiş mezatlarının dekontlarını listele
router.get('/mine/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;

    const auctions = await Auction.find({
      seller: sellerId,
      isEnded: true,
      receiptUploaded: true,
    })
      .populate('winner', 'name email')
      .sort({ endsAt: -1 })
      .select('title receiptUrl receiptStatus winner endsAt');

    res.status(200).json(auctions);
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

// 🔹 Dekont URL'sini yükle / kaydet + 🔔 Bildirim gönder
router.put('/upload/:auctionId', async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { receiptUrl } = req.body;

    if (!receiptUrl) {
      return res.status(400).json({ message: 'Dekont URL gereklidir.' });
    }

    const auction = await Auction.findByIdAndUpdate(
      auctionId,
      {
        receiptUrl,
        receiptUploaded: true,
        receiptStatus: 'pending',
      },
      { new: true }
    );

    if (!auction) return res.status(404).json({ message: 'Mezat bulunamadı' });

    // 🔔 Satıcıya push bildirimi gönder
    const seller = await User.findById(auction.seller);
    if (seller?.notificationToken) {
      await sendExpoPushNotification(
        seller.notificationToken,
        'Yeni Dekont Yüklendi',
        'Kazanan alıcı tarafından bir mezat için dekont yüklendi. Lütfen kontrol edin.',
        { type: 'receipt_uploaded', auctionId },
        seller._id
      );
    }

    res.status(200).json({ message: 'Dekont yüklendi', auction });
  } catch (err) {
    console.error('Dekont yükleme hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

// 🔹 Dekontu onayla + 🔔 Alıcıya bildirim gönder
router.patch('/:auctionId/approve', async (req, res) => {
  try {
    const { auctionId } = req.params;

    const auction = await Auction.findByIdAndUpdate(
      auctionId,
      { receiptStatus: 'approved' },
      { new: true }
    ).populate('winner');

    if (!auction) return res.status(404).json({ message: 'Mezat bulunamadı' });

    // 🔔 Kazanan alıcıya bildirim gönder
    const winner = auction.winner;
    if (winner?.notificationToken) {
      await sendExpoPushNotification(
        winner.notificationToken,
        'Dekont Onaylandı',
        'Satıcı, yüklediğiniz dekontu onayladı. Siparişiniz hazırlanıyor.',
        { type: 'receipt_approved', auctionId },
        winner._id
      );
    }

    res.status(200).json({ message: 'Dekont onaylandı', auction });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

// 🔹 Dekontu reddet + 🔔 Alıcıya bildirim gönder
router.patch('/:auctionId/reject', async (req, res) => {
  try {
    const { auctionId } = req.params;

    const auction = await Auction.findByIdAndUpdate(
      auctionId,
      {
        $set: {
          receiptStatus: 'rejected',
          receiptUploaded: false,
          receiptUrl: '',
        },
      },
      { new: true }
    ).populate('winner');

    if (!auction) return res.status(404).json({ message: 'Mezat bulunamadı' });

    // 🔔 Kazanan alıcıya bildirim gönder
    const winner = auction.winner;
    if (winner?.notificationToken) {
      await sendExpoPushNotification(
        winner.notificationToken,
        'Dekont Reddedildi',
        'Satıcı, yüklediğiniz dekontu reddetti. Lütfen tekrar yükleyin.',
        { type: 'receipt_rejected', auctionId },
        winner._id
      );
    }

    res.status(200).json({ message: 'Dekont reddedildi', auction });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

module.exports = router;
