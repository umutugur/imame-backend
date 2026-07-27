// models/AdminLog.js
// Yönetici eylemlerinin kalıcı denetim kaydı. TTL YOKTUR — amacı kalıcılıktır.
const mongoose = require('mongoose');

const adminLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorEmail: { type: String },
  action: {
    type: String,
    required: true,
    enum: [
      'ban', 'unban', 'role_change', 'auction_delete',
      'receipt_approve', 'receipt_reject', 'notification_send',
      'bulk_ban', 'bulk_unban', 'bulk_auction_delete',
    ],
  },
  targetType: { type: String }, // 'user' | 'auction' | 'broadcast'
  targetId: { type: mongoose.Schema.Types.ObjectId },
  meta: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
});

adminLogSchema.index({ createdAt: -1 });
adminLogSchema.index({ actor: 1, createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AdminLog', adminLogSchema);
