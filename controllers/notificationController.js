// controllers/notificationController.js
const User = require('../models/User');
const DeviceToken = require('../models/DeviceToken'); // 👈 DÜZELTME: Device yerine DeviceToken
const fetch = require('node-fetch');

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

exports.sendPushNotification = async (req, res) => {
  const { title, message, toAllBuyers, toAllSellers, email, includeGuests } = req.body;

  try {
    let users = [];
    let deviceTokens = [];

    if (email) {
      // Tek kullanıcıya gönderim
      const user = await User.findOne({ email: email.trim().toLowerCase() });

      if (!user) {
        return res.status(404).json({ message: 'Seçili kullanıcı bulunamadı.' });
      }
      if (!user.notificationToken) {
        return res.status(404).json({ message: 'Seçili kullanıcı için push bildirimi mevcut değil.' });
      }
      users.push(user);
    } else {
      // Toplu gönderim: roller ve/veya misafir cihazlar
      const roles = [];
      if (toAllBuyers) roles.push('buyer');
      if (toAllSellers) roles.push('seller');

      // Rol seçilmişse ilgili kullanıcıların token’larını al
      if (roles.length > 0) {
        users = await User.find({
          role: { $in: roles },
          notificationToken: { $exists: true, $ne: null },
        }).select('notificationToken');
      }

      // “Tümünü seç” (alıcı + satıcı) ise misafirleri de otomatik ekle
      const includeGuestsFinal = !!includeGuests || (toAllBuyers && toAllSellers);

      if (includeGuestsFinal) {
        // DeviceToken koleksiyonundan kayıtlı tüm expo token’larını çek
        const devices = await DeviceToken.find({
          token: { $exists: true, $ne: null },
        }).select('token');
        deviceTokens = devices.map((d) => d.token).filter(Boolean);
      }

      // Eğer hiçbir hedef seçilmemişse kullanıcıya bilgi ver
      if (roles.length === 0 && !includeGuestsFinal) {
        return res.status(400).json({ message: 'Alıcı grubu seçin veya e-posta girin.' });
      }
    }

    // Tüm token’ları birleştirip uniq yap
    const userTokens = users.map((u) => u.notificationToken).filter(Boolean);
    const allTokens = Array.from(new Set([...userTokens, ...deviceTokens]));

    if (allTokens.length === 0) {
      return res.status(404).json({ message: 'Bildirim gönderilecek token bulunamadı.' });
    }

    // Expo push: 99-100’lük paketler halinde gönder
    const batches = chunk(allTokens, 99);
    const results = [];

    for (const batch of batches) {
      const messages = batch.map((token) => ({
        to: token,
        sound: 'default',
        title,
        body: message,
      }));

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      const result = await response.json().catch(() => ({}));
      results.push(result);
    }

    res.status(200).json({
      message: 'Bildirim(ler) gönderildi',
      counts: {
        totalTokens: allTokens.length,
        batches: batches.length,
        userTokens: userTokens.length,
        guestDeviceTokens: deviceTokens.length,
      },
      results,
    });
  } catch (err) {
    console.error('Bildirim gönderme hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
};