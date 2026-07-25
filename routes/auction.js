const express = require('express');
const router = express.Router();
const Auction = require('../models/Auction');
const multer = require('multer');
const { storage } = require('../config/cloudinary');
const upload = multer({ storage });
const calculateEndsAt = require('../utils/calculateEndsAt'); // ✅ yeni eklendi
const User = require('../models/User');
const mongoose = require('mongoose');
const AuctionSeen = require('../models/AuctionSeen');
const auctionDayKey = require('../utils/auctionDayKey');
const { rankAuctions } = require('../utils/feedRanking');
const { requireAuth, optionalAuth } = require('../middlewares/auth');

// ✅ Mezat ekleme (usta imzalı ve fotoğraflı)
router.post('/', requireAuth(['seller', 'admin']), upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, startingPrice, isSigned } = req.body;
    // Satıcı kimliği, admin dışındaki isteklerde her zaman istek sahibinden alınır.
    const seller = req.user.role === 'admin' ? req.body.seller : req.user.id;

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
router.get('/mine/:sellerId', requireAuth(['seller', 'admin']), async (req, res) => {
  try {
    const { sellerId } = req.params;
    if (req.user.role !== 'admin' && req.user.id !== sellerId) {
      return res.status(403).json({ message: 'Yetersiz yetki' });
    }
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

// ✅ Adil teşhirli feed — misafir + girişli (sayfalı)
router.get('/feed', optionalAuth(), async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const userId = req.user?.id || null;
    const seed = userId || String(req.query.seed || Math.random());

    // 1) Aday havuzu — sıralama için sadece küçük alanlar
    const candidates = await Auction.find({ isEnded: false })
      .select('_id impressionCount bidCount')
      .lean();

    // 2) Kullanıcının bugün gördükleri
    let seenIds = new Set();
    if (userId) {
      const doc = await AuctionSeen.findOne({ user: userId, day: auctionDayKey() })
        .select('seen')
        .lean();
      if (doc && doc.seen) seenIds = new Set(doc.seen.map(String));
    }

    // 3) Faz seçimi: görülmemişler bitince ikinci tur
    const unseen = candidates.filter((a) => !seenIds.has(String(a._id)));
    const phase = unseen.length > 0 ? 'unseen' : 'seen';
    const pool = phase === 'unseen' ? unseen : candidates;

    // 4) Sırala ve dilimle (ikinci turda offset kullanılır)
    const ranked = rankAuctions(pool, seed);
    const start = phase === 'seen' ? offset : 0;
    const ids = ranked.slice(start, start + limit).map((r) => r.id);

    // 5) Tam dokümanları çek, sırayı koru
    const docs = await Auction.find({ _id: { $in: ids } })
      .populate('seller', 'companyName')
      .lean();
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    const items = ids.map((id) => byId.get(String(id))).filter(Boolean);

    res.json({
      items,
      hasMore: phase === 'seen' ? start + limit < ranked.length : ranked.length > limit,
      phase,
    });
  } catch (err) {
    console.error('Feed listeleme hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

// ✅ Görüntülenme bildirimi — istemci görünen kartları toplu gönderir
router.post('/impressions', optionalAuth(), async (req, res) => {
  try {
    const raw = Array.isArray(req.body && req.body.auctionIds) ? req.body.auctionIds : [];
    const ids = [...new Set(raw.map(String))]
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .slice(0, 50);
    if (!ids.length) return res.json({ ok: true });

    const userId = req.user?.id || null;

    // Satıcının kendi mezatları SAYILMAZ (kendi ilanını yenileyerek şişirmesin)
    let countable = ids;
    if (userId) {
      const owned = await Auction.find({ _id: { $in: ids }, seller: userId })
        .select('_id')
        .lean();
      const ownedSet = new Set(owned.map((a) => String(a._id)));
      countable = ids.filter((id) => !ownedSet.has(id));
    }

    if (countable.length) {
      await Auction.updateMany({ _id: { $in: countable } }, { $inc: { impressionCount: 1 } });
    }

    // "Görüldü" kümesine TÜM gösterilenler yazılır (kendi mezatları dahil) —
    // tekrar gösterilmesinler diye. Sadece SAYAÇ hariç tutulur.
    if (userId) {
      await AuctionSeen.updateOne(
        { user: userId, day: auctionDayKey() },
        { $addToSet: { seen: { $each: ids } }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Görüntülenme kaydı hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası' });
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
router.get('/won/:buyerId', requireAuth(), async (req, res) => {
  try {
    const { buyerId } = req.params;
    if (req.user.role !== 'admin' && req.user.id !== buyerId) {
      return res.status(403).json({ message: 'Yetersiz yetki' });
    }

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
router.get('/favorites/:userId', requireAuth(), async (req, res) => {
  const mongoose = require('mongoose');

  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.userId) {
      return res.status(403).json({ message: 'Yetersiz yetki' });
    }
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
router.get('/won-by/:buyerId/:sellerId', requireAuth(), async (req, res) => {
  const { buyerId, sellerId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== buyerId) {
    return res.status(403).json({ message: 'Yetersiz yetki' });
  }
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

router.post('/delete/:auctionId', requireAuth(), deleteAuctionWithReason); // admin veya mezat sahibi



module.exports = router;
