// utils/expoPush.js
const fetch = require('node-fetch');

const sendExpoPushNotification = async (expoPushToken, title, body, data = {}) => {
  try {
    const message = {
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data,
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log(`📩 Expo bildirimi gönderildi: ${title} → ${expoPushToken}`);
    return result;
  } catch (error) {
    console.error('❌ Expo bildirim gönderme hatası:', error);
  }
};

module.exports = { sendExpoPushNotification };
