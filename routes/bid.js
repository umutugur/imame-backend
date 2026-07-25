const express = require('express');
const router = express.Router();
const Bid = require('../models/Bid');
const Auction = require('../models/Auction');
const User = require('../models/User');
const { requireAuth } = require('../middlewares/auth');
const { sendExpoPushNotification } = require('../utils/expoPush');

// Minimum teklif artış kademeleri
function getMinIncrement(currentPrice) {
  if (currentPrice < 500) return 25;
  if (currentPrice < 2000) return 50;
  if (currentPrice < 5000) return 100;
  return 250;
}

// Teklif verme - atomik, tutarlı ve yarışmaları engelleyen versiyon
router.post('/', requireAuth(), async (req, res) => {
  try {
    const { auctionId, amount } = req.body;
    const userId = req.user.id;
    console.log('TEKLİF BODY:', req.body, 'userId:', userId);

    // Mezatı ve son fiyatı çek
    const auction = await Auction.findById(auctionId);
    if (!auction) return res.status(404).json({ message: 'Mezat bulunamadı' });

    if (auction.isEnded || (auction.endsAt && new Date(auction.endsAt) <= new Date())) {
      return res.status(400).json({ message: 'Bu mezat sona erdi' });
    }

    const minIncrement = getMinIncrement(auction.currentPrice);
    const minNextBid = auction.currentPrice + minIncrement;

    if (amount < minNextBid) {
      return res.status(400).json({
        message: `Teklif en az ${minNextBid}₺ olmalı`,
        minNextBid,
      });
    }

    const lastBid = await Bid.findOne({ auction: auctionId }).sort({ createdAt: -1 });
    if (lastBid && lastBid.user.toString() === userId) {
      return res.status(400).json({ message: 'Son teklifi zaten siz verdiniz.' });
    }

    // Atomic update: Sadece currentPrice daha küçükse güncelle ve yeni currentPrice'ı al
    const updatedAuction = await Auction.findOneAndUpdate(
      { _id: auctionId, currentPrice: { $lt: amount } },
      { $set: { currentPrice: amount }, $inc: { bidCount: 1 } },
      { new: true }
    );

    if (!updatedAuction) {
      return res.status(400).json({
        message: 'Teklif mevcut fiyattan yüksek olmalı veya başka biri daha önce teklif verdi.'
      });
    }

    // Yeni teklifi kesinlikle updatedAuction.currentPrice ile kaydet
    const newBid = new Bid({ auction: auctionId, user: userId, amount: updatedAuction.currentPrice });
    await newBid.save();

    console.log(`Yeni teklif verildi: ${updatedAuction.currentPrice} TL, auctionId: ${auctionId}, userId: ${userId}`);

    // Bir önceki en yüksek teklifi verene (farklı bir kullanıcıysa) push bildirim gönder.
    // Bildirim gönderimi teklifin başarısını asla etkilememeli.
    (async () => {
      try {
        if (lastBid && lastBid.user.toString() !== userId) {
          const previousUser = await User.findById(lastBid.user).select('notificationToken');
          if (previousUser && previousUser.notificationToken) {
            await sendExpoPushNotification(
              previousUser.notificationToken,
              'Teklifiniz geçildi!',
              `${auction.title} mezatında teklifiniz geçildi. Yeni fiyat: ${updatedAuction.currentPrice}₺`,
              { type: 'auction', auctionId: auctionId },
              lastBid.user.toString()
            );
          }
        }
      } catch (pushErr) {
        console.error('Outbid push bildirimi gönderilemedi:', pushErr);
      }
    })();

    const nextMinIncrement = getMinIncrement(updatedAuction.currentPrice);
    res.status(201).json({
      message: 'Teklif başarıyla verildi',
      bid: newBid,
      minNextBid: updatedAuction.currentPrice + nextMinIncrement,
    });
  } catch (err) {
    console.error('Teklif verme hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

// Teklif listesini getir (detay ekranı için) - misafirler de görebilir
router.get('/:auctionId', async (req, res) => {
  try {
    const { auctionId } = req.params;
    const bids = await Bid.find({ auction: auctionId })
      .populate('user', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json(bids);
  } catch (err) {
    console.error('Teklif listesi alınamadı:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

// Kullanıcının tüm tekliflerini, her mezat için sadece son teklifi getir
// routes/bid.js
router.get('/user/:userId', requireAuth(), async (req, res) => {
  try {
    const userId = req.params.userId;

    if (userId !== req.user.id) {
      return res.status(403).json({ message: 'Yetersiz yetki' });
    }

    // Kullanıcının verdiği tüm teklifleri, mezat ve user ile birlikte çek
    const userBids = await Bid.find({ user: userId })
      .populate({
        path: 'auction',
        select: 'title winner isEnded images currentPrice isSigned',
      })
      .lean();

    // Auction'u populate edemeyen (silinmiş olan) kayıtları filtrele
    const populatedBids = userBids.filter(b => b.auction != null);

    // Sadece bitmemiş (aktif) mezatlar
    const activeBids = populatedBids.filter(b => !b.auction.isEnded);

    // Her mezat için kullanıcının en son teklifini bul
    const myLatestByAuction = new Map();
    for (const bid of activeBids) {
      const aid = bid.auction._id.toString();
      if (
        !myLatestByAuction.has(aid) ||
        new Date(bid.createdAt) > new Date(myLatestByAuction.get(aid).createdAt)
      ) {
        myLatestByAuction.set(aid, bid);
      }
    }

    // Her mezat için son (herkesin) teklifi bul ve status ekle
    const results = [];
    for (const [auctionId, myBid] of myLatestByAuction.entries()) {
      const lastBid = await Bid.findOne({ auction: auctionId })
        .sort({ createdAt: -1 })
        .lean();
      if (!lastBid) continue;

      results.push({
        ...myBid,
        auctionCurrentPrice: lastBid.amount,
        statusText:
          lastBid.user.toString() === userId
            ? 'Teklif Verildi'
            : 'Sizden sonra teklif verildi',
      });
    }

    res.json(results);
  } catch (err) {
    console.error('❌ /user/:userId Teklifler alınamadı:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});



module.exports = router;
