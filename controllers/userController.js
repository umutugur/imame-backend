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

// 🔹 Bildirim token'ını güncelle
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

    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    res.status(200).json({ message: 'Token güncellendi.', user });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası.', error: err.message });
  }
};
