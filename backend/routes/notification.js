// backend/routes/notification.js
const express = require('express');
const router = express.Router();
const { sendPushNotification } = require('../controllers/notificationController');

// 🔐 Bildirim gönderme (admin kullanımı)
router.post('/send', sendPushNotification);

module.exports = router;
