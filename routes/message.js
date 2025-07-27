// routes/message.js
const express = require('express');
const router = express.Router();
const Message = require('../models/Message');

/**
 * ✅ Belirli bir kullanıcı için okunmamış mesaj sayısını getir
 */
router.get('/unread-count/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Kullanıcının alıcı olduğu mesajlar (henüz okunmamış ve kullanıcı gönderici değil)
    const unreadCount = await Message.countDocuments({
      sender: { $ne: userId },
      isRead: false,
    });

    res.json({ count: unreadCount });
  } catch (err) {
    console.error('❌ Okunmamış mesaj sayısı alınamadı:', err);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

module.exports = router;
