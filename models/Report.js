const mongoose = require('mongoose');
const reportSchema = new mongoose.Schema({
  reportedSeller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: String
}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);
