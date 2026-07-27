// auctions.js — mezat listesi (analitik rozetleriyle), form (ekle/düzenle), silme.
import { apiJson } from '/panel-shared/api.js';

const $ = (id) => document.getElementById(id);
const fmtTL = (n) => '₺' + Number(n || 0).toLocaleString('tr-TR');
const conversion = (a) => (a.bidCount || 0) / Math.max(a.impressionCount || 0, 1);

let cache = [];
let handlers = { onEdit: () => {}, onDeleted: () => {} };

function sortItems(list, mode) {
  const c = [...list];
  if (mode === 'views') return c.sort((a, b) => (b.impressionCount || 0) - (a.impressionCount || 0));
  if (mode === 'bids') return c.sort((a, b) => (b.bidCount || 0) - (a.bidCount || 0));
  if (mode === 'lowconv') {
    // Yalnızca yeterince gösterilmiş olanlar anlamlıdır; azları sona at.
    return c.sort((a, b) => {
      const seenA = (a.impressionCount || 0) >= 20, seenB = (b.impressionCount || 0) >= 20;
      if (seenA !== seenB) return seenA ? -1 : 1;
      return conversion(a) - conversion(b);
    });
  }
  return c; // 'new' — sunucu zaten createdAt DESC döndürüyor
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function rowHtml(a) {
  const conv = conversion(a) * 100;
  const cls = (a.impressionCount || 0) >= 20 && conv < 1 ? 'warn' : conv > 0 ? 'ok' : 'neutral';
  const img = (a.images && a.images[0]) || '';
  const status = a.isEnded ? 'Sona erdi' : 'Aktif · 22:00';
  return `
    <tr data-id="${a._id}">
      <td>${img ? `<img class="thumb" src="${escapeHtml(img)}">` : '<div class="thumb"></div>'}</td>
      <td><div class="ttl">${escapeHtml(a.title || '')}</div>
          <div class="sub">${escapeHtml(status)}${a.isSigned ? ' · Usta imzalı' : ''}</div></td>
      <td class="num">${fmtTL(a.currentPrice || a.startingPrice)}</td>
      <td class="num">${(a.impressionCount || 0).toLocaleString('tr-TR')}</td>
      <td class="num">${a.bidCount || 0}</td>
      <td><span class="pill ${cls}">%${conv.toFixed(1).replace('.', ',')}</span></td>
      <td style="white-space:nowrap">
        ${a.isEnded ? '' : `<button class="btn btn-ghost btn-sm act-edit">Düzenle</button>
        <button class="btn btn-danger btn-sm act-del">Sil</button>`}
      </td>
    </tr>`;
}

export function renderAuctions(items, h) {
  cache = items;
  if (h) handlers = h;
  const mode = $('auctionSort').value || 'new';
  const rows = sortItems(items, mode);
  $('auctionRows').innerHTML = rows.map(rowHtml).join('');
  $('auctionsMsg').textContent = rows.length ? '' : 'Henüz mezatınız yok.';
}

$('auctionSort').addEventListener('change', () => renderAuctions(cache));

$('auctionRows').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const item = cache.find((x) => x._id === tr.dataset.id);
  if (!item) return;

  if (e.target.classList.contains('act-edit')) {
    openEditForm(item);
    handlers.onEdit(item);
  }
  if (e.target.classList.contains('act-del')) {
    const reason = prompt('Silme sebebi (satıcıya bildirilecek):');
    if (!reason) return;
    try {
      await apiJson(`/api/auctions/delete/${item._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      handlers.onDeleted();
    } catch (err) {
      if (err.message !== 'unauthorized') $('auctionsMsg').textContent = err.message;
    }
  }
});

/* ---------- Form: ekle / düzenle ---------- */
let editingId = null;
let onSavedCb = () => {};

export function openCreateForm() {
  editingId = null;
  $('formTitle').textContent = 'Mezat Ekle';
  $('f-title').value = '';
  $('f-price').value = '';
  $('f-price').disabled = false;
  $('f-signed').value = 'false';
  $('f-desc').value = '';
  $('f-images').value = '';
  $('f-preview').innerHTML = '';
  $('formPriceLock').classList.add('hidden');
  $('formCancel').classList.add('hidden');
  $('formMsg').textContent = '';
}

export function openEditForm(a) {
  editingId = a._id;
  $('formTitle').textContent = 'Mezatı Düzenle';
  $('f-title').value = a.title || '';
  $('f-price').value = a.startingPrice ?? '';
  $('f-signed').value = a.isSigned ? 'true' : 'false';
  $('f-desc').value = a.description || '';
  $('f-images').value = '';
  $('f-preview').innerHTML = (a.images || []).map((u) => `<img src="${escapeHtml(u)}">`).join('');
  const locked = (a.bidCount || 0) > 0;
  $('f-price').disabled = locked;
  $('formPriceLock').classList.toggle('hidden', !locked);
  $('formCancel').classList.remove('hidden');
  $('formMsg').textContent = '';
}

export function initAuctionForm({ onSaved }) {
  onSavedCb = onSaved;

  $('f-images').addEventListener('change', () => {
    const files = [...($('f-images').files || [])].slice(0, 5);
    $('f-preview').innerHTML = files.map((f) => `<img src="${URL.createObjectURL(f)}">`).join('');
  });

  $('formCancel').addEventListener('click', () => openCreateForm());

  $('formSubmit').addEventListener('click', async () => {
    const msg = $('formMsg');
    const fd = new FormData();
    fd.append('title', $('f-title').value.trim());
    fd.append('description', $('f-desc').value);
    fd.append('isSigned', $('f-signed').value);
    if (!$('f-price').disabled) fd.append('startingPrice', $('f-price').value);
    for (const f of [...($('f-images').files || [])].slice(0, 5)) fd.append('images', f);

    if (!fd.get('title')) { msg.textContent = 'Başlık zorunlu'; msg.className = 'msg err'; return; }

    msg.textContent = 'Kaydediliyor…';
    msg.className = 'msg';
    try {
      const url = editingId ? `/api/seller/auctions/${editingId}` : '/api/seller/auctions';
      await apiJson(url, { method: editingId ? 'PUT' : 'POST', body: fd });
      msg.textContent = editingId ? 'Mezat güncellendi.' : 'Mezat eklendi.';
      msg.className = 'msg ok';
      openCreateForm();
      onSavedCb();
    } catch (e) {
      if (e.message === 'unauthorized') return;
      msg.textContent = e.message;
      msg.className = 'msg err';
    }
  });
}
