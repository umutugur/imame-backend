const express = require('express');
const router = express.Router();
const DeviceToken = require('../models/DeviceToken');

// Misafir/anon cihaz token kaydı
router.post('/register', async (req, res) => {
  try {
    const { token, platform, app } = req.body;
    if (!token) return res.status(400).json({ message: 'token gerekli' });

    const doc = await DeviceToken.findOneAndUpdate(
      { token },
      { $set: { platform: platform || 'ios', app: app || 'imame', lastSeenAt: new Date() } },
      { new: true, upsert: true }
    );
    res.json({ ok: true, token: doc.token });
  } catch (e) {
    res.status(500).json({ message: 'register failed', error: e.message });
  }
});

// Opsiyonel: cihaz kaydını sil
router.post('/unregister', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'token gerekli' });
    await DeviceToken.deleteOne({ token });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'unregister failed', error: e.message });
  }
});

module.exports = router;