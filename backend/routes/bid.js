const express = require('express');
const router = express.Router();
const Bid = require('../models/Bid');
const Auction = require('../models/Auction');

// Teklif verme - atomik, tutarlı ve yarışmaları engelleyen versiyon
router.post('/', async (req, res) => {
  try {
    const { auctionId, userId, amount } = req.body;

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

    const bids = await Bid.find({ user: userId })
      .populate('auction', 'title winner isEnded images currentPrice')
      .populate('user', 'name')
      .lean();

    console.log('Tüm teklifler:', bids.length);

    // Mezata göre grupla, sadece en son teklifi tut
    const grouped = bids.reduce((acc, bid) => {
      const auctionId = bid.auction._id.toString();
      if (!acc[auctionId] || new Date(bid.createdAt) > new Date(acc[auctionId].createdAt)) {
        acc[auctionId] = bid;
      }
      return acc;
    }, {});

    const latestBids = Object.values(grouped);

    console.log('Gruplanmış son teklifler:', latestBids.length);

    // Durum bilgisi ekle
    const bidsWithStatus = latestBids.map(bid => {
      const auctionBids = bids
        .filter(b => b.auction._id.toString() === bid.auction._id.toString())
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      const lastBid = auctionBids[auctionBids.length - 1];

      const lastBidUserId = lastBid.user._id ? lastBid.user._id.toString() : lastBid.user.toString();
      const currentBidUserId = bid.user._id ? bid.user._id.toString() : bid.user.toString();

      let statusText = bid.auction.winner?.toString() === currentBidUserId ? 'Kazandınız' : 'Teklif Verildi';

      if (statusText === 'Teklif Verildi' && lastBidUserId !== currentBidUserId) {
        statusText = 'Sizden sonra teklif verildi';
      }

      console.log(`Auction: ${bid.auction.title}, Status: ${statusText}`);

      return {
        ...bid,
        statusText,
      };
    });

    console.log('Son durumlu teklifler:', bidsWithStatus.length);
    res.status(200).json(bidsWithStatus);
  } catch (err) {
    console.error('Teklifler alınamadı:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

module.exports = router;
