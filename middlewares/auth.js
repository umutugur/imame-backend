const jwt = require('jsonwebtoken');
const User = require('../models/User');

function requireAuth(roles = []) {
  return async (req, res, next) => {
    try {
      const hdr = req.headers.authorization || '';
      const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
      if (!token) return res.status(401).json({ message: 'Unauthorized' });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const u = await User.findById(decoded.id).select('role isBanned bannedUntil');
      if (!u) return res.status(401).json({ message: 'Invalid user' });

      const isCurrentlyBanned =
        u.isBanned && (!u.bannedUntil || new Date(u.bannedUntil) > new Date());
      if (isCurrentlyBanned) {
        return res.status(403).json({ message: 'Hesabınız banlı' });
      }

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

// Protects internal cron endpoints. Requires header `x-cron-key` to match
// process.env.CRON_SECRET. Fails closed (503) if the secret isn't configured.
function requireCronKey(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ message: 'Cron endpoint not configured' });
  }
  const provided = req.headers['x-cron-key'];
  if (provided !== secret) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

// Token varsa çözer ve req.user'ı doldurur; yoksa/geçersizse sessizce devam eder.
// Misafir de erişebilen ama girişliye kişiselleşen uçlar için (feed, impressions).
function optionalAuth() {
  return async (req, res, next) => {
    try {
      const hdr = req.headers.authorization || '';
      const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
      if (!token) return next();

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const u = await User.findById(decoded.id).select('role isBanned bannedUntil');
      const stillBanned = u && u.isBanned && (!u.bannedUntil || new Date(u.bannedUntil) > new Date());
      if (u && !stillBanned) {
        req.user = { id: decoded.id, role: u.role, email: decoded.email };
      }
      next();
    } catch (e) {
      next(); // geçersiz token misafir sayılır
    }
  };
}

module.exports = { requireAuth, requireCronKey, optionalAuth };
