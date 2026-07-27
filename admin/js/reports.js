// reports.js — şikayet kuyruğu; şikayet edilen kullanıcıyı satırdan doğrudan banlar
// (users.js'teki paylaşılan #banModal'ı açar).
import { apiJson } from '/panel-shared/api.js';
import { openBanModal } from './users.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let cache = [];

function rowHtml(r) {
  const reporter = r.reporter || {};
  const reported = r.reportedSeller || {};
  return `
    <tr data-id="${r._id}">
      <td><div class="ttl">${escapeHtml(reporter.name || reporter.email || 'Bilinmiyor')}</div>
          <div class="sub">${escapeHtml(reporter.email || '')}</div></td>
      <td><div class="ttl">${escapeHtml(reported.name || reported.email || 'Bilinmiyor')}</div>
          <div class="sub">${escapeHtml(reported.email || '')}</div></td>
      <td class="sub">${r.createdAt ? new Date(r.createdAt).toLocaleString('tr-TR') : '—'}</td>
      <td>${escapeHtml(r.message || '')}</td>
      <td style="white-space:nowrap">
        ${reported._id ? '<button class="btn btn-danger btn-sm act-ban">Banla</button>' : ''}
      </td>
    </tr>`;
}

export async function loadReports() {
  const items = await apiJson('/api/reports').then((d) => (Array.isArray(d) ? d : d.items || []));
  cache = items;
  $('reportRows').innerHTML = items.map(rowHtml).join('');
  $('reportsMsg').textContent = items.length ? `${items.length} şikayet` : 'Şikayet yok.';
  return items;
}

// main.js için ayrı bir initReports yok (bkz. seller/js/orders.js kalıbı) — dinleyici
// modül yüklenirken bir kez bağlanır; #reportRows DOM sözleşmesinde her zaman mevcuttur.
$('reportRows').addEventListener('click', (e) => {
  if (!e.target.classList.contains('act-ban')) return;
  const tr = e.target.closest('tr');
  if (!tr) return;
  const r = cache.find((x) => x._id === tr.dataset.id);
  if (!r || !r.reportedSeller) return;

  openBanModal(
    { _id: r.reportedSeller._id, name: r.reportedSeller.name, email: r.reportedSeller.email },
    () => loadReports()
  );
});
