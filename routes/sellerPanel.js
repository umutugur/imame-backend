// routes/sellerPanel.js
const path = require('path');
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { requireAuth } = require('../middlewares/auth');
const Auction = require('../models/Auction');
const User = require('../models/User');
const calculateEndsAt = require('../utils/calculateEndsAt'); // ⬅️ TR 22:00 → UTC için

const router = express.Router();

// Cloudinary: hafızada al, 5 dosya / 8MB sınır
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 5, fileSize: 8 * 1024 * 1024 },
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// -----------------------------
// Panel HTML
// -----------------------------
router.get('/seller', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'seller', 'seller.html'));
});

// -----------------------------
// Profil (banner için)
// -----------------------------
router.get('/api/seller/profile', requireAuth(['seller']), async (req, res) => {
  try {
    const u = await User.findById(req.user.id).select('name email companyName phone');
    res.json({ ok: true, user: u });
  } catch (e) {
    res.status(500).json({ ok: false, message: 'Profil alınamadı' });
  }
});

// -----------------------------
// Mezat Ekle (Cloudinary upload)
// endsAt: her zaman calculateEndsAt() (TR 22:00 → UTC 19:00 veya yarın)
// -----------------------------
router.post('/api/seller/auctions', requireAuth(['seller']), upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, isSigned } = req.body;
    let { startingPrice } = req.body;

    if (!title || startingPrice == null) {
      return res.status(400).json({ ok: false, message: 'Başlık ve başlangıç fiyatı zorunlu' });
    }

    const sPrice = Number(startingPrice);
    if (Number.isNaN(sPrice) || sPrice < 0) {
      return res.status(400).json({ ok: false, message: 'Başlangıç fiyatı geçersiz' });
    }

    // Cloudinary'e yükle
    const images = await Promise.all(
      (req.files || []).map(
        (file) =>
          new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: 'imame/auctions' },
              (err, result) => (err ? reject(err) : resolve(result.secure_url))
            );
            stream.end(file.buffer);
          })
      )
    );

    // ⏰ Bitiş: TR 22:00'ın UTC karşılığı (bugün/yarın)
    const endsAt = calculateEndsAt();

    const doc = await Auction.create({
      title: String(title).trim(),
      description: String(description || '').trim(),
      startingPrice: sPrice,
      currentPrice: sPrice,
      isSigned: isSigned === 'true' || isSigned === true,
      images,
      seller: req.user.id,
      endsAt,
      isEnded: false,
    });

    // debug log (isteğe bağlı)
    console.log(
      'Auction created',
      { id: doc._id.toString(), nowUTC: new Date().toISOString(), endsAtUTC: endsAt.toISOString() }
    );

    res.json({ ok: true, auctionId: doc._id, endsAt: endsAt.toISOString() });
  } catch (e) {
    console.error('Auction create error:', e);
    res.status(500).json({ ok: false, message: 'Auction create error' });
  }
});

// -----------------------------
// Mezatlarım
// -----------------------------
router.get('/api/seller/auctions', requireAuth(['seller']), async (req, res) => {
  try {
    const items = await Auction.find({ seller: req.user.id })
      .select('_id title currentPrice startingPrice endsAt images isSigned isEnded receiptStatus')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ ok: true, items });
  } catch (e) {
    console.error('List error:', e);
    res.status(500).json({ ok: false, message: 'Liste alınamadı' });
  }
});

module.exports = router;
