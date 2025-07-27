// routes/message.js
const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Chat = require('../models/Chat');

/**
 * ✅ Belirli bir kullanıcı için okunmamış mesaj sayısını getir
 */
router.get('/unread-count/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Kullanıcının yer aldığı chatleri bul
    const chats = await Chat.find({
      $or: [{ buyer: userId }, { seller: userId }],
    });

    const chatIds = chats.map(chat => chat._id);

    const unreadCount = await Message.countDocuments({
      chat: { $in: chatIds },
      sender: { $ne: userId }, // kullanıcı göndermemiş
      isRead: false,
    });

    res.json({ count: unreadCount });
  } catch (err) {
    console.error('❌ Okunmamış mesaj sayısı alınamadı:', err);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

module.exports = router;
