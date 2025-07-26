// models/Rating.js
const mongoose = require('mongoose');
const ratingSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  auction: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction' },
  score: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Rating', ratingSchema);
