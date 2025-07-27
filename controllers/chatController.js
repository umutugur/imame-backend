const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Auction = require('../models/Auction');
const User = require('../models/User');
const { sendExpoPushNotification } = require('../utils/expoPush');

/**
 * ✅ 1) Alıcı için Chat başlat
 */
exports.startChat = async (req, res) => {
  try {
    const { auctionId, buyerId } = req.body;

    const auction = await Auction.findById(auctionId).populate('seller winner');
    if (!auction) {
      return res.status(404).json({ message: 'Mezat bulunamadı.' });
    }

    if (!auction.winner || auction.winner._id.toString() !== buyerId) {
      return res.status(403).json({ message: 'Bu mezatı kazanmadınız.' });
    }

    let chat = await Chat.findOne({ auction: auctionId, buyer: buyerId });
    if (!chat) {
      chat = await Chat.create({
        auction: auctionId,
        buyer: buyerId,
        seller: auction.seller._id,
      });
    }

    res.json({ success: true, chat });
  } catch (err) {
    console.error('❌ Chat başlatma hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
};

/**
 * ✅ 2) Chat detayını ve mesaj listesini getir
 */
exports.getChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId).populate('buyer seller auction');
    if (!chat) {
      return res.status(404).json({ message: 'Sohbet bulunamadı.' });
    }

    const messages = await Message.find({ chat: chatId }).sort({ createdAt: 1 });

    res.json({ success: true, chat, messages });
  } catch (err) {
    console.error('❌ Chat getirme hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
};

/**
 * ✅ 3) Kullanıcının chat listesini getir
 */
exports.getUserChats = async (req, res) => {
  try {
    const { userId } = req.params;

    // Sohbetleri al
    const chats = await Chat.find({
      $or: [{ buyer: userId }, { seller: userId }]
    })
      .populate('buyer seller auction')
      .sort({ updatedAt: -1 })
      .lean(); // lean() kullanıyoruz çünkü veri üzerinde işlem yapacağız

    // Chat ID'lerini topla
    const chatIds = chats.map(chat => chat._id);

    // Unread mesajları çek
    const unreadMessages = await Message.find({
      chat: { $in: chatIds },
      sender: { $ne: userId },     // Karşı taraf göndermiş olacak
      isRead: false
    }).lean();

    // Chat ID -> unread count map’i oluştur
    const unreadMap = {};
    unreadMessages.forEach(msg => {
      const id = msg.chat.toString();
      unreadMap[id] = (unreadMap[id] || 0) + 1;
    });

    // Her sohbete unreadMessages alanı ekle
    const chatsWithUnread = chats.map(chat => ({
      ...chat,
      unreadMessages: unreadMap[chat._id.toString()] || 0
    }));

    res.json({ success: true, chats: chatsWithUnread });

  } catch (err) {
    console.error('❌ Kullanıcının chatleri alınamadı:', err);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
};

/**
 * ✅ 4) Mesaj gönder (bildirim dahil)
 */
exports.sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { senderId, text } = req.body;

    const chat = await Chat.findById(chatId).populate('buyer seller auction');
    if (!chat) {
      return res.status(404).json({ message: 'Sohbet bulunamadı.' });
    }

    const allowed = [chat.buyer._id.toString(), chat.seller._id.toString()];
    if (!allowed.includes(senderId)) {
      return res.status(403).json({ message: 'Bu sohbete mesaj gönderemezsiniz.' });
    }

    const message = await Message.create({
      chat: chatId,
      sender: senderId,
      text,
    });

    // Alıcı kim? (karşı taraf)
    const recipient =
      senderId === chat.buyer._id.toString() ? chat.seller : chat.buyer;

    // Bildirim gönder
    if (recipient.notificationToken) {
      await sendExpoPushNotification(
        recipient.notificationToken,
        'Yeni Mesaj',
        text,
        {
          type: 'chat',
          chatId: chat._id.toString(),
          otherUserName:
            senderId === chat.buyer._id.toString()
              ? chat.buyer.name
              : chat.seller.name,
        },
        recipient._id
      );
    }

    res.json({ success: true, message });
  } catch (err) {
    console.error('❌ Mesaj gönderme hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
};

/**
 * ✅ 5) Chat ve mesajlarını sil
 */
exports.deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    await Chat.findByIdAndDelete(chatId);
    await Message.deleteMany({ chat: chatId });

    res.json({ success: true, message: 'Sohbet başarıyla silindi.' });
  } catch (err) {
    console.error('❌ Chat silme hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
};
