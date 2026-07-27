// receipts.js — tüm satıcılar genelinde dekont incelemesi. Mantık seller/js/orders.js ile
// aynıdır (aciliyet sıralaması, filtreler, onayla/reddet); ek olarak satıcı adı gösterilir.
import { apiJson } from '/panel-shared/api.js';

const $ = (id) => document.getElementById(id);
const fmtTL = (n) => '₺' + Number(n || 0).toLocaleString('tr-TR');
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let all = [];
let cache = [];

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

function priority(a) {
  const st = (a.receiptStatus || '').toLowerCase();
  if (a.receiptUrl && st === 'pending') return 0;
  if (!a.receiptUrl && !remaining(a.paymentDeadline).over) return 1;
  return 2;
}

function matches(a, mode) {
  const st = (a.receiptStatus || '').toLowerCase();
  if (mode === 'pending') return !!a.receiptUrl && st === 'pending';
  if (mode === 'hasReceipt') return !!a.receiptUrl;
  if (mode === 'expired') return !a.receiptUrl && remaining(a.paymentDeadline).over;
  return true;
}

function rowHtml(a) {
  const w = a.winner || {};
  const seller = a.seller || {};
  const r = remaining(a.paymentDeadline);
  const pending = a.receiptUrl && (a.receiptStatus || '').toLowerCase() === 'pending';
  const risky = !a.receiptUrl && r.over;
  return `
    <tr data-id="${a._id}">
      <td><div class="ttl">${escapeHtml(a.title)}</div>
          <div class="sub">${new Date(a.endsAt).toLocaleDateString('tr-TR')}</div></td>
      <td class="sub">${escapeHtml(seller.companyName || seller.email || '—')}</td>
      <td><div class="ttl">${escapeHtml(w.name || 'Bilinmiyor')}</div>
          <div class="sub">${escapeHtml(w.phone || w.email || '')}</div></td>
      <td class="num">${fmtTL(a.currentPrice)}</td>
      <td>${risky ? '<span class="pill danger">Süre doldu</span>' : `<span class="sub">${r.text}</span>`}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          ${a.receiptUrl ? `<img class="thumb act-view" src="${escapeHtml(a.receiptUrl)}" title="Dekontu büyüt" style="cursor:zoom-in;width:34px;height:34px">` : ''}
          ${statusPill(a)}
        </div>
      </td>
      <td style="white-space:nowrap">
        ${pending ? '<button class="btn btn-primary btn-sm act-ok">Onayla</button><button class="btn btn-danger btn-sm act-no">Reddet</button>' : ''}
      </td>
    </tr>`;
}

function applyFilter() {
  const mode = ($('recFilter') && $('recFilter').value) || 'all';
  cache = all.filter((a) => matches(a, mode));
  $('recRows').innerHTML = cache.map(rowHtml).join('');

  const counts = {
    pending: all.filter((a) => matches(a, 'pending')).length,
    hasReceipt: all.filter((a) => matches(a, 'hasReceipt')).length,
    expired: all.filter((a) => matches(a, 'expired')).length,
  };
  $('recMsg').textContent = all.length
    ? `${cache.length} / ${all.length} kayıt gösteriliyor · ${counts.hasReceipt} dekontlu · ${counts.pending} onay bekliyor · ${counts.expired} süresi dolmuş`
    : 'Sonuçlanmış mezat yok.';
}

export async function loadReceipts() {
  const data = await apiJson('/api/admin/auctions?status=receipts&limit=100');
  const items = data.items || [];
  all = items.filter((a) => a.isEnded && a.winner);
  all.sort((a, b) => {
    const p = priority(a) - priority(b);
    if (p !== 0) return p;
    return new Date(b.endsAt) - new Date(a.endsAt);
  });
  applyFilter();
}

export function initReceipts() {
  $('recFilter').addEventListener('change', applyFilter);

  $('recRows').addEventListener('click', async (e) => {
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
      await loadReceipts();
    } catch (err) {
      if (err.message !== 'unauthorized') $('recMsg').textContent = err.message;
    }
  });
}
