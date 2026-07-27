// routes/admin.js — yönetici uçları. Hepsi requireAuth(['admin']) ile korunur.
const express = require('express');
const mongoose = require('mongoose');
const { requireAuth } = require('../middlewares/auth');
const { logAdminAction } = require('../utils/adminLog');
const Auction = require('../models/Auction');
const User = require('../models/User');
const Bid = require('../models/Bid');
const AdminLog = require('../models/AdminLog');
const { sendExpoPushNotification } = require('../utils/expoPush');

const router = express.Router();
const TZ_OFFSET_H = 3; // Türkiye kalıcı UTC+3

// Europe/Istanbul gün/hafta sınırları (satıcı paneliyle aynı tanım)
function istanbulBounds() {
  const now = new Date();
  const shifted = new Date(now.getTime() + TZ_OFFSET_H * 3600 * 1000);
  const y = shifted.getUTCFullYear(), m = shifted.getUTCMonth(), d = shifted.getUTCDate();
  const startToday = new Date(Date.UTC(y, m, d, 0, 0, 0));
  const wd = new Date(Date.UTC(y, m, d, 12, 0, 0)).getUTCDay(); // 0=Paz
  const shift = wd === 0 ? -6 : 1 - wd;                          // Pazartesi başlangıç
  const startWeek = new Date(Date.UTC(y, m, d + shift, 0, 0, 0));
  const startPrevWeek = new Date(startWeek.getTime() - 7 * 24 * 3600 * 1000);
  return { startToday, startWeek, startPrevWeek };
}

const clampLimit = (v, def = 50, max = 100) =>
  Math.min(Math.max(parseInt(v, 10) || def, 1), max);
const pageOf = (v) => Math.max(parseInt(v, 10) || 1, 1);

// ── Platform genel bakışı ──
router.get('/api/admin/overview', requireAuth(['admin']), async (req, res) => {
  try {
    const { startToday, startWeek, startPrevWeek } = istanbulBounds();

    const [
      activeNow, createdToday, endedToday, createdThisWeek,
      totalUsers, newThisWeek, bannedUsers, sellers,
      exposureAgg, revenueAgg, paymentAgg,
    ] = await Promise.all([
      Auction.countDocuments({ isEnded: false }),
      Auction.countDocuments({ createdAt: { $gte: startToday } }),
      Auction.countDocuments({ isEnded: true, endsAt: { $gte: startToday } }),
      Auction.countDocuments({ createdAt: { $gte: startWeek } }),
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startWeek } }),
      User.countDocuments({ isBanned: true }),
      User.countDocuments({ role: 'seller' }),
      Auction.aggregate([
        { $group: { _id: null, impressions: { $sum: '$impressionCount' }, bids: { $sum: '$bidCount' } } },
      ]),
      Auction.aggregate([
        { $match: { isEnded: true, receiptStatus: 'approved' } },
        { $group: {
            _id: null,
            today: { $sum: { $cond: [{ $gte: ['$endsAt', startToday] }, '$currentPrice', 0] } },
            thisWeek: { $sum: { $cond: [{ $gte: ['$endsAt', startWeek] }, '$currentPrice', 0] } },
            lastWeek: { $sum: { $cond: [
              { $and: [{ $gte: ['$endsAt', startPrevWeek] }, { $lt: ['$endsAt', startWeek] }] },
              '$currentPrice', 0] } },
        } },
      ]),
      Auction.aggregate([
        { $match: { isEnded: true, winner: { $ne: null } } },
        { $group: {
            _id: null,
            endedWithWinner: { $sum: 1 },
            receiptUploaded: { $sum: { $cond: [{ $ifNull: ['$receiptUrl', false] }, 1, 0] } },
            expiredUnpaid: { $sum: { $cond: [
              { $and: [
                { $not: [{ $ifNull: ['$receiptUrl', false] }] },
                { $lt: ['$paymentDeadline', new Date()] },
              ] }, 1, 0] } },
        } },
      ]),
    ]);

    const exposure = exposureAgg[0] || { impressions: 0, bids: 0 };
    const revenue = revenueAgg[0] || { today: 0, thisWeek: 0, lastWeek: 0 };
    const payment = paymentAgg[0] || { endedWithWinner: 0, receiptUploaded: 0, expiredUnpaid: 0 };

    res.json({
      ok: true,
      auctions: { activeNow, createdToday, endedToday, createdThisWeek },
      revenue: { today: revenue.today, thisWeek: revenue.thisWeek, lastWeek: revenue.lastWeek },
      users: { total: totalUsers, newThisWeek, banned: bannedUsers, sellers },
      exposure: {
        impressions: exposure.impressions || 0,
        bids: exposure.bids || 0,
        conversion: (exposure.bids || 0) / Math.max(exposure.impressions || 0, 1),
      },
      payment: {
        endedWithWinner: payment.endedWithWinner || 0,
        receiptUploaded: payment.receiptUploaded || 0,
        expiredUnpaid: payment.expiredUnpaid || 0,
      },
    });
  } catch (e) {
    console.error('Admin overview hatası:', e);
    res.status(500).json({ ok: false, message: 'Özet alınamadı' });
  }
});

module.exports = router;
