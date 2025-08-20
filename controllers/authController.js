const User = require('../models/User');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const jwt = require('jsonwebtoken');

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

// Normal Giriş
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Geçersiz e-posta.' });
    if (user.isBanned) return res.status(403).json({ message: 'Hesabınız banlanmıştır.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Hatalı şifre.' });

    res.status(200).json({
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
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası.', error: err.message });
  }
};

// Sosyal Giriş (Google veya Apple)
exports.socialLogin = async (req, res) => {
  const { provider, accessToken, idToken, email: bodyEmail, name: bodyName } = req.body;

  try {
    if (provider === 'google') {
      // Google kimlik doğrulaması
      let googleUser = null;

      if (idToken) {
        // idToken varsa Google tokeninfo endpointi ile doğrula
        const response = await axios.get(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
        );
        googleUser = response.data;
      } else if (accessToken) {
        // accessToken varsa userinfo endpointinden kullanıcı bilgilerini al
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

      // Kullanıcıyı bul veya oluştur
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
    } else if (provider === 'apple') {
      // Apple kimlik doğrulaması
      if (!idToken) {
        return res.status(400).json({ message: 'Apple idToken eksik.' });
      }

      // Token’ı decode et (güvenli doğrulama için apple-signin-auth kullanabilirsiniz)
      const decoded = jwt.decode(idToken, { complete: true });
      const appleEmail = decoded?.payload?.email || bodyEmail;
      const appleSub = decoded?.payload?.sub;
      if (!appleEmail || !appleSub) {
        return res.status(400).json({ message: 'Apple kimlik doğrulaması başarısız.' });
      }

      // Kullanıcıyı bul veya oluştur
      let user = await User.findOne({ email: appleEmail });
      if (!user) {
        user = new User({
          name: bodyName || '', // Apple adı sadece ilk girişte gelebilir
          email: appleEmail,
          appleId: appleSub,
          role: 'buyer',
        });
        await user.save();
      }

      if (user.isBanned) {
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
    } else {
      // Desteklenmeyen sağlayıcı
      return res.status(400).json({ message: 'Desteklenmeyen sağlayıcı.' });
    }
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
