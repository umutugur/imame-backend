const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../firebase-adminsdk.json'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// 🔔 Bildirim gönderme fonksiyonu
const sendNotificationToUser = async (token, title, body, data = {}) => {
  try {
    await admin.messaging().send({
      token,
      notification: {
        title,
        body,
      },
      data: {
        ...data,
      },
    });
    console.log(`📩 Bildirim gönderildi: ${title} → ${token}`);
  } catch (error) {
    console.error('❌ Bildirim gönderme hatası:', error);
  }
};

module.exports = {
  admin,
  sendNotificationToUser,
};
