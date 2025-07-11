const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Auction = require('../models/Auction');

/**
 * ✅ 1) Alıcı için Chat başlat
 * - Alıcı sadece kazandığı mezat için satıcıyla chat başlatabilir
 */
exports.startChat = async (req, res) => {
  try {
    const { auctionId, buyerId } = req.body;

    // İlgili mezatı bul
    const auction = await Auction.findById(auctionId).populate('seller winner');
    if (!auction) {
      return res.status(404).json({ message: 'Mezat bulunamadı.' });
    }

    // Kazanan kontrolü
    if (!auction.winner || auction.winner._id.toString() !== buyerId) {
      return res.status(403).json({ message: 'Bu mezatı kazanmadınız.' });
    }

    // Zaten chat var mı
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

    const chat = await Chat.findById(chatId)
      .populate('buyer seller auction');

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
// Kullanıcıya ait tüm chatleri getir
exports.getUserChats = async (req, res) => {
  try {
    const { userId } = req.params;

    // Hem alıcı hem satıcı olarak
    const chats = await Chat.find({
      $or: [
        { buyer: userId },
        { seller: userId }
      ]
    })
    .populate('buyer seller auction')
    .sort({ updatedAt: -1 });

    res.json({ success: true, chats });
  } catch (err) {
    console.error('❌ Kullanıcının chatleri alınamadı:', err);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
};

/**
 * ✅ 3) Mesaj gönder
 * - Yetki kontrolü: sadece ilgili buyer veya seller yazabilir
 */
exports.sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { senderId, text } = req.body;

    // Chat kontrolü
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Sohbet bulunamadı.' });
    }

    // Yetkilendirme kontrolü
    const allowed = [chat.buyer.toString(), chat.seller.toString()];
    if (!allowed.includes(senderId)) {
      return res.status(403).json({ message: 'Bu sohbete mesaj gönderemezsiniz.' });
    }

    // Mesaj oluştur
    const message = await Message.create({
      chat: chatId,
      sender: senderId,
      text,
    });

    res.json({ success: true, message });
  } catch (err) {
    console.error('❌ Mesaj gönderme hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
};

/**
 * ✅ 4) Chat ve mesajlarını sil
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
