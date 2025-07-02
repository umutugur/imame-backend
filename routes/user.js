const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getBannedUsers,
  banUser,
  unbanUser,
  updateNotificationToken, // 👈 ekledik
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

module.exports = router;
