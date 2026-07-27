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

/* ---------- Adres seçicileri ----------
   Mahalle verisi toplam 10.8 MB; tarayıcıya indirmiyoruz. /api/geo uçları
   yalnızca seçilen il/ilçenin altını döndürüyor, kimlik uzayı mobil formdakiyle
   aynı kalıyor. */
function fillSelect(el, items, bosMetin) {
  el.innerHTML =
    `<option value="">${bosMetin}</option>` +
    items.map((i) => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.ad)}</option>`).join('');
  el.disabled = items.length === 0;
}

function resetSelect(el, bosMetin) {
  el.innerHTML = `<option value="">${bosMetin}</option>`;
  el.disabled = true;
}

async function initAddressSelects() {
  const il = $('newSellerIl');
  const ilce = $('newSellerIlce');
  const mahalle = $('newSellerMahalle');

  try {
    const { items } = await apiJson('/api/geo/iller');
    fillSelect(il, items, 'İl seçiniz');
  } catch (err) {
    if (err.message !== 'unauthorized') $('newSellerMsg').textContent = 'İl listesi alınamadı.';
    return;
  }

  il.addEventListener('change', async () => {
    resetSelect(mahalle, 'Önce ilçe seçiniz');
    if (!il.value) return resetSelect(ilce, 'Önce il seçiniz');
    const { items } = await apiJson(`/api/geo/ilceler?ilId=${encodeURIComponent(il.value)}`);
    fillSelect(ilce, items, 'İlçe seçiniz');
  });

  ilce.addEventListener('change', async () => {
    if (!ilce.value) return resetSelect(mahalle, 'Önce ilçe seçiniz');
    const { items } = await apiJson(`/api/geo/mahalleler?ilceId=${encodeURIComponent(ilce.value)}`);
    fillSelect(mahalle, items, 'Mahalle seçiniz');
  });
}

/* ---------- Yeni satıcı ---------- */
const FORM_IDS = [
  'newSellerCompany', 'newSellerName', 'newSellerEmail', 'newSellerPass', 'newSellerPhone',
  'newSellerIban', 'newSellerIbanName', 'newSellerBank',
  'newSellerSokak', 'newSellerApt', 'newSellerDaire',
];

export function initSellers() {
  initAddressSelects();

  $('newSellerBtn').addEventListener('click', async () => {
    const msg = $('newSellerMsg');
    const val = (id) => $(id).value.trim();

    const companyName = val('newSellerCompany');
    const email = val('newSellerEmail');
    const password = $('newSellerPass').value;

    if (!companyName || !email || !password) {
      msg.textContent = 'Firma adı, e-posta ve şifre zorunludur.';
      msg.className = 'msg err';
      return;
    }
    if (password.length < 6) {
      msg.textContent = 'Şifre en az 6 karakter olmalı.';
      msg.className = 'msg err';
      return;
    }

    // Adres kısmi doldurulursa mobil kayıtlarla uyumsuz veri oluşur; ya tamamı
    // ya da hiçbiri.
    const il = $('newSellerIl').value;
    const ilce = $('newSellerIlce').value;
    const mah = $('newSellerMahalle').value;
    const sokak = val('newSellerSokak');
    const adresDolu = [il, ilce, mah, sokak].filter(Boolean).length;
    if (adresDolu > 0 && adresDolu < 4) {
      msg.textContent = 'Adres için il, ilçe, mahalle ve sokak birlikte doldurulmalı.';
      msg.className = 'msg err';
      return;
    }

    msg.textContent = 'Kaydediliyor…';
    msg.className = 'msg';
    try {
      await apiJson('/api/admin/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          name: val('newSellerName'),
          email,
          password,
          phone: val('newSellerPhone'),
          iban: val('newSellerIban'),
          ibanName: val('newSellerIbanName'),
          bankName: val('newSellerBank'),
          address: adresDolu === 4
            ? {
                ilId: Number(il),
                ilceId: Number(ilce),
                mahalleId: Number(mah),
                sokak,
                apartmanNo: val('newSellerApt'),
                daireNo: val('newSellerDaire'),
              }
            : undefined,
        }),
      });
      msg.textContent = 'Satıcı eklendi.';
      msg.className = 'msg ok';
      FORM_IDS.forEach((id) => { $(id).value = ''; });
      $('newSellerIl').value = '';
      resetSelect($('newSellerIlce'), 'Önce il seçiniz');
      resetSelect($('newSellerMahalle'), 'Önce ilçe seçiniz');
      await loadSellers();
    } catch (err) {
      if (err.message === 'unauthorized') return;
      msg.textContent = err.message;
      msg.className = 'msg err';
    }
  });
}
