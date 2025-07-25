// routes/userNotifications.js
const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');

// Belirli kullanıcının bildirimlerini getir (tarihine göre tersten)
router.get('/user/:userId', async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.params.userId })
      .sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Bildirimler alınamadı', error: err.message });
  }
});

// Tek bir bildirimi okundu yap
router.patch('/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );
    res.json(notification);
  } catch (err) {
    res.status(500).json({ message: 'Bildirim güncellenemedi', error: err.message });
  }
});

// Tüm bildirimleri okundu yap
router.patch('/user/:userId/mark-all-read', async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.params.userId, isRead: false },
      { isRead: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Bildirimler güncellenemedi', error: err.message });
  }
});

module.exports = router;
