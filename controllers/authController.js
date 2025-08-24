const User = require('../models/User');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { verifyAppleIdToken } = require('../helpers/verifyAppleIdToken');

// Kullanıcı Kaydı
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, ...otherInfo } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Bu e-posta zaten kayıtlı.' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role,
      ...otherInfo,
    });

    await newUser.save();
    res.status(201).json({ message: 'Kayıt başarılı.' });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası.', error: err.message });
  }
};

// Normal Giriş (👉 satıcı paneli için JWT burada üretiliyor)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Geçersiz e-posta.' });
    if (user.isBanned) return res.status(403).json({ message: 'Hesabınız banlanmıştır.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Hatalı şifre.' });

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

      if (user.isBanned) {
        return res.status(403).json({ message: 'Hesabınız banlı.' });
      }

      return res.status(200).json({
        message: 'Giriş başarılı.',
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

      if (user.isBanned) {
        return res.status(403).json({ message: 'Hesabınız banlı.' });
      }

      return res.status(200).json({
        message: 'Giriş başarılı.',
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

