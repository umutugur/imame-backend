const admin = require('../utils/firebaseAdmin');
const User = require('../models/User');

exports.sendPushNotification = async (req, res) => {
  const { title, message, toAllBuyers, toAllSellers, email } = req.body;

  try {
    let users = [];

    if (email) {
      const user = await User.findOne({ email });
      if (user && user.notificationToken) users.push(user);
    } else {
      const roles = [];
      if (toAllBuyers) roles.push('buyer');
      if (toAllSellers) roles.push('seller');

      if (roles.length > 0) {
        users = await User.find({ role: { $in: roles }, notificationToken: { $exists: true, $ne: null } });
      }
    }

    if (users.length === 0) {
      return res.status(404).json({ message: 'Bildirim gönderilecek kullanıcı bulunamadı.' });
    }

    const messages = users.map((user) => ({
      to: user.notificationToken,
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

    const result = await response.json();
    res.status(200).json({ message: 'Bildirim(ler) gönderildi', result });
  } catch (err) {
    console.error('Bildirim gönderme hatası:', err);
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
};
