// routes/rating.js
const express = require('express');
const router = express.Router();
const Rating = require('../models/Rating');
const { requireAuth } = require('../middlewares/auth');

// Satıcı puanla (her alışverişte bir kez)
router.post('/', requireAuth(), async (req, res) => {
  try {
    const { sellerId, auctionId, score, comment } = req.body;
    // Puanlayan kullanıcı kimliği her zaman istek sahibinden alınır, body'den güvenilmez.
    const buyerId = req.user.id;
    // Aynı alışveriş için tekrar puan vermesini engelle
    const alreadyRated = await Rating.findOne({ seller: sellerId, buyer: buyerId, auction: auctionId });
    if (alreadyRated) {
      return res.status(400).json({ message: "Bu mezat için zaten puan verdiniz." });
    }
    const newRating = new Rating({ seller: sellerId, buyer: buyerId, auction: auctionId, score, comment });
    await newRating.save();
    res.status(201).json({ message: 'Puanlama kaydedildi.' });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

// Bir satıcının ortalama puanını getir
router.get('/seller/:sellerId', async (req, res) => {
  try {
    const ratings = await Rating.find({ seller: req.params.sellerId });
    if (!ratings.length) return res.json({ avg: 0, total: 0 });
    const avg = ratings.reduce((acc, cur) => acc + cur.score, 0) / ratings.length;
    res.json({ avg, total: ratings.length });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

module.exports = router;
