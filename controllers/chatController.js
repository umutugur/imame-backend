const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Auction = require('../models/Auction');

// ✅ 1) Alıcı için Chat başlat
exports.startChat = async (req, res) => {
  try {
    const { auctionId, buyerId } = req.body;

    // Mezatı bul
    const auction = await Auction.findById(auctionId).populate('seller winner');
    if (!auction) return res.status(404).json({ message: 'Auction not found' });

    // Kazanan kontrolü
    if (!auction.winner || auction.winner._id.toString() !== buyerId) {
      return res.status(403).json({ message: 'Bu mezatı kazanmadınız.' });
    }

    // Zaten var mı?
    let chat = await Chat.findOne({ auction: auctionId, buyer: buyerId });
    if (!chat) {
      chat = await Chat.create({
        auction: auctionId,
        buyer: buyerId,
        seller: auction.seller._id,
      });
    }

    res.json(chat);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
};

// ✅ 2) Chat detayını ve mesajları getir
exports.getChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId)
      .populate('buyer seller auction');

    if (!chat) return res.status(404).json({ message: 'Chat bulunamadı' });

    const messages = await Message.find({ chat: chatId }).sort({ createdAt: 1 });

    res.json({ chat, messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
};

// ✅ 3) Mesaj gönder
exports.sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { senderId, text } = req.body;

    // Chat var mı kontrol et
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat bulunamadı' });

    // Yetki kontrolü
    if (
      chat.buyer.toString() !== senderId &&
      chat.seller.toString() !== senderId
    ) {
      return res.status(403).json({ message: 'Bu sohbete mesaj atamazsınız.' });
    }

    const message = await Message.create({
      chat: chatId,
      sender: senderId,
      text,
    });

    res.json({ message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Sunucu hatası' });
  }
};
