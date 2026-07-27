// utils/adminLog.js
// Yönetici eylemini denetim günlüğüne yazar.
// FIRE-AND-FORGET: çağıran await ETMEZ; günlük yazımı başarısız olursa asıl işlem bozulmaz.
const AdminLog = require('../models/AdminLog');

function logAdminAction(req, { action, targetType, targetId, meta = {} }) {
  const actorId = req && req.user && req.user.id;
  if (!actorId) return;

  AdminLog.create({
    actor: actorId,
    actorEmail: (req.user && req.user.email) || undefined,
    action,
    targetType,
    targetId,
    meta,
  }).catch((e) => {
    console.error('⚠️ Denetim kaydı yazılamadı:', action, e.message);
  });
}

module.exports = { logAdminAction };
