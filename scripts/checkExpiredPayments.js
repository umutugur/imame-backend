// backend/scripts/checkExpiredPayments.js

const mongoose = require('mongoose');
const Auction = require('../models/Auction');
const User = require('../models/User');
const admin = require('../utils/firebaseAdmin'); // 🔥 Bildirim için ekledik
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('🔌 MongoDB bağlantısı başarılı (ban cron)');
  runBanCheck();
}).catch((err) => {
  console.error('❌ Mongo bağlantısı başarısız:', err);
});

async function runBanCheck() {
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

      // Kullanıcıyı bul
      const user = await User.findById(winnerId);

      if (!user) continue;

      // Kullanıcıyı banla
      user.isBanned = true;
      await user.save();

      // Mezat üzerinde işaretle
      auction.isBannedProcessed = true;
      await auction.save();

      console.log(`❌ Kullanıcı ${user._id} 48 saat içinde dekont yüklemedi → BANLANDI`);

      // Bildirim gönder
      if (user.notificationToken) {
        await admin.messaging().send({
          token: user.notificationToken,
          notification: {
            title: 'Hesabınız askıya alındı',
            body: '48 saat içinde dekont yüklemediğiniz için hesabınız 7 günlüğüne geçici olarak askıya alındı.',
          },
          data: {
            type: 'ban',
            userId: user._id.toString(),
          },
        });
        console.log(`📩 Push bildirimi gönderildi → ${user.email || user._id}`);
      } else {
        console.log(`⚠️ Kullanıcının pushToken'ı yok → ${user.email || user._id}`);
      }
    }

    console.log('✅ Ban kontrolü tamamlandı.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Ban kontrolünde hata:', err);
    process.exit(1);
  }
}
