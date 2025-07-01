const User = require('../models/User');
const bcrypt = require('bcryptjs');
const axios = require('axios');

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
        address: user.address || {},   // Nesne olarak döndür
        phone: user.phone || '',
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Sunucu hatası.', error: err.message });
  }
};

// Google / Facebook Giriş
exports.socialLogin = async (req, res) => {
  const { provider, accessToken } = req.body;

  try {
    let profile;

    if (provider === 'google') {
      const response = await axios.get(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`);
      const { email, name, sub } = response.data;
      profile = { email, name, googleId: sub };
    }
    else if (provider === 'facebook') {
      const response = await axios.get(`https://graph.facebook.com/me?fields=id,name,email&access_token=${accessToken}`);
      const { id, name, email } = response.data;
      profile = { email, name, facebookId: id };
    }
    else {
      return res.status(400).json({ message: 'Geçersiz provider.' });
    }

    let user = await User.findOne({ email: profile.email });

    if (!user) {
      user = new User({
        name: profile.name,
        email: profile.email,
        googleId: profile.googleId,
        facebookId: profile.facebookId,
        role: 'buyer',
      });

      await user.save();
    }

    if (user.isBanned) {
      return res.status(403).json({ message: 'Hesabınız banlanmıştır.' });
    }

    return res.status(200).json({
      message: 'Sosyal giriş başarılı.',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        address: user.address || {},  // Nesne olarak döndür
        phone: user.phone || '',
      },
    });
  } catch (err) {
    console.error('Sosyal giriş hatası:', err.message);
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
