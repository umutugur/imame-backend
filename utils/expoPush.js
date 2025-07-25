// utils/expoPush.js
const fetch = require('node-fetch');
const NotificationModel = require('../models/Notification');

const sendExpoPushNotification = async (expoPushToken, title, body, data = {}, userId) => {
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

    await response.json();

    // Bildirimi DB'ye kaydet (userId varsa)
    if (userId) {
      await NotificationModel.create({
        user: userId,
        title,
        message: body,
        data,
        isRead: false,
      });
    }

    console.log(`📩 Expo bildirimi gönderildi: ${title} → ${expoPushToken}`);
  } catch (error) {
    console.error('❌ Expo bildirim gönderme hatası:', error);
  }
};

module.exports = { sendExpoPushNotification };
