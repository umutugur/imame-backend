const express = require('express');
const router = express.Router();
const Report = require('../models/Report');

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
module.exports = router;