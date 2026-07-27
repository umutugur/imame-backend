// logs.js — denetim günlüğü görüntüleyici (§4.6).
import { apiJson } from '/panel-shared/api.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ACTION_LABEL = {
  ban: 'Ban',
  unban: 'Ban kaldırma',
  role_change: 'Rol değişimi',
  auction_delete: 'Mezat silme',
  receipt_approve: 'Dekont onayı',
  receipt_reject: 'Dekont reddi',
  notification_send: 'Bildirim gönderimi',
  bulk_ban: 'Toplu ban',
  bulk_unban: 'Toplu ban kaldırma',
  bulk_auction_delete: 'Toplu mezat silme',
  seller_create: 'Satıcı oluşturma',
};

const TARGET_LABEL = { user: 'Kullanıcı', auction: 'Mezat', broadcast: 'Duyuru' };

function metaSummary(log) {
  const m = log.meta || {};
  const parts = [];
  if (m.from || m.to) parts.push(`${m.from || '?'} → ${m.to || '?'}`);
  if (m.durationDays) parts.push(`${m.durationDays} gün`);
  else if (log.action === 'ban' || log.action === 'bulk_ban') parts.push('süresiz');
  if (m.reason) parts.push(`sebep: ${m.reason}`);
  return escapeHtml(parts.join(' · '));
}

function rowHtml(log) {
  const actor = log.actor || {};
  return `
    <tr>
      <td class="sub">${log.createdAt ? new Date(log.createdAt).toLocaleString('tr-TR') : '—'}</td>
      <td><div class="ttl">${escapeHtml(actor.name || log.actorEmail || 'Bilinmiyor')}</div>
          <div class="sub">${escapeHtml(actor.email || log.actorEmail || '')}</div></td>
      <td><span class="pill neutral">${escapeHtml(ACTION_LABEL[log.action] || log.action)}</span></td>
      <td class="sub">${escapeHtml(TARGET_LABEL[log.targetType] || log.targetType || '—')}${log.targetId ? ' · ' + String(log.targetId).slice(-6) : ''}</td>
      <td class="sub">${metaSummary(log)}</td>
    </tr>`;
}

export async function loadLogs() {
  const params = new URLSearchParams({ limit: '50' });
  const action = $('logAction').value;
  if (action) params.set('action', action);

  const data = await apiJson('/api/admin/logs?' + params.toString());
  const items = data.items || [];
  $('logRows').innerHTML = items.map(rowHtml).join('');
  $('logsMsg').textContent = items.length
    ? `${items.length} / ${data.total} kayıt gösteriliyor`
    : 'Kayıt bulunamadı.';
}

export function initLogs() {
  $('logAction').addEventListener('change', () => {
    loadLogs().catch((e) => { if (e.message !== 'unauthorized') $('logsMsg').textContent = e.message; });
  });
}
