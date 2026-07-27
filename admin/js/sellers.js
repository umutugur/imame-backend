// sellers.js — satıcı performans listesi + yeni satıcı ekleme formu.
import { apiJson } from '/panel-shared/api.js';

const $ = (id) => document.getElementById(id);
const fmtTL = (n) => '₺' + Number(n || 0).toLocaleString('tr-TR');
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const conversion = (s) => (s.bids || 0) / Math.max(s.impressions || 0, 1);

let sellerNames = new Map();

function rowHtml(s) {
  const conv = conversion(s) * 100;
  const cls = (s.impressions || 0) >= 20 && conv < 1 ? 'warn' : conv > 0 ? 'ok' : 'neutral';
  return `
    <tr data-id="${s._id}">
      <td><div class="ttl">${escapeHtml(s.companyName || s.name || '—')}</div>
          <div class="sub">${escapeHtml(s.name || '')}</div></td>
      <td>${escapeHtml(s.email || '')}</td>
      <td class="num">${(s.auctionCount || 0).toLocaleString('tr-TR')}</td>
      <td class="num">${(s.activeCount || 0).toLocaleString('tr-TR')}</td>
      <td class="num">${fmtTL(s.revenue)}</td>
      <td class="num">${(s.impressions || 0).toLocaleString('tr-TR')} / ${(s.bids || 0).toLocaleString('tr-TR')}</td>
      <td><span class="pill ${cls}">%${conv.toFixed(1).replace('.', ',')}</span></td>
    </tr>`;
}

export async function loadSellers() {
  const data = await apiJson('/api/admin/sellers');
  const items = data.items || [];
  sellerNames = new Map(items.map((s) => [String(s._id), s.companyName || s.name || s.email]));
  $('sellerRows').innerHTML = items.map(rowHtml).join('');
  $('sellersMsg').textContent = items.length ? `${items.length} satıcı` : 'Henüz satıcı yok.';

  // Mezatlar sekmesindeki satıcı filtresini besle.
  const sel = $('aucSeller');
  if (sel) {
    const current = sel.value;
    sel.innerHTML = '<option value="">Tüm satıcılar</option>' +
      items.map((s) => `<option value="${s._id}">${escapeHtml(s.companyName || s.name || s.email)}</option>`).join('');
    if (current) sel.value = current;
  }

  return items;
}

export function getSellerName(id) {
  return sellerNames.get(String(id)) || '';
}

export function initSellers() {
  $('newSellerBtn').addEventListener('click', async () => {
    const msg = $('newSellerMsg');
    const name = $('newSellerName').value.trim();
    const companyName = $('newSellerCompany').value.trim();
    const email = $('newSellerEmail').value.trim();
    const password = $('newSellerPass').value;

    if (!name || !companyName || !email || !password) {
      msg.textContent = 'Tüm alanlar zorunlu.';
      msg.className = 'msg err';
      return;
    }

    msg.textContent = 'Kaydediliyor…';
    msg.className = 'msg';
    try {
      await apiJson('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role: 'seller', companyName }),
      });
      msg.textContent = 'Satıcı eklendi.';
      msg.className = 'msg ok';
      $('newSellerName').value = '';
      $('newSellerCompany').value = '';
      $('newSellerEmail').value = '';
      $('newSellerPass').value = '';
      await loadSellers();
    } catch (err) {
      if (err.message === 'unauthorized') return;
      msg.textContent = err.message;
      msg.className = 'msg err';
    }
  });
}
