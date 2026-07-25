// orders.js — biten mezatların kazanan ve ödeme takibi.
import { apiJson } from './api.js';

const $ = (id) => document.getElementById(id);
const fmtTL = (n) => '₺' + Number(n || 0).toLocaleString('tr-TR');
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let cache = [];
let onChangedCb = () => {};

function remaining(deadline) {
  if (!deadline) return { text: '—', over: false };
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { text: 'Süre doldu', over: true };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return { text: `${h}s ${m}dk`, over: false };
}

function statusPill(a) {
  const st = (a.receiptStatus || '').toLowerCase();
  if (!a.receiptUrl) return '<span class="pill neutral">Yüklenmedi</span>';
  if (st === 'approved') return '<span class="pill ok">Onaylandı</span>';
  if (st === 'rejected') return '<span class="pill danger">Reddedildi</span>';
  return '<span class="pill warn">Bekliyor</span>';
}

function rowHtml(a) {
  const w = a.winner || {};
  const r = remaining(a.paymentDeadline);
  const pending = a.receiptUrl && (a.receiptStatus || '').toLowerCase() === 'pending';
  const risky = !a.receiptUrl && r.over;
  return `
    <tr data-id="${a._id}">
      <td><div class="ttl">${escapeHtml(a.title)}</div>
          <div class="sub">${new Date(a.endsAt).toLocaleDateString('tr-TR')}</div></td>
      <td><div class="ttl">${escapeHtml(w.name || 'Bilinmiyor')}</div>
          <div class="sub">${escapeHtml(w.phone || w.email || '')}</div></td>
      <td class="num">${fmtTL(a.currentPrice)}</td>
      <td>${risky ? '<span class="pill danger">Süre doldu</span>' : `<span class="sub">${r.text}</span>`}</td>
      <td>${statusPill(a)}
          ${a.receiptUrl ? '<button class="btn btn-ghost btn-sm act-view" style="margin-left:6px">Gör</button>' : ''}</td>
      <td style="white-space:nowrap">
        ${pending ? `<button class="btn btn-primary btn-sm act-ok">Onayla</button>
                     <button class="btn btn-danger btn-sm act-no">Reddet</button>` : ''}
      </td>
    </tr>`;
}

export function renderOrders(items, { onChanged } = {}) {
  if (onChanged) onChangedCb = onChanged;
  cache = items.filter((a) => a.isEnded && a.winner);
  // Önce işlem bekleyenler, sonra süresi yaklaşanlar
  cache.sort((a, b) => new Date(a.paymentDeadline || a.endsAt) - new Date(b.paymentDeadline || b.endsAt));
  $('orderRows').innerHTML = cache.map(rowHtml).join('');
  $('ordersMsg').textContent = cache.length ? '' : 'Sonuçlanmış mezatınız yok.';
}

$('orderRows').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const a = cache.find((x) => x._id === tr.dataset.id);
  if (!a) return;

  if (e.target.classList.contains('act-view')) {
    $('modalImg').src = a.receiptUrl;
    $('imgModal').classList.add('open');
    return;
  }
  const approve = e.target.classList.contains('act-ok');
  const reject = e.target.classList.contains('act-no');
  if (!approve && !reject) return;

  try {
    await apiJson(`/api/receipts/${a._id}/${approve ? 'approve' : 'reject'}`, { method: 'PATCH' });
    onChangedCb();
  } catch (err) {
    if (err.message !== 'unauthorized') $('ordersMsg').textContent = err.message;
  }
});
