const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    email: { type: String, trim: true, lowercase: true }, // required yok
    password: { type: String },

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

    // satıcı alanları
    companyName: String,
    authorizedName: String,
    iban: String,
    ibanName: String,
    bankName: String,

    // sosyal giriş alanları
    googleId: { type: String, unique: true, sparse: true, index: true },
    appleId:  { type: String, unique: true, sparse: true, index: true },
    // Eğer facebook da kullanacaksan aç:
    facebookId: { type: String, unique: true, sparse: true, index: true },

    avatar: String,

    provider: {
      type: String,
      enum: ['email', 'google', 'facebook', 'apple'],
      default: 'email',
    },

    // 🔔 Bildirim token'ı
    notificationToken: String,

    // kullanıcı durumu
    isBanned: { type: Boolean, default: false },
    bannedUntil: { type: Date, default: null },
    banReason: { type: String, default: null },

    // şifre sıfırlama (6 haneli kod)
    resetCode: { type: String, default: null },
    resetCodeExpires: { type: Date, default: null },

    // favoriler
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Apple e-posta dönmediyse işaretle
    emailMissing: { type: Boolean, default: false },
    isPlaceholderEmail: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// email için unique + sparse (önceki unique email indeksini düşürmen gerekebilir)
userSchema.index({ email: 1 }, { unique: true, sparse: true });

// En az bir kimlik: email veya sosyal ID'lerden biri
userSchema.pre('validate', function (next) {
  const hasAnyId =
    !!this.email || !!this.googleId || !!this.appleId /* || !!this.facebookId */;
  if (!hasAnyId) {
    return next(new Error('Kullanıcı için email veya sosyal kimlik zorunludur.'));
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
