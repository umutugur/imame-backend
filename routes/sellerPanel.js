const path = require('path');
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { requireAuth } = require('../middlewares/auth');
const Auction = require('../models/Auction');
const User = require('../models/User');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 8*1024*1024 } });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Panel HTML
router.get('/seller', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'seller', 'seller.html'));
});

// Profil
router.get('/api/seller/profile', requireAuth(['seller']), async (req, res) => {
  const u = await User.findById(req.user.id).select('name email companyName phone');
  res.json({ ok:true, user: u });
});

// Yardımcı: bir sonraki 22:00
function nextTenPM() {
  const now = new Date();
  const t = new Date(now);
  t.setHours(22,0,0,0);
  if (now >= t) t.setDate(t.getDate()+1);
  return t;
}

// Mezat Ekle (Cloudinary)
router.post('/api/seller/auctions', requireAuth(['seller']), upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, startingPrice, isSigned } = req.body;
    if (!title || !startingPrice) {
      return res.status(400).json({ ok:false, message:'Başlık ve başlangıç fiyatı zorunlu' });
    }

    const uploads = await Promise.all((req.files || []).map(file =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'imame/auctions' },
          (err, result) => err ? reject(err) : resolve(result.secure_url)
        );
        stream.end(file.buffer);
      })
    ));

    const doc = await Auction.create({
      title: title.trim(),
      description: (description || '').trim(),
      startingPrice: Number(startingPrice),
      currentPrice: Number(startingPrice),
      isSigned: isSigned === 'true' || isSigned === true,
      images: uploads,
      seller: req.user.id,
      endsAt: nextTenPM(),
    });

    res.json({ ok:true, auctionId: doc._id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Auction create error' });
  }
});

// Mezatlarım
router.get('/api/seller/auctions', requireAuth(['seller']), async (req, res) => {
  const items = await Auction.find({ seller: req.user.id })
    .select('_id title currentPrice startingPrice endsAt images isSigned isEnded receiptStatus')
    .sort({ createdAt: -1 }).lean();
  res.json({ ok:true, items });
});

module.exports = router;
