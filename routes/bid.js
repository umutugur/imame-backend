const express = require('express');
const router = express.Router();
const Bid = require('../models/Bid');
const Auction = require('../models/Auction');

// Teklif verme - atomik, tutarlı ve yarışmaları engelleyen versiyon
router.post('/', async (req, res) => {
  try {
    const { auctionId, userId, amount } = req.body;
    console.log('TEKLİF BODY:', req.body);

    // Mezatı ve son fiyatı çek
    const auction = await Auction.findById(auctionId);
    if (!auction) return res.status(404).json({ message: 'Mezat bulunamadı' });

    if (amount <= auction.currentPrice) {
      return res.status(400).json({ message: 'Teklif mevcut fiyattan yüksek olmalı' });
    }

    const lastBid = await Bid.findOne({ auction: auctionId }).sort({ createdAt: -1 });
    if (lastBid && lastBid.user.toString() === userId) {
      return res.status(400).json({ message: 'Son teklifi zaten siz verdiniz.' });
    }

    // Atomic update: Sadece currentPrice daha küçükse güncelle ve yeni currentPrice'ı al
    const updatedAuction = await Auction.findOneAndUpdate(
      { _id: auctionId, currentPrice: { $lt: amount } },
      { currentPrice: amount },
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

    res.status(201).json({ message: 'Teklif başarıyla verildi', bid: newBid });
  } catch (err) {
    console.error('Teklif verme hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

// Teklif listesini getir (detay ekranı için)
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
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    // 1️⃣ Kullanıcının teklif verdiği aktif mezatları çek
    const userBids = await Bid.find({ user: userId })
      .populate({
        path: 'auction',
        select: 'title winner isEnded images currentPrice',
      })
      .lean();

    // 2️⃣ Sadece aktif mezatlar
    const activeBids = userBids.filter(b => b.auction && !b.auction.isEnded);

    // 3️⃣ Mezata göre kullanıcının kendi son teklifini bul
    const myLatestByAuction = new Map();
    for (const bid of activeBids) {
      const aid = bid.auction._id.toString();
      if (!myLatestByAuction.has(aid) || new Date(bid.createdAt) > new Date(myLatestByAuction.get(aid).createdAt)) {
        myLatestByAuction.set(aid, bid);
      }
    }

    // 4️⃣ Her mezat için son (herkesin) teklifi DB'den çek ve durum belirle
    const results = [];
    for (const [auctionId, myBid] of myLatestByAuction.entries()) {
      const lastBid = await Bid.findOne({ auction: auctionId }).sort({ createdAt: -1 }).lean();
      if (!lastBid) continue;

      results.push({
        ...myBid,
        auctionCurrentPrice: lastBid.amount,
        statusText: lastBid.user.toString() === userId ? 'Teklif Verildi' : 'Sizden sonra teklif verildi',
      });
    }

    res.json(results);
  } catch (err) {
    console.error('❌ /user/:userId Teklifler alınamadı:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});


module.exports = router;
