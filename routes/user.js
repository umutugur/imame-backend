const express = require('express');
const router = express.Router();

const {
  getAllUsers,
  getBannedUsers,
  banUser,
  unbanUser,
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

// Favori işlemleri
router.post('/toggle-favorite', toggleFavoriteSeller);
router.post('/favorites/add', addFavoriteSeller);
router.post('/favorites/remove', removeFavoriteSeller);
router.get('/favorites/:userId', getFavoriteSellers);

// Admin listeleri
router.get('/all', getAllUsers);
router.get('/banned', getBannedUsers);
router.patch('/ban/:id', banUser);
router.patch('/unban/:id', unbanUser);

// Bildirim token
router.post('/update-token', updateNotificationToken);
router.post('/update-token/test', (req, res) => {
  console.log('TEST ENDPOINT çalıştı!');
  res.json({ message: 'test OK' });
});

// 👇 Apple 5.1.1(v): Hesabı kalıcı silme
router.delete('/me', requireAuth(), deleteMe);

// Kullanıcı profili getir
router.get('/:id', async (req, res) => {
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
router.post('/remove-token', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId gerekli' });
    await User.findByIdAndUpdate(userId, { $unset: { notificationToken: '' } });
    res.status(200).json({ message: 'Token başarıyla silindi' });
  } catch (err) {
    res.status(500).json({ message: 'Token silinirken hata oluştu', error: err.message });
  }
});

module.exports = router;