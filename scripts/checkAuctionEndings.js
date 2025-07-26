// backend/scripts/checkAuctionEndings.js

const mongoose = require('mongoose');
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const User = require('../models/User');
const { sendExpoPushNotification } = require('../utils/expoPush');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('🔌 MongoDB bağlantısı başarılı (cron)');
  runCron();
}).catch((err) => {
  console.error('❌ MongoDB bağlantı hatası:', err);
});

async function runCron() {
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

        // 🔔 Alıcıya bildirim gönder
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

    console.log('✅ Cron tamamlandı.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Cron çalıştırılırken hata:', err);
    process.exit(1);
  }
}
