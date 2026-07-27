// users.js — kullanıcı listesi (arama/rol filtresi), ban/ban kaldır, rol değişimi,
// toplu ban/ban kaldır. Ban modalı burada bağlanır; reports.js de aynı modalı kullanır
// (openBanModal export edilir).
import { apiJson, getUser } from '/panel-shared/api.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROLE_LABEL = { buyer: 'Alıcı', seller: 'Satıcı', admin: 'Yönetici' };

let cache = [];
let selected = new Set();
let searchTimer = null;
let banTarget = null; // { ids: [...], onDone }

function banStatusHtml(u) {
  if (!u.isBanned) return '<span class="pill ok">Aktif</span>';
  if (!u.bannedUntil) return '<span class="pill danger">Süresiz banlı</span>';
  const diff = new Date(u.bannedUntil).getTime() - Date.now();
  if (diff <= 0) return '<span class="pill warn">Süresi doldu</span>';
  const days = Math.max(1, Math.ceil(diff / 86400000));
  return `<span class="pill danger">${days} gün kaldı</span>`;
}

function roleSelectHtml(u, isSelf) {
  const opts = ['buyer', 'seller', 'admin']
    .map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`)
    .join('');
  return `<select class="act-role" ${isSelf ? 'disabled title="Kendi rolünüzü değiştiremezsiniz"' : ''}>${opts}</select>`;
}

function rowHtml(u, me) {
  const isSelf = !!me && String(me._id || me.id) === String(u._id);
  return `
    <tr data-id="${u._id}">
      <td>${isSelf ? '' : '<input type="checkbox" class="act-select">'}</td>
      <td><div class="ttl">${escapeHtml(u.name || '—')}</div>${u.companyName ? `<div class="sub">${escapeHtml(u.companyName)}</div>` : ''}</td>
      <td>${escapeHtml(u.email || '')}</td>
      <td>${roleSelectHtml(u, isSelf)}</td>
      <td class="sub">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('tr-TR') : '—'}</td>
      <td>${banStatusHtml(u)}</td>
      <td style="white-space:nowrap">
        ${isSelf ? '' : (u.isBanned
          ? '<button class="btn btn-ghost btn-sm act-unban">Ban kaldır</button>'
          : '<button class="btn btn-danger btn-sm act-ban">Banla</button>')}
        <button class="btn btn-ghost btn-sm act-detail">Detay</button>
      </td>
    </tr>`;
}

function updateBulkBar() {
  const bar = $('userBulkBar');
  bar.classList.toggle('hidden', selected.size === 0);
  $('userBulkCount').textContent = String(selected.size);
}

export async function loadUsers() {
  const q = $('userSearch').value.trim();
  const role = $('userRole').value;
  const params = new URLSearchParams({ limit: '50' });
  if (q) params.set('q', q);
  if (role) params.set('role', role);

  const data = await apiJson('/api/users/all?' + params.toString());
  cache = data.items || [];
  selected.clear();
  updateBulkBar();

  const me = getUser();
  $('userRows').innerHTML = cache.map((u) => rowHtml(u, me)).join('');
  $('usersMsg').textContent = cache.length
    ? `${cache.length} / ${data.total} kullanıcı gösteriliyor`
    : 'Sonuç bulunamadı.';
}

function skippedSuffix(skipped) {
  if (!skipped || !skipped.length) return '';
  return ' · Atlanan: ' + skipped.map((s) => s.reason).join(', ');
}

/* ---------- Ban modalı (paylaşılan; reports.js de kullanır) ---------- */

export function openBanModal(target, onDone) {
  if (target.ids) {
    banTarget = { ids: target.ids, onDone };
    $('banUserName').textContent = target.label || `${target.ids.length} kullanıcı`;
  } else {
    banTarget = { ids: [target._id], onDone };
    $('banUserName').textContent = [target.name, target.email].filter(Boolean).join(' · ');
  }
  $('banDuration').value = '';
  $('banReason').value = '';
  $('banModal').classList.add('open');
}

function closeBanModal() {
  $('banModal').classList.remove('open');
  banTarget = null;
}

function bindBanModal() {
  $('banCancel').addEventListener('click', closeBanModal);
  $('banModal').addEventListener('click', (e) => {
    if (e.target.id === 'banModal') closeBanModal();
  });

  $('banConfirm').addEventListener('click', async () => {
    const target = banTarget;
    if (!target) return;
    const durationDays = $('banDuration').value ? Number($('banDuration').value) : undefined;
    const reason = $('banReason').value.trim() || undefined;

    try {
      if (target.ids.length > 1) {
        const data = await apiJson('/api/admin/users/bulk-ban', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: target.ids, durationDays, reason }),
        });
        closeBanModal();
        $('usersMsg').textContent = `${data.affected} kullanıcı banlandı.` + skippedSuffix(data.skipped);
      } else {
        await apiJson(`/api/users/ban/${target.ids[0]}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ durationDays, reason }),
        });
        closeBanModal();
      }
      if (target.onDone) await target.onDone();
    } catch (err) {
      if (err.message !== 'unauthorized') alert(err.message);
    }
  });
}

/* ---------- Ana bağlama ---------- */

export function initUsers() {
  bindBanModal();

  $('userSearch').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadUsers().catch((e) => { if (e.message !== 'unauthorized') $('usersMsg').textContent = e.message; });
    }, 350);
  });

  $('userRole').addEventListener('change', () => {
    loadUsers().catch((e) => { if (e.message !== 'unauthorized') $('usersMsg').textContent = e.message; });
  });

  $('userSelectAll').addEventListener('change', (e) => {
    selected.clear();
    const me = getUser();
    if (e.target.checked) {
      cache.forEach((u) => {
        if (!me || String(me._id || me.id) !== String(u._id)) selected.add(u._id);
      });
    }
    document.querySelectorAll('#userRows .act-select').forEach((cb) => { cb.checked = e.target.checked; });
    updateBulkBar();
  });

  $('userRows').addEventListener('change', async (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const u = cache.find((x) => x._id === tr.dataset.id);
    if (!u) return;

    if (e.target.classList.contains('act-select')) {
      if (e.target.checked) selected.add(u._id); else selected.delete(u._id);
      updateBulkBar();
      return;
    }

    if (e.target.classList.contains('act-role')) {
      const newRole = e.target.value;
      if (newRole === u.role) return;
      if (!confirm(`${u.email || u.name} kullanıcısının rolünü "${ROLE_LABEL[newRole]}" yapmak istediğinize emin misiniz?`)) {
        e.target.value = u.role;
        return;
      }
      try {
        await apiJson(`/api/users/${u._id}/role`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole }),
        });
        await loadUsers();
      } catch (err) {
        if (err.message !== 'unauthorized') $('usersMsg').textContent = err.message;
        e.target.value = u.role;
      }
    }
  });

  $('userRows').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const u = cache.find((x) => x._id === tr.dataset.id);
    if (!u) return;

    if (e.target.classList.contains('act-ban')) {
      openBanModal(u, () => loadUsers());
    }

    if (e.target.classList.contains('act-unban')) {
      if (!confirm(`${u.email || u.name} kullanıcısının banını kaldırmak istiyor musunuz?`)) return;
      try {
        await apiJson(`/api/users/unban/${u._id}`, { method: 'PATCH' });
        await loadUsers();
      } catch (err) {
        if (err.message !== 'unauthorized') $('usersMsg').textContent = err.message;
      }
    }

    if (e.target.classList.contains('act-detail')) {
      try {
        const data = await apiJson(`/api/admin/users/${u._id}`);
        const s = data.stats || {};
        alert(
          `${data.user.name || data.user.email}\n` +
          `Teklif: ${s.bids} · Kazanılan mezat: ${s.wonAuctions}\n` +
          `Dekont yüklenen: ${s.receiptsUploaded} · Onaylanan: ${s.receiptsApproved}\n` +
          `Ödenmemiş kazanım: ${s.unpaidWins}`
        );
      } catch (err) {
        if (err.message !== 'unauthorized') $('usersMsg').textContent = err.message;
      }
    }
  });

  $('userBulkBanBtn').addEventListener('click', () => {
    if (!selected.size) return;
    openBanModal(
      { ids: [...selected], label: `${selected.size} kullanıcı (toplu işlem)` },
      async () => { selected.clear(); updateBulkBar(); await loadUsers(); }
    );
  });

  $('userBulkUnbanBtn').addEventListener('click', async () => {
    if (!selected.size) return;
    if (!confirm(`${selected.size} kullanıcının banını kaldırmak istiyor musunuz?`)) return;
    try {
      const data = await apiJson('/api/admin/users/bulk-unban', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [...selected] }),
      });
      $('usersMsg').textContent = `${data.affected} kullanıcının banı kaldırıldı.` + skippedSuffix(data.skipped);
      selected.clear();
      updateBulkBar();
      await loadUsers();
    } catch (err) {
      if (err.message !== 'unauthorized') $('usersMsg').textContent = err.message;
    }
  });
}
