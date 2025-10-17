const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getBannedUsers,
  banUser,
  unbanUser,
  updateNotificationToken, // 👈 ekledik
  addFavoriteSeller,
  removeFavoriteSeller,
  getFavoriteSellers,
  toggleFavoriteSeller,
} = require('../controllers/userController');
const User = require('../models/User');

router.post('/toggle-favorite', toggleFavoriteSeller);
// 🔐 Tüm kullanıcıları listele (admin)
router.get('/all', getAllUsers);

// 🔐 Sadece banlı kullanıcıları listele
router.get('/banned', getBannedUsers);

// 🔐 Kullanıcıyı banla
router.patch('/ban/:id', banUser);

// 🔐 Kullanıcıyı unbanla
router.patch('/unban/:id', unbanUser);

// 🔹 Bildirim token'ını güncelle
router.post('/update-token', updateNotificationToken); // 👈 yeni route
router.post('/update-token/test', (req, res) => {
  console.log('TEST ENDPOINT çalıştı!');
  res.json({ message: 'test OK' });
});
router.delete('/me', requireAuth(), deleteMe); // 👈 yeni satır
// Favori satıcı ekle
router.post('/favorites/add', addFavoriteSeller);
// Favori satıcı çıkar
router.post('/favorites/remove', removeFavoriteSeller);
// Favori satıcıları getir
router.get('/favorites/:userId', getFavoriteSellers);
// Satıcı bilgilerini getir
router.get('/:id', async (req, res) => {
  try {
    const user = await require('../models/User').findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    res.json(user);
  } catch (err) {
    console.error('Kullanıcı getirilemedi:', err);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});
// Kullanıcının Expo push token'ını temizle
router.post('/remove-token', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "userId gerekli" });

    await User.findByIdAndUpdate(userId, { $unset: { notificationToken: "" } });
    res.status(200).json({ message: "Token başarıyla silindi" });
  } catch (err) {
    res.status(500).json({ message: "Token silinirken hata oluştu", error: err.message });
  }
});



module.exports = router;
