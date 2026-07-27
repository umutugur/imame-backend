// main.js — önyükleme, sekme yönlendirme, tembel bölüm yükleme.
import { getToken, getUser } from '/panel-shared/api.js';
import { initAuth, showApp, showLogin } from '/panel-shared/auth.js';
import { renderOverview } from './overview.js';
import { initUsers, loadUsers } from './users.js';
import { initSellers, loadSellers } from './sellers.js';
import { initAuctions, loadAuctions } from './auctions.js';
import { initReceipts, loadReceipts } from './receipts.js';
import { loadReports } from './reports.js';
import { initNotify } from './notify.js';
import { initLogs, loadLogs } from './logs.js';

const $ = (id) => document.getElementById(id);

const TABS = ['overview', 'users', 'sellers', 'auctions', 'receipts', 'reports', 'notify', 'logs'];

// Sekme başına yükleme fonksiyonu; 'overview' ve 'notify' burada yer almaz —
// overview açılışta zaten yükleniyor, notify'ın çekilecek listesi yok.
const LOADERS = {
  users: loadUsers,
  sellers: loadSellers,
  auctions: loadAuctions,
  receipts: loadReceipts,
  reports: loadReports,
  logs: loadLogs,
};

const MSG_EL = {
  users: 'usersMsg',
  sellers: 'sellersMsg',
  auctions: 'aucMsg',
  receipts: 'recMsg',
  reports: 'reportsMsg',
  logs: 'logsMsg',
};

const loaded = new Set();

async function ensureLoaded(name) {
  const fn = LOADERS[name];
  if (!fn || loaded.has(name)) return;

  // Mezatlar sekmesindeki satıcı filtresi Satıcılar verisine dayanır; henüz
  // çekilmediyse önce onu (sessizce) yükle.
  if (name === 'auctions' && !loaded.has('sellers')) {
    try { await loadSellers(); loaded.add('sellers'); } catch { /* filtre boş kalır, önemli değil */ }
  }

  try {
    await fn();
    loaded.add(name);
  } catch (e) {
    if (e.message !== 'unauthorized') {
      const msgId = MSG_EL[name];
      if (msgId) $(msgId).textContent = e.message;
    }
  }
}

function showTab(name) {
  TABS.forEach((t) => $('tab-' + t).classList.toggle('hidden', t !== name));
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
  ensureLoaded(name);
}

function initTabs() {
  document.querySelectorAll('#nav a').forEach((a) => {
    a.addEventListener('click', () => showTab(a.dataset.tab));
  });
}

async function refreshReportBadge() {
  try {
    const items = await loadReports();
    loaded.add('reports');
    const badge = $('navReportBadge');
    badge.textContent = String(items.length);
    badge.classList.toggle('hidden', items.length === 0);
  } catch (e) {
    // Sessizce yut — rozet süslemedir, giriş akışını bozmamalı.
  }
}

function startApp(user) {
  $('adminName').textContent = user?.name || user?.email || 'Yönetici';
  renderOverview().catch((e) => { if (e.message !== 'unauthorized') console.error(e); });
  refreshReportBadge();
}

initTabs();
initUsers();
initSellers();
initAuctions();
initReceipts();
initNotify();
initLogs();
initAuth({ onLogin: startApp, allowedRoles: ['admin'] });

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
