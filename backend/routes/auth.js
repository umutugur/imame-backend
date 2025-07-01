const express = require('express');
const router = express.Router();
const {
  register,
  login,
  socialLogin,
  updateProfile
} = require('../controllers/authController');

//const authMiddleware = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.post('/social-login', socialLogin);

// 🔐 Profil güncelleme (sadece giriş yapmış kullanıcılar erişebilir)
// Eğer istersen authMiddleware aktif edebilirsin:
 // router.put('/update-profile', authMiddleware, updateProfile);
router.put('/update-profile', updateProfile);

module.exports = router;
