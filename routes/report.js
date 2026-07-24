// routes/report.js
const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const { requireAuth } = require('../middlewares/auth');

// Şikayet oluşturma (POST)
router.post('/', requireAuth(), async (req, res) => {
  try {
    const { reportedSeller, message } = req.body;
    // Şikayet eden kimliği her zaman istek sahibinden alınır, body'den güvenilmez.
    const reporter = req.user.id;
    const report = new Report({ reportedSeller, reporter, message });
    await report.save();
    res.status(201).json({ message: 'Şikayet kaydedildi.' });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

// Tüm şikayetleri listele (GET)
router.get('/', requireAuth(['admin']), async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('reportedSeller', 'name email') // rapor edilen kullanıcının adı ve e-postası
      .populate('reporter', 'name email')       // raporu yazan kullanıcının adı ve e-postası
      .sort({ createdAt: -1 });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

module.exports = router;
