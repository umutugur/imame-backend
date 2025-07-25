// backend/controllers/userController.js

const User = require('../models/User');

// 🔹 Tüm kullanıcıları getir
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Kullanıcılar alınamadı', error: err.message });
  }
};

// 🔹 Banlı kullanıcıları getir
exports.getBannedUsers = async (req, res) => {
  try {
    const users = await User.find({ isBanned: true }).sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Banlı kullanıcılar alınamadı', error: err.message });
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

// 🔹 Kullanıcıyı unbanla (isteğe bağlı)
exports.unbanUser = async (req, res) => {
  try {
    const userId = req.params.id;
    await User.findByIdAndUpdate(userId, { isBanned: false });
    res.status(200).json({ message: 'Kullanıcı banı kaldırıldı' });
  } catch (err) {
    res.status(500).json({ message: 'Unban işlemi başarısız', error: err.message });
  }
};

// Bildirim token'ını güncelle
exports.updateNotificationToken = async (req, res) => {
  try {
    const { userId, pushToken } = req.body; // pushToken → token

    if (!userId || !pushToken) {
      return res.status(400).json({ message: 'Kullanıcı ID ve push token gerekli.' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { notificationToken: pushToken }, // pushToken → token
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

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

    // Zaten ekliyse tekrar ekleme
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    if (user.favorites && user.favorites.includes(sellerId)) {
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
    const user = await User.findById(userId).populate('favorites', 'name email companyName'); // istediğin alanlar
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

    res.json(user.favorites || []);
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
};
// FAVORİYİ AÇ/KAPA (toggle)
exports.toggleFavoriteSeller = async (req, res) => {
  try {
    const { userId, sellerId } = req.body;
    if (!userId || !sellerId) return res.status(400).json({ message: 'Eksik bilgi.' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

    const alreadyFavorited = user.favorites?.includes(sellerId);

    if (alreadyFavorited) {
      user.favorites = user.favorites.filter(id => id.toString() !== sellerId);
    } else {
      user.favorites.push(sellerId);
    }

    await user.save();

    res.json({ message: alreadyFavorited ? 'Favoriden çıkarıldı' : 'Favoriye eklendi', status: alreadyFavorited ? 'removed' : 'added' });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
};

