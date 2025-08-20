const jwt = require('jsonwebtoken');
const User = require('../models/User');

function requireAuth(roles = []) {
  return async (req, res, next) => {
    try {
      const hdr = req.headers.authorization || '';
      const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
      if (!token) return res.status(401).json({ message: 'Unauthorized' });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const u = await User.findById(decoded.id).select('role isBanned');
      if (!u) return res.status(401).json({ message: 'Invalid user' });
      if (u.isBanned) return res.status(403).json({ message: 'Hesabınız banlı' });

      if (roles.length && !roles.includes(u.role)) {
        return res.status(403).json({ message: 'Yetersiz yetki' });
      }

      req.user = { id: decoded.id, role: u.role, email: decoded.email };
      next();
    } catch (e) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  };
}

module.exports = { requireAuth };
