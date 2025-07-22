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
} = require('../controllers/userController');

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


module.exports = router;
