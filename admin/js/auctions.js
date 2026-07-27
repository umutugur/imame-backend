// auctions.js — platform genelindeki tüm mezatlar: filtre, sayfalama, sil, toplu sil.
import { apiJson } from '/panel-shared/api.js';

const $ = (id) => document.getElementById(id);
const fmtTL = (n) => '₺' + Number(n || 0).toLocaleString('tr-TR');
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const conversion = (a) => (a.bidCount || 0) / Math.max(a.impressionCount || 0, 1);

let cache = [];
let selected = new Set();
let lastTotal = 0;
let searchTimer = null;

function rowHtml(a) {
  const conv = conversion(a) * 100;
  const cls = (a.impressionCount || 0) >= 20 && conv < 1 ? 'warn' : conv > 0 ? 'ok' : 'neutral';
  const img = (a.images && a.images[0]) || '';
  const seller = a.seller || {};
  const status = a.isEnded ? 'Sona erdi' : 'Aktif';
  return `
    <tr data-id="${a._id}">
      <td><input type="checkbox" class="act-select"></td>
      <td>${img ? `<img class="thumb" src="${escapeHtml(img)}">` : '<div class="thumb"></div>'}</td>
      <td><div class="ttl">${escapeHtml(a.title || '')}</div>${a.isSigned ? '<div class="sub">Usta imzalı</div>' : ''}</td>
      <td class="sub">${escapeHtml(seller.companyName || seller.email || '—')}</td>
      <td class="num">${fmtTL(a.currentPrice || a.startingPrice)}</td>
      <td class="num">${(a.impressionCount || 0).toLocaleString('tr-TR')}</td>
      <td class="num">${a.bidCount || 0}</td>
      <td><span class="pill ${cls}">%${conv.toFixed(1).replace('.', ',')}</span></td>
      <td><span class="pill ${a.isEnded ? 'neutral' : 'ok'}">${status}</span></td>
      <td style="white-space:nowrap"><button class="btn btn-danger btn-sm act-del">Sil</button></td>
    </tr>`;
}

function updateBulkBar() {
  const bar = $('aucBulkBar');
  bar.classList.toggle('hidden', selected.size === 0);
  $('aucBulkCount').textContent = String(selected.size);
}

export async function loadAuctions() {
  const params = new URLSearchParams({ limit: '50' });
  const status = $('aucStatus').value;
  const seller = $('aucSeller').value;
  const q = $('aucSearch').value.trim();
  if (status) params.set('status', status);
  if (seller) params.set('seller', seller);
  if (q) params.set('q', q);

  const data = await apiJson('/api/admin/auctions?' + params.toString());
  cache = data.items || [];
  lastTotal = data.total || 0;
  selected.clear();
  updateBulkBar();

  $('aucRows').innerHTML = cache.map(rowHtml).join('');
  $('aucMsg').textContent = cache.length
    ? `${cache.length} / ${lastTotal} mezat gösteriliyor`
    : 'Sonuç bulunamadı.';
}

export function initAuctions() {
  $('aucStatus').addEventListener('change', () => {
    loadAuctions().catch((e) => { if (e.message !== 'unauthorized') $('aucMsg').textContent = e.message; });
  });
  $('aucSeller').addEventListener('change', () => {
    loadAuctions().catch((e) => { if (e.message !== 'unauthorized') $('aucMsg').textContent = e.message; });
  });
  $('aucSearch').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadAuctions().catch((e) => { if (e.message !== 'unauthorized') $('aucMsg').textContent = e.message; });
    }, 350);
  });

  $('aucSelectAll').addEventListener('change', (e) => {
    selected.clear();
    if (e.target.checked) cache.forEach((a) => selected.add(a._id));
    document.querySelectorAll('#aucRows .act-select').forEach((cb) => { cb.checked = e.target.checked; });
    updateBulkBar();
  });

  $('aucRows').addEventListener('change', (e) => {
    if (!e.target.classList.contains('act-select')) return;
    const tr = e.target.closest('tr');
    if (!tr) return;
    if (e.target.checked) selected.add(tr.dataset.id); else selected.delete(tr.dataset.id);
    updateBulkBar();
  });

  $('aucRows').addEventListener('click', async (e) => {
    if (!e.target.classList.contains('act-del')) return;
    const tr = e.target.closest('tr');
    if (!tr) return;
    const a = cache.find((x) => x._id === tr.dataset.id);
    if (!a) return;

    const reason = prompt('Silme sebebi (satıcıya bildirilecek):');
    if (!reason || !reason.trim()) return;
    try {
      await apiJson(`/api/auctions/delete/${a._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      await loadAuctions();
    } catch (err) {
      if (err.message !== 'unauthorized') $('aucMsg').textContent = err.message;
    }
  });

  $('aucBulkDeleteBtn').addEventListener('click', async () => {
    if (!selected.size) return;
    const reason = prompt(`${selected.size} mezatı silme sebebi (zorunlu):`);
    if (!reason || !reason.trim()) return;
    try {
      const data = await apiJson('/api/admin/auctions/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionIds: [...selected], reason: reason.trim() }),
      });
      let msg = `${data.affected} mezat silindi.`;
      if (data.skipped && data.skipped.length) msg += ' Atlanan: ' + data.skipped.map((s) => s.reason).join(', ');
      $('aucMsg').textContent = msg;
      selected.clear();
      updateBulkBar();
      await loadAuctions();
    } catch (err) {
      if (err.message !== 'unauthorized') $('aucMsg').textContent = err.message;
    }
  });
}
