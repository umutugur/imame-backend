// backend/routes/notification.js
const express = require('express');
const router = express.Router();
const { sendPushNotification } = require('../controllers/notificationController');
const { requireAuth } = require('../middlewares/auth');

// 🔐 Bildirim gönderme (admin kullanımı)
router.post('/send', requireAuth(['admin']), sendPushNotification);

module.exports = router;
