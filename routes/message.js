// routes/message.js
const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { requireAuth } = require('../middlewares/auth');

/**
 * ✅ Belirli bir kullanıcı için okunmamış mesaj sayısını getir
 */
router.get('/unread-count/:userId', requireAuth(), async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ message: 'Yetersiz yetki' });
    }

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
router.patch('/mark-as-read', requireAuth(), async (req, res) => {
  const { chatId } = req.body;
  // Kullanıcı kimliği her zaman istek sahibinden alınır, body'den güvenilmez.
  const userId = req.user.id;

  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Sohbet bulunamadı.' });
    const isParticipant =
      chat.buyer.toString() === userId || chat.seller.toString() === userId;
    if (req.user.role !== 'admin' && !isParticipant) {
      return res.status(403).json({ message: 'Yetersiz yetki' });
    }

    await Message.updateMany(
      { chat: chatId, sender: { $ne: userId }, isRead: false },
      { $set: { isRead: true } }
    );
    res.status(200).json({ message: 'Mesajlar okundu olarak işaretlendi' });
  } catch (err) {
    res.status(500).json({ message: 'Güncelleme hatası', error: err.message });
  }
});
module.exports = router;
