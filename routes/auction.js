const express = require('express');
const router = express.Router();
const Auction = require('../models/Auction');
const multer = require('multer');
const { storage } = require('../config/cloudinary');
const upload = multer({ storage });
const calculateEndsAt = require('../utils/calculateEndsAt'); // ✅ yeni eklendi

// ✅ Mezat ekleme (usta imzalı ve fotoğraflı)
router.post('/', upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, startingPrice, seller, isSigned } = req.body;

    if (!title || !startingPrice || !seller) {
      return res.status(400).json({ message: 'Başlık, fiyat ve satıcı zorunludur.' });
    }

    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // 22:30'dan önce mezat ekleme engeli
    if (hour === 22 && minute < 30) {
      return res.status(400).json({ message: 'Yeni mezat ekleme saat 22:30’dan itibaren mümkündür.' });
    }

    const imageUrls = req.files.map(file => file.path);
    const endsAt = calculateEndsAt();

    const newAuction = new Auction({
      title,
      description,
      startingPrice,
      currentPrice: startingPrice,
      seller,
      isSigned: isSigned === 'true',
      images: imageUrls,
      endsAt,
      isEnded: false,
      receiptUploaded: false,
    });

    await newAuction.save();
    res.status(201).json({ message: 'Mezat oluşturuldu', auction: newAuction });
  } catch (err) {
    console.error('Mezat eklenirken hata:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

// ✅ Satıcının kendi mezatlarını listele
router.get('/mine/:sellerId', async (req, res) => {
  try {
    const { sellerId } = req.params;
    const auctions = await Auction.find({ seller: sellerId }).sort({ createdAt: -1 });
    res.status(200).json(auctions);
  } catch (err) {
    console.error('Kendi mezatlarını listelerken hata:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

// ✅ Sadece aktif (bitmemiş) mezatları listele — anasayfa
router.get('/all', async (req, res) => {
  try {
    // Önce aktif mezat sayısını bul
    const total = await Auction.countDocuments({ isEnded: false });

    const auctions = await Auction.aggregate([
      { $match: { isEnded: false } },
      { $sample: { size: total } }, // Hepsini random sırayla al
      {
        $lookup: {
          from: 'users',
          localField: 'seller',
          foreignField: '_id',
          as: 'sellerData'
        }
      },
      {
        $addFields: {
          seller: {
            _id: { $arrayElemAt: ['$sellerData._id', 0] },
            companyName: { $arrayElemAt: ['$sellerData.companyName', 0] }
          }
        }
      },
      { $project: { sellerData: 0 } }
    ]);

    res.status(200).json(auctions);
  } catch (err) {
    console.error('Tüm mezatlar listelenirken hata:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});


// ✅ Belirli mezat detaylarını getir
router.get('/:id', async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.id)
      .populate('seller', '_id companyName')
      .populate('winner', 'name'); 

    if (!auction) {
      return res.status(404).json({ message: 'Mezat bulunamadı.' });
    }

    res.status(200).json(auction);
  } catch (err) {
    console.error('Mezat detayları alınırken hata:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});
// ✅ Alıcının kazandığı bitmiş mezatları getir
router.get('/won/:buyerId', async (req, res) => {
  try {
    const { buyerId } = req.params;

    const auctions = await Auction.find({
      winner: buyerId,
      isEnded: true,
    })
      .populate('seller', 'companyName iban ibanName bankName') // 🟢 IBAN bilgileri dahil
      .sort({ endsAt: -1 });

    res.status(200).json(auctions);
  } catch (err) {
    console.error('Kazanılan mezatlar alınırken hata:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});
// GET /api/auctions/favorites/:userId
// ✅ Favori satıcılara ait aktif mezatlar
router.get('/favorites/:userId', async (req, res) => {
  const mongoose = require('mongoose');

  try {
    const user = await User.findById(req.params.userId);

    if (!user || !user.favorites || user.favorites.length === 0) {
      return res.json([]); // Favori yoksa boş dizi
    }

    // 🔐 ObjectId tipini zorla
    const favoriteIds = user.favorites.map(id => new mongoose.Types.ObjectId(id));

    // 🔍 Sadece aktif mezatlar ve favori satıcılara ait olanlar
    const auctions = await Auction.find({
      seller: { $in: favoriteIds },
      isEnded: false,
    })
      .populate('seller', 'companyName name')
      .sort({ createdAt: -1 });

    res.json(auctions);
  } catch (err) {
    console.error('Favori mezatlar getirilemedi:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});
// routes/auction.js içinde
// GET /api/auctions/won-by/:buyerId/:sellerId
router.get('/won-by/:buyerId/:sellerId', async (req, res) => {
  const { buyerId, sellerId } = req.params;
  // Alıcının kazandığı, bu satıcıya ait mezatlar var mı?
  const count = await Auction.countDocuments({
    seller: sellerId,
    winner: buyerId,
    isEnded: true
  });
  res.json({ hasWon: count > 0 });
});
// routes/auction.js (sonuna ekle)
const { deleteAuctionWithReason } = require('../controllers/auctionController');

router.post('/delete/:auctionId', deleteAuctionWithReason); // admin yetkisi gerekecek!



module.exports = router;
