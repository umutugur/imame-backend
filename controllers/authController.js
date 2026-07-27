const User = require('../models/User');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { verifyAppleIdToken } = require('../helpers/verifyAppleIdToken');
const { sendMail } = require('../utils/mailer');
const { resetPasswordEmail } = require('../utils/emailTemplates');

// Banı süresi dolmuşsa otomatik kaldırır. true dönerse kullanıcı hâlâ banlı demektir.
async function isStillBanned(user) {
  if (!user.isBanned) return false;
  if (user.bannedUntil && user.bannedUntil <= new Date()) {
    user.isBanned = false;
    user.bannedUntil = null;
    await user.save();
    return false;
  }
  return true;
}

// Adres alt nesnesini de beyaz listeden geçirir; ham gövdeyi asla iç içe yaymayız.
function pickAddress(a) {
  if (!a || typeof a !== 'object') return undefined;
  return {
    ilId: a.ilId,
    ilceId: a.ilceId,
    mahalleId: a.mahalleId,
    sokak: a.sokak,
    apartmanNo: a.apartmanNo,
    daireNo: a.daireNo,
  };
}

// Kullanıcı Kaydı (herkese açık — yalnızca alıcı hesabı üretir).
//
// GÜVENLİK: Burası eskiden gövdeyi `...otherInfo` ile olduğu gibi User'a yayıyordu.
// Bu, tokensiz bir isteğin `{"role":"admin"}` göndererek kendine yönetici hesabı
// açmasına izin veriyordu. Artık yalnızca aşağıdaki alanlar okunuyor ve rol
// sunucuda sabitleniyor. Satıcı/yönetici hesabı yalnızca POST /api/admin/sellers
// üzerinden, yönetici oturumuyla açılır.
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'E-posta ve şifre zorunludur.' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Bu e-posta zaten kayıtlı.' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      phone,
      address: pickAddress(address),
      role: 'buyer', // gövdeden gelen rol yok sayılır
    });

    await newUser.save();
    res.status(201).json({ message: 'Kayıt başarılı.' });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası.', error: err.message });
  }
};

exports._pickAddress = pickAddress;

// Normal Giriş (👉 satıcı paneli için JWT burada üretiliyor)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'E-posta veya şifre hatalı.' });

    if (await isStillBanned(user)) {
      return res.status(403).json({ message: 'Hesabınız banlanmıştır.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'E-posta veya şifre hatalı.' });

    // 🔑 JWT: sadece normal login’de
    const token = jwt.sign(
      { id: user._id.toString(), role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      message: 'Giriş başarılı.',
      token, // 👈 seller panel bunu kullanıyor
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        address: user.address || {},
        phone: user.phone || '',
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası.', error: err.message });
  }
};

// Sosyal Giriş (Google veya Apple) — 👉 token YOK (isteğin doğrultusunda)
exports.socialLogin = async (req, res) => {
  const { provider, accessToken, idToken, email: bodyEmail, name: bodyName } = req.body;

  try {
    if (provider === 'google') {
      let googleUser = null;

      if (idToken) {
        const response = await axios.get(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
        );
        googleUser = response.data;
      } else if (accessToken) {
        const response = await axios.get(
          `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`
        );
        googleUser = response.data;
      } else {
        return res.status(400).json({ message: 'idToken veya accessToken eksik.' });
      }

      const { email, name, sub } = googleUser;
      if (!email) {
        return res.status(400).json({ message: 'Email bilgisi alınamadı.' });
      }

      let user = await User.findOne({ email });
      if (!user) {
        user = new User({
          name: name || '',
          email,
          googleId: sub || googleUser.user_id || '',
          role: 'buyer',
        });
        await user.save();
      }

      if (await isStillBanned(user)) {
        return res.status(403).json({ message: 'Hesabınız banlı.' });
      }

      const token = jwt.sign(
        { id: user._id.toString(), role: user.role, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        message: 'Giriş başarılı.',
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          address: user.address || {},
          phone: user.phone || '',
        },
      });
    }

    // --- APPLE ---
    if (provider === 'apple') {
      if (!idToken) {
        return res.status(400).json({ message: 'Apple idToken eksik.' });
      }

      // 1) Tokenı DOĞRULA
      let payload;
      try {
        payload = await verifyAppleIdToken(idToken);
      } catch (e) {
        console.error('❌ Apple token verify error:', e);
        return res.status(401).json({ message: 'Apple kimlik doğrulaması başarısız.' });
      }

      const appleSub = payload?.sub;
      const appleEmail = payload?.email || bodyEmail || null;

      if (!appleSub) {
        return res.status(400).json({ message: 'Apple kimlik doğrulaması başarısız.' });
      }

      // 2) Kullanıcıyı email **veya** appleId ile ara
      const orQuery = [{ appleId: appleSub }];
      if (appleEmail) orQuery.push({ email: appleEmail });

      let user = await User.findOne({ $or: orQuery });

      // 3) Yoksa oluştur (email olmadan da oluşturabil)
      if (!user) {
        user = new User({
          name: bodyName || '',
          email: appleEmail || undefined, // şema opsiyonel ise undefined bırak
          appleId: appleSub,
          role: 'buyer',
          // Aşağıdakiler şemada yoksa eklemeden önce schema’ya ilave et
          // emailMissing: !appleEmail,
          // loginProvider: 'apple',
        });
        await user.save();
      }

      if (await isStillBanned(user)) {
        return res.status(403).json({ message: 'Hesabınız banlı.' });
      }

      const token = jwt.sign(
        { id: user._id.toString(), role: user.role, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(200).json({
        message: 'Giriş başarılı.',
        token,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email || '',
          role: user.role,
          address: user.address || {},
          phone: user.phone || '',
        },
      });
    }

    // Desteklenmeyen sağlayıcı
    return res.status(400).json({ message: 'Desteklenmeyen sağlayıcı.' });
  } catch (err) {
    console.error('❌ Sosyal giriş hatası:', err.response?.data || err.message || err);
    return res.status(500).json({ message: 'Sunucu hatası.', error: err.message });
  }
};
// Profil Güncelleme
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.body._id;
    const { name, surname, phone, address } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'Kullanıcı ID belirtilmeli.' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, surname, phone, address },
      { new: true }
    );

    res.json({
      message: 'Profil güncellendi',
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        surname: updatedUser.surname,
        email: updatedUser.email,
        phone: updatedUser.phone,
        address: updatedUser.address,
        role: updatedUser.role,
      },
    });
  } catch (error) {
    console.error('Profil güncelleme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası', error: error.message });
  }
};

const RESET_CODE_TTL_MS = 15 * 60 * 1000; // 15 dakika
const GENERIC_FORGOT_MESSAGE = 'Eğer bu e-posta kayıtlıysa bir kod gönderildi.';
const GENERIC_RESET_ERROR = 'Kod geçersiz veya süresi dolmuş.';

// Şifremi Unuttum — her zaman aynı genel mesajı döner (enumeration önleme)
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(200).json({ message: GENERIC_FORGOT_MESSAGE });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Sadece email/şifre ile giriş yapan (şifresi olan) kullanıcılar için kod üret
    if (user && user.password) {
      const now = new Date();
      let code = user.resetCode;

      // Süresi dolmamış bir kod varsa aynısını tekrar gönder (naif rate-limit)
      if (!code || !user.resetCodeExpires || user.resetCodeExpires <= now) {
        code = String(crypto.randomInt(100000, 1000000)).padStart(6, '0');
        user.resetCode = code;
        user.resetCodeExpires = new Date(now.getTime() + RESET_CODE_TTL_MS);
        await user.save();
      }

      // Maili BEKLEME: SMTP yavaş/erişilemez olsa bile yanıt anında dönsün,
      // istemci butonu takılmasın. Enumerasyon zaten genel mesajla önlendiğinden
      // yanıt mail sonucuna bağlı değil.
      const mail = resetPasswordEmail(code);
      sendMail({
        to: user.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }).catch((mailErr) => {
        console.error('❌ Şifre sıfırlama e-postası gönderilemedi:', mailErr.message);
      });
    }

    return res.status(200).json({ message: GENERIC_FORGOT_MESSAGE });
  } catch (err) {
    console.error('❌ forgotPassword hatası:', err.message);
    // Enumeration'ı önlemek için hatada da aynı genel mesajı dön
    return res.status(200).json({ message: GENERIC_FORGOT_MESSAGE });
  }
};

// Şifre Sıfırlama — email + 6 haneli kod + yeni şifre
exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body || {};

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: GENERIC_RESET_ERROR });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: 'Şifre en az 6 karakter olmalıdır.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    const isValid =
      user &&
      user.resetCode &&
      user.resetCodeExpires &&
      user.resetCodeExpires > new Date() &&
      String(user.resetCode) === String(code).trim();

    if (!isValid) {
      return res.status(400).json({ message: GENERIC_RESET_ERROR });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetCode = null;
    user.resetCodeExpires = null;
    await user.save();

    return res.status(200).json({ message: 'Şifreniz başarıyla güncellendi.' });
  } catch (err) {
    console.error('❌ resetPassword hatası:', err.message);
    return res.status(500).json({ message: 'Sunucu hatası.', error: err.message });
  }
};

