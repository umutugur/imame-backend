const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
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

    // sadece satıcılar için geçerli alanlar
    companyName: String,
    authorizedName: String,
    iban: String,
    ibanName: String,
    bankName: String,

    // sosyal giriş destek alanları
    googleId: String,
    facebookId: String,
    appleId: String,   // Apple Sign In için benzersiz kimlik
    avatar: String,

    // hangi yöntemle kayıt/giriş yaptığını takip etmek isterseniz:
    provider: {
      type: String,
      enum: ['email', 'google', 'facebook', 'apple'],
      default: 'email',
    },

    // 🔔 Bildirim token'ı
    notificationToken: String,

    // kullanıcı durumu
    isBanned: {
      type: Boolean,
      default: false,
    },

    // kullanıcının favori satıcıları (buyer için)
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
