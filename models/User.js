const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
  },
  role: {
    type: String,
    enum: ['buyer', 'seller', 'admin'],
    default: 'buyer',
  },
  phone: String,
  address: {
    ilId: Number,
    ilceId: Number,
    mahalleId: Number,
    sokak: String,
    apartmanNo: String,
    daireNo: String,
  },

  // sadece satıcılar için geçerli alanlar:
  companyName: String,
  authorizedName: String,
  iban: String,
  ibanName: String,
  bankName: String,

  // sosyal giriş destek alanları:
  googleId: String,
  facebookId: String,
  avatar: String,

  // 🔔 Bildirim token'ı:
  notificationToken: String,

  // kullanıcı durumu
  isBanned: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
