// routes/userNotifications.js
const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { requireAuth } = require('../middlewares/auth');

// Belirli kullanıcının bildirimlerini getir (tarihine göre tersten)
router.get('/user/:userId', requireAuth(), async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.userId) {
      return res.status(403).json({ message: 'Yetersiz yetki' });
    }
    const notifications = await Notification.find({ user: req.params.userId })
      .sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Bildirimler alınamadı', error: err.message });
  }
});

// Tek bir bildirimi okundu yap
router.patch('/:id/read', requireAuth(), async (req, res) => {
  try {
    const existing = await Notification.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Bildirim bulunamadı' });
    if (req.user.role !== 'admin' && existing.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Yetersiz yetki' });
    }

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
router.patch('/user/:userId/mark-all-read', requireAuth(), async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.userId) {
      return res.status(403).json({ message: 'Yetersiz yetki' });
    }
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
