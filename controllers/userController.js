const User = require('../models/User');
// Bu modelleri deleteMe’de kullanıyoruz:
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');

// 🔹 Tüm kullanıcıları getir
exports.getAllUsers = async (_req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Kullanıcılar alınamadı', error: err.message });
  }
};

// 🔹 Banlı kullanıcıları getir
exports.getBannedUsers = async (_req, res) => {
  try {
    const users = await User.find({ isBanned: true }).sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Banlı kullanıcılar alınamadı', error: err.message });
  }
};

// 🔥 Apple 5.1.1(v): Hesabı kalıcı sil
exports.deleteMe = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // İsteğe bağlı: Kullanıcıya ait referans verileri temizle/anonimleştir
    // Satıcı ise açık mezat sahibi alanını boşalt (ya da soft-delete mantığına göre kapat)
    try {
      await Auction.updateMany({ seller: userId }, { $unset: { seller: '' } });
    } catch (e) {
      console.warn('[deleteMe] Auction update warning:', e?.message || e);
    }

    // Kullanıcı teklifleri (anonimleştirmek yerine siliyoruz)
    try {
      await Bid.deleteMany({ user: userId });
    } catch (e) {
      console.warn('[deleteMe] Bid delete warning:', e?.message || e);
    }

    // Push token’ı da temizleyelim (opsiyonel)
    try {
      await User.findByIdAndUpdate(userId, { $unset: { notificationToken: '' } });
    } catch {}

    // Son olarak kullanıcıyı sil
    await User.findByIdAndDelete(userId);

    return res.status(200).json({ message: 'Account deleted' });
  } catch (err) {
    console.error('deleteMe error:', err);
    return res
      .status(500)
      .json({ message: 'Account deletion failed', error: err.message });
  }
};

// 🔹 Kullanıcıyı banla
exports.banUser = async (req, res) => {
  try {
    const userId = req.params.id;
    await User.findByIdAndUpdate(userId, { isBanned: true });
    res.status(200).json({ message: 'Kullanıcı banlandı' });
  } catch (err) {
    res.status(500).json({ message: 'Ban işlemi başarısız', error: err.message });
  }
};

// 🔹 Kullanıcıyı unbanla
exports.unbanUser = async (req, res) => {
  try {
    const userId = req.params.id;
    await User.findByIdAndUpdate(userId, { isBanned: false });
    res.status(200).json({ message: 'Kullanıcı banı kaldırıldı' });
  } catch (err) {
    res.status(500).json({ message: 'Unban işlemi başarısız', error: err.message });
  }
};

// 🔔 Bildirim token'ını güncelle
exports.updateNotificationToken = async (req, res) => {
  try {
    const { userId, pushToken } = req.body;
    if (!userId || !pushToken) {
      return res.status(400).json({ message: 'Kullanıcı ID ve push token gerekli.' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { notificationToken: pushToken },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    res.status(200).json({ message: 'Token güncellendi.', user });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası.', error: err.message });
  }
};

// FAVORİ SATICI EKLE
exports.addFavoriteSeller = async (req, res) => {
  try {
    const { userId, sellerId } = req.body;
    if (!userId || !sellerId) return res.status(400).json({ message: 'Eksik bilgi.' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    if (user.favorites?.includes(sellerId)) {
      return res.status(200).json({ message: 'Satıcı zaten favorilerde.' });
    }

    user.favorites = [...(user.favorites || []), sellerId];
    await user.save();

    res.json({ message: 'Favori satıcı eklendi.', favorites: user.favorites });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
};

// FAVORİ SATICI ÇIKAR
exports.removeFavoriteSeller = async (req, res) => {
  try {
    const { userId, sellerId } = req.body;
    if (!userId || !sellerId) return res.status(400).json({ message: 'Eksik bilgi.' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

    user.favorites = (user.favorites || []).filter(id => id.toString() !== sellerId);
    await user.save();

    res.json({ message: 'Favori satıcı çıkarıldı.', favorites: user.favorites });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
};

// FAVORİ SATICILARI GETİR
exports.getFavoriteSellers = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).populate('favorites', 'name email companyName');
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

    res.json(user.favorites || []);
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
};

// FAVORİ TOGGLE
exports.toggleFavoriteSeller = async (req, res) => {
  try {
    const { userId, sellerId } = req.body;
    if (!userId || !sellerId) return res.status(400).json({ message: 'Eksik bilgi.' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

    const already = user.favorites?.includes(sellerId);
    if (already) {
      user.favorites = user.favorites.filter(id => id.toString() !== sellerId);
    } else {
      user.favorites = [...(user.favorites || []), sellerId];
    }
    await user.save();

    res.json({
      message: already ? 'Favoriden çıkarıldı' : 'Favoriye eklendi',
      status: already ? 'removed' : 'added',
    });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
};