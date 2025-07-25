const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

// ✅ Routes
const authRoutes = require('./routes/auth');
const auctionRoutes = require('./routes/auction');
const bidRoutes = require('./routes/bid');
const userRoutes = require('./routes/user');
const receiptRoutes = require('./routes/receipts');
const notificationRoutes = require('./routes/notification');
const chatRoutes = require('./routes/chatRoutes');
const userNotificationsRoutes = require('./routes/userNotifications');
const ratingRoutes = require('./routes/rating');
const reportRoutes = require('./routes/report');

// ✅ Models & Helpers for Cron Endpoints
const Auction = require('./models/Auction');
const Bid = require('./models/Bid');
const User = require('./models/User');
const { sendExpoPushNotification } = require('./utils/expoPush');

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Middleware
app.use(cors());
app.use(express.json());

// ✅ API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/users', userRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/user-notifications', userNotificationsRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/reports', reportRoutes);

// ✅ Test route
app.get('/', (req, res) => {
  res.send('İmame Backend çalışıyor 🚀');
});

// ✅ 1️⃣ Mezataları bitirme cronjob endpoint'i
app.post('/cron/end-auctions', async (req, res) => {
  try {
    const now = new Date();

    const expiredAuctions = await Auction.find({
      endsAt: { $lte: now },
      isEnded: false,
    });

    for (const auction of expiredAuctions) {
      const highestBid = await Bid.findOne({ auction: auction._id }).sort({ amount: -1 });

      auction.isEnded = true;

      if (highestBid) {
        auction.winner = highestBid.user;
        auction.paymentDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await auction.save();

        console.log(`✅ Mezat ${auction._id} bitti. Kazanan kullanıcı: ${highestBid.user}`);

        // Bildirim gönder
        const user = await User.findById(highestBid.user);
        if (user?.notificationToken) {
          await sendExpoPushNotification(
  user.notificationToken,
  'Mezatı Kazandınız!',
  'Tebrikler! 48 saat içinde dekont yüklemeniz gerekiyor.',
  { type: 'auction_won', auctionId: auction._id.toString() },
  user._id
);
        }
      } else {
        await auction.save();
        console.log(`ℹ️ Mezat ${auction._id} bitti ama teklif yok.`);
      }
    }

    console.log('✅ /cron/end-auctions çağrısı tamamlandı.');
    res.send('✅ Auctions ended.');
  } catch (err) {
    console.error('❌ /cron/end-auctions hata:', err);
    res.status(500).send('❌ Error ending auctions.');
  }
});

// ✅ 2️⃣ Dekont kontrolü ve banlama cronjob endpoint'i
app.post('/cron/check-receipts', async (req, res) => {
  try {
    const now = new Date();

    const expiredAuctions = await Auction.find({
      paymentDeadline: { $lte: now },
      receiptUploaded: false,
      isBannedProcessed: false,
      winner: { $ne: null }
    });

    for (const auction of expiredAuctions) {
      const winnerId = auction.winner;

      const user = await User.findById(winnerId);
      if (!user) continue;

      // Kullanıcıyı banla
      user.isBanned = true;
      await user.save();

      // Mezatı işaretle
      auction.isBannedProcessed = true;
      await auction.save();

      console.log(`❌ Kullanıcı ${user._id} 48 saat içinde dekont yüklemedi → BANLANDI`);

      // Push bildirimi
      if (user.notificationToken) {
  await sendExpoPushNotification(
  user.notificationToken,
  'Hesabınız askıya alındı',
  '48 saat içinde dekont yüklemediğiniz için hesabınız 7 günlüğüne geçici olarak askıya alındı.',
  { type: 'ban', userId: user._id.toString() },user._id
);

  console.log(`📩 Push bildirimi gönderildi → ${user.email || user._id}`);
} else {
  console.log(`⚠️ Kullanıcının notificationToken'ı yok → ${user.email || user._id}`);
}

    }

    console.log('✅ /cron/check-receipts çağrısı tamamlandı.');
    res.send('✅ Receipts checked.');
  } catch (err) {
    console.error('❌ /cron/check-receipts hata:', err);
    res.status(500).send('❌ Error checking receipts.');
  }
});

// ✅ MongoDB bağlantısı ve sunucu başlat
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('MongoDB bağlantısı başarılı');
    app.listen(PORT, () => console.log(`Sunucu çalışıyor: http://localhost:${PORT}`));
  })
  .catch((err) => console.error('MongoDB bağlantı hatası:', err));
