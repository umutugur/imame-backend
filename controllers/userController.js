const User = require('../models/User');
// Bu modelleri deleteMe’de kullanıyoruz:
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const { logAdminAction } = require('../utils/adminLog');
const { sendExpoPushNotification } = require('../utils/expoPush');

// 🔹 Tüm kullanıcıları getir (arama + rol filtresi + sayfalama)
exports.getAllUsers = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const filter = {};
    if (req.query.role && ['buyer', 'seller', 'admin'].includes(req.query.role)) {
      filter.role = req.query.role;
    }
    if (req.query.q) {
      const rx = { $regex: String(req.query.q).trim(), $options: 'i' };
      filter.$or = [{ name: rx }, { email: rx }, { companyName: rx }];
    }

    const [items, total] = await Promise.all([
      User.find(filter)
        .select('-password -resetCode -resetCodeExpires')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({ ok: true, items, total, page, limit });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Kullanıcılar alınamadı', error: err.message });
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

// 🔹 Kullanıcıyı banla (süreli/süresiz + sebep)
exports.banUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (String(userId) === String(req.user.id)) {
      return res.status(400).json({ message: 'Kendi hesabınızı banlayamazsınız' });
    }

    const { durationDays, reason } = req.body || {};
    const days = Number(durationDays);
    const bannedUntil = Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * 24 * 3600 * 1000)
      : null; // süresiz

    const user = await User.findByIdAndUpdate(
      userId,
      { isBanned: true, bannedUntil, banReason: reason || null },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı' });

    logAdminAction(req, {
      action: 'ban', targetType: 'user', targetId: user._id,
      meta: { durationDays: days || null, reason: reason || null },
    });

    // Kullanıcıyı bilgilendir — fire-and-forget, push hatası ban'ı bozmaz
    if (user.notificationToken) {
      const sure = bannedUntil
        ? `${days} gün boyunca`
        : 'süresiz olarak';
      sendExpoPushNotification(
        user.notificationToken,
        'Hesabınız askıya alındı',
        `Hesabınız ${sure} askıya alındı.${reason ? ' Sebep: ' + reason : ''}`,
        { type: 'ban', userId: String(user._id) },
        user._id
      ).catch(() => {});
    }

    res.status(200).json({ message: 'Kullanıcı banlandı', bannedUntil });
  } catch (err) {
    res.status(500).json({ message: 'Ban işlemi başarısız', error: err.message });
  }
};

// 🔹 Kullanıcıyı unbanla
exports.unbanUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: false, bannedUntil: null, banReason: null },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    logAdminAction(req, { action: 'unban', targetType: 'user', targetId: user._id });

    res.status(200).json({ message: 'Kullanıcı banı kaldırıldı' });
  } catch (err) {
    res.status(500).json({ message: 'Unban işlemi başarısız', error: err.message });
  }
};

// 🔹 Rol değişimi — sistemin en riskli işlemi, üç korkuluğu var.
exports.changeRole = async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!['buyer', 'seller', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Geçersiz rol' });
    }
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ message: 'Kendi rolünüzü değiştiremezsiniz' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı' });

    // Son yöneticiyi düşürme koruması: aksi halde sisteme admin erişimi tümüyle kaybolur.
    if (user.role === 'admin' && role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Sistemde en az bir yönetici kalmalı' });
      }
    }

    const oldRole = user.role;
    user.role = role;
    await user.save();

    logAdminAction(req, {
      action: 'role_change', targetType: 'user', targetId: user._id,
      meta: { from: oldRole, to: role },
    });

    res.json({ message: 'Rol güncellendi', role });
  } catch (err) {
    res.status(500).json({ message: 'Rol değiştirilemedi', error: err.message });
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