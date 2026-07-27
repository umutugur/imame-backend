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

// ── Tüm mezatlar (Mezatlar + Dekontlar bölümlerinin ortak kaynağı) ──
router.get('/api/admin/auctions', requireAuth(['admin']), async (req, res) => {
  try {
    const limit = clampLimit(req.query.limit);
    const page = pageOf(req.query.page);
    const filter = {};

    if (req.query.status === 'active') filter.isEnded = false;
    else if (req.query.status === 'ended') filter.isEnded = true;

    if (req.query.seller && mongoose.Types.ObjectId.isValid(req.query.seller)) {
      filter.seller = req.query.seller;
    }
    if (req.query.q) {
      filter.title = { $regex: String(req.query.q).trim(), $options: 'i' };
    }

    const [items, total] = await Promise.all([
      Auction.find(filter)
        .select(
          '_id title currentPrice startingPrice endsAt images isSigned isEnded ' +
          'receiptStatus receiptUrl paymentDeadline impressionCount bidCount winner seller createdAt'
        )
        .populate('winner', 'name email phone')
        .populate('seller', 'companyName email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Auction.countDocuments(filter),
    ]);

    res.json({ ok: true, items, total, page, limit });
  } catch (e) {
    console.error('Admin mezat listesi hatası:', e);
    res.status(500).json({ ok: false, message: 'Mezatlar alınamadı' });
  }
});

// ── Satıcılar + performans (tek aggregate; panel N+1 sorgu atmasın diye) ──
router.get('/api/admin/sellers', requireAuth(['admin']), async (req, res) => {
  try {
    const sellers = await User.find({ role: 'seller' })
      .select('_id name companyName email createdAt isBanned')
      .sort({ createdAt: -1 })
      .lean();

    const stats = await Auction.aggregate([
      { $group: {
          _id: '$seller',
          auctionCount: { $sum: 1 },
          activeCount: { $sum: { $cond: [{ $eq: ['$isEnded', false] }, 1, 0] } },
          impressions: { $sum: '$impressionCount' },
          bids: { $sum: '$bidCount' },
          revenue: { $sum: { $cond: [
            { $and: [{ $eq: ['$isEnded', true] }, { $eq: ['$receiptStatus', 'approved'] }] },
            '$currentPrice', 0] } },
      } },
    ]);
    const byId = new Map(stats.map((s) => [String(s._id), s]));

    const items = sellers.map((s) => {
      const st = byId.get(String(s._id)) || {};
      return {
        ...s,
        auctionCount: st.auctionCount || 0,
        activeCount: st.activeCount || 0,
        impressions: st.impressions || 0,
        bids: st.bids || 0,
        revenue: st.revenue || 0,
      };
    });

    res.json({ ok: true, items });
  } catch (e) {
    console.error('Admin satıcı listesi hatası:', e);
    res.status(500).json({ ok: false, message: 'Satıcılar alınamadı' });
  }
});

module.exports = router;
