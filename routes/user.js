const express = require('express');
const router = express.Router();

const {
  getAllUsers,
  getBannedUsers,
  banUser,
  unbanUser,
  changeRole,
  updateNotificationToken,
  addFavoriteSeller,
  removeFavoriteSeller,
  getFavoriteSellers,
  toggleFavoriteSeller,
  deleteMe, // 👈 hesap silme
} = require('../controllers/userController');

const User = require('../models/User');

// 🔥 EKSİK OLAN IMPORT
const { requireAuth } = require('../middlewares/auth'); // .js uzantısı opsiyonel ama istersen ekleyebilirsin

// Kendi userId'sinin yalnızca kendisi ya da admin tarafından kullanılmasını zorunlu kılar
function requireSelfOrAdmin(getUserId) {
  return (req, res, next) => {
    const targetId = getUserId(req);
    if (req.user.role !== 'admin' && req.user.id !== targetId) {
      return res.status(403).json({ message: 'Yetersiz yetki' });
    }
    next();
  };
}

// Favori işlemleri
router.post(
  '/toggle-favorite',
  requireAuth(),
  requireSelfOrAdmin((req) => req.body.userId),
  toggleFavoriteSeller
);
router.post(
  '/favorites/add',
  requireAuth(),
  requireSelfOrAdmin((req) => req.body.userId),
  addFavoriteSeller
);
router.post(
  '/favorites/remove',
  requireAuth(),
  requireSelfOrAdmin((req) => req.body.userId),
  removeFavoriteSeller
);
router.get(
  '/favorites/:userId',
  requireAuth(),
  requireSelfOrAdmin((req) => req.params.userId),
  getFavoriteSellers
);

// Admin listeleri
router.get('/all', requireAuth(['admin']), getAllUsers);
router.get('/banned', requireAuth(['admin']), getBannedUsers);
router.patch('/ban/:id', requireAuth(['admin']), banUser);
router.patch('/unban/:id', requireAuth(['admin']), unbanUser);
router.patch('/:id/role', requireAuth(['admin']), changeRole);

// Bildirim token
router.post(
  '/update-token',
  requireAuth(),
  requireSelfOrAdmin((req) => req.body.userId),
  updateNotificationToken
);
router.post('/update-token/test', requireAuth(), (req, res) => {
  console.log('TEST ENDPOINT çalıştı!');
  res.json({ message: 'test OK' });
});

// 👇 Apple 5.1.1(v): Hesabı kalıcı silme
router.delete('/me', requireAuth(), deleteMe);

// Kullanıcı profili getir
router.get('/:id', requireAuth(), async (req, res) => {
  try {
    const user = await require('../models/User')
      .findById(req.params.id)
      .select('-password');
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    res.json(user);
  } catch (err) {
    console.error('Kullanıcı getirilemedi:', err);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

// Expo push token'ı temizle
router.post(
  '/remove-token',
  requireAuth(),
  requireSelfOrAdmin((req) => req.body.userId),
  async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: 'userId gerekli' });
      await User.findByIdAndUpdate(userId, { $unset: { notificationToken: '' } });
      res.status(200).json({ message: 'Token başarıyla silindi' });
    } catch (err) {
      res.status(500).json({ message: 'Token silinirken hata oluştu', error: err.message });
    }
  }
);

module.exports = router;