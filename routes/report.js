// routes/report.js
const express = require('express');
const router = express.Router();
const Report = require('../models/Report');

// Şikayet oluşturma (POST)
router.post('/', async (req, res) => {
  try {
    const { reportedSeller, reporter, message } = req.body;
    const report = new Report({ reportedSeller, reporter, message });
    await report.save();
    res.status(201).json({ message: 'Şikayet kaydedildi.' });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası', error: err.message });
  }
});

// Tüm şikayetleri listele (GET)
router.get('/', async (req, res) => {
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
