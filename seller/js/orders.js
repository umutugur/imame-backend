// orders.js — biten mezatların kazanan ve ödeme takibi.
import { apiJson } from '/panel-shared/api.js';

const $ = (id) => document.getElementById(id);
const fmtTL = (n) => '₺' + Number(n || 0).toLocaleString('tr-TR');
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let all = [];
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
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          ${a.receiptUrl ? `<img class="thumb act-view" src="${a.receiptUrl}" title="Dekontu büyüt" style="cursor:zoom-in;width:34px;height:34px">` : ''}
          ${statusPill(a)}
        </div>
      </td>
      <td style="white-space:nowrap">
        ${pending ? `<button class="btn btn-primary btn-sm act-ok">Onayla</button>
                     <button class="btn btn-danger btn-sm act-no">Reddet</button>` : ''}
      </td>
    </tr>`;
}

export function renderOrders(items, { onChanged } = {}) {
  if (onChanged) onChangedCb = onChanged;
  all = items.filter((a) => a.isEnded && a.winner);

  // Aciliyete göre sırala — tarihe göre DEĞİL. Bir yıllık geçmişi olan satıcıda
  // düz tarih sıralaması işlem bekleyen dekontları listenin dibine gömüyordu.
  //   0: dekont yüklendi, onay bekliyor  → satıcı şimdi işlem yapmalı
  //   1: dekont yok, süre hâlâ işliyor   → alıcı bekleniyor
  //   2: kapanmış her şey (onaylı, reddedilmiş veya süresi dolmuş)
  // 2. grup yeniden eskiye gider: bir yıl önce süresi dolmuş kayıt, geçen hafta
  // onaylanmış bir dekonttan daha önemli değildir.
  all.sort((a, b) => {
    const p = priority(a) - priority(b);
    if (p !== 0) return p;
    return new Date(b.endsAt) - new Date(a.endsAt);
  });

  applyFilter();
}

function priority(a) {
  const st = (a.receiptStatus || '').toLowerCase();
  if (a.receiptUrl && st === 'pending') return 0;
  if (!a.receiptUrl && !remaining(a.paymentDeadline).over) return 1;
  return 2;
}

// Bir yıllık geçmişte 69 satır arasından aranan kaydı bulmak sıralamayla çözülmez;
// satıcının doğrudan daraltabilmesi gerekir.
function matches(a, mode) {
  const st = (a.receiptStatus || '').toLowerCase();
  if (mode === 'pending') return !!a.receiptUrl && st === 'pending';
  if (mode === 'hasReceipt') return !!a.receiptUrl;
  if (mode === 'waiting') return !a.receiptUrl && !remaining(a.paymentDeadline).over;
  if (mode === 'expired') return !a.receiptUrl && remaining(a.paymentDeadline).over;
  return true;
}

function applyFilter() {
  const mode = ($('orderFilter') && $('orderFilter').value) || 'all';
  cache = all.filter((a) => matches(a, mode));
  $('orderRows').innerHTML = cache.map(rowHtml).join('');

  const counts = {
    pending: all.filter((a) => matches(a, 'pending')).length,
    hasReceipt: all.filter((a) => matches(a, 'hasReceipt')).length,
    expired: all.filter((a) => matches(a, 'expired')).length,
  };
  $('ordersMsg').textContent = all.length
    ? `${cache.length} / ${all.length} sipariş gösteriliyor · ${counts.hasReceipt} dekontlu · ${counts.pending} onay bekliyor · ${counts.expired} süresi dolmuş`
    : 'Sonuçlanmış mezatınız yok.';
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

// Filtre değişince yeniden çiz (veriyi tekrar çekmeye gerek yok).
const filterEl = $('orderFilter');
if (filterEl) filterEl.addEventListener('change', applyFilter);
