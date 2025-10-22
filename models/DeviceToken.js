const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  platform: { type: String, enum: ['ios','android','web'], default: 'ios' },
  app: { type: String, default: 'imame' },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);