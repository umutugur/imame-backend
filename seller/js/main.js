// main.js — önyükleme, sekme yönlendirme, tek veri akışı, KPI hesabı.
import { apiJson, getToken, getUser } from '/panel-shared/api.js';
import { initAuth, showApp, showLogin } from '/panel-shared/auth.js';
import { renderAuctions, initAuctionForm, openCreateForm } from './auctions.js';
import { renderOrders } from './orders.js';

const $ = (id) => document.getElementById(id);
const TZ = 'Europe/Istanbul';
const fmtTL = (n) => '₺' + Number(n || 0).toLocaleString('tr-TR');

let items = [];

/* ---------- Sekmeler ---------- */
const TABS = ['overview', 'auctions', 'orders', 'form'];

function showTab(name) {
  TABS.forEach((t) => $('tab-' + t).classList.toggle('hidden', t !== name));
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
}

function initTabs() {
  document.querySelectorAll('#nav a').forEach((a) => {
    a.addEventListener('click', () => {
      const tab = a.dataset.tab;
      if (tab === 'form') openCreateForm();
      showTab(tab);
    });
  });
}

/* ---------- KPI (eski panelin mantığı birebir korunur) ----------
   Ciro = biten VE dekontu onaylanmış mezatların currentPrice toplamı;
   endsAt'e göre bugün / bu hafta (Pazartesi başlangıç) / geçen hafta
   kovalarına ayrılır (Europe/Istanbul). */
function istanbulParts() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((o, x) => ((o[x.type] = x.value), o), {});
  return { y: +p.year, m: +p.month - 1, d: +p.day };
}

function computeKpis(list) {
  const { y, m, d } = istanbulParts();
  const startToday = new Date(Date.UTC(y, m, d, 0, 0, 0));
  const anchor = new Date(Date.UTC(y, m, d, 12, 0, 0)); // gün kaymasını önlemek için 12:00
  const wd = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: TZ }).format(anchor);
  const shift = { Mon: 0, Tue: -1, Wed: -2, Thu: -3, Fri: -4, Sat: -5, Sun: -6 }[wd] ?? 0;
  const startWeek = new Date(Date.UTC(y, m, d + shift, 0, 0, 0));
  const startPrevWeek = new Date(startWeek.getTime() - 7 * 24 * 3600 * 1000);

  let today = 0, week = 0, prevWeek = 0, views = 0, bids = 0;

  for (const a of list) {
    views += a.impressionCount || 0;
    bids += a.bidCount || 0;
    if (!a.isEnded) continue;
    if ((a.receiptStatus || '').toLowerCase() !== 'approved') continue;
    const price = Number(a.currentPrice || 0);
    const endMs = a.endsAt ? new Date(a.endsAt).getTime() : 0;
    if (endMs >= startToday.getTime()) today += price;
    if (endMs >= startWeek.getTime()) week += price;
    if (endMs >= startPrevWeek.getTime() && endMs < startWeek.getTime()) prevWeek += price;
  }

  $('kpiToday').textContent = fmtTL(today);
  $('kpiWeek').textContent = fmtTL(week);
  $('kpiPrevWeek').textContent = fmtTL(prevWeek);
  $('kpiViews').textContent = views.toLocaleString('tr-TR');
  $('kpiBids').textContent = bids.toLocaleString('tr-TR');
  $('kpiConversion').textContent =
    '%' + (views ? (bids / views) * 100 : 0).toFixed(1).replace('.', ',');

  // Kenar çubuğu rozeti: işlem bekleyen dekontlar
  const pending = list.filter(
    (a) => a.isEnded && a.winner && a.receiptUrl && (a.receiptStatus || '').toLowerCase() === 'pending'
  ).length;
  const badge = $('navPendingBadge');
  badge.textContent = String(pending);
  badge.classList.toggle('hidden', pending === 0);
}

/* ---------- Veri akışı ---------- */
async function refresh() {
  const data = await apiJson('/api/seller/auctions');
  items = data.items || [];
  computeKpis(items);
  renderAuctions(items, { onEdit: () => showTab('form'), onDeleted: refresh });
  renderOrders(items, { onChanged: refresh });
}

/* ---------- Önyükleme ---------- */
function startApp(user) {
  $('sellerName').textContent = user?.companyName || user?.name || user?.email || 'Satıcı';
  refresh().catch((e) => {
    if (e.message !== 'unauthorized') $('auctionsMsg').textContent = e.message;
  });
}

initTabs();
initAuth({ onLogin: startApp, allowedRoles: ['seller', 'admin'] });
initAuctionForm({ onSaved: async () => { await refresh(); showTab('auctions'); } });
$('modalClose').addEventListener('click', () => $('imgModal').classList.remove('open'));
$('imgModal').addEventListener('click', (e) => {
  if (e.target.id === 'imgModal') $('imgModal').classList.remove('open');
});

if (getToken()) {
  showApp();
  startApp(getUser());
} else {
  showLogin();
}
