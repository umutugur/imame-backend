// overview.js — platform genel bakış KPI'ları.
import { apiJson } from '/panel-shared/api.js';

const $ = (id) => document.getElementById(id);
const fmtTL = (n) => '₺' + Number(n || 0).toLocaleString('tr-TR');
const fmtN = (n) => Number(n || 0).toLocaleString('tr-TR');

function set(id, value, detail) {
  $(id).innerHTML = detail ? `${value}<div class="d">${detail}</div>` : value;
}

export async function renderOverview() {
  const data = await apiJson('/api/admin/overview');
  const { auctions, revenue, users, exposure, payment } = data;

  set('ovAuctions', fmtN(auctions.activeNow) + ' aktif', `bugün +${fmtN(auctions.createdToday)} · bu hafta +${fmtN(auctions.createdThisWeek)}`);
  set('ovRevenue', fmtTL(revenue.today), `bu hafta ${fmtTL(revenue.thisWeek)} · geçen hafta ${fmtTL(revenue.lastWeek)}`);
  set('ovUsers', fmtN(users.total), `bu hafta +${fmtN(users.newThisWeek)} · ${fmtN(users.sellers)} satıcı · ${fmtN(users.banned)} banlı`);
  set('ovExposure', fmtN(exposure.impressions) + ' gösterim', `${fmtN(exposure.bids)} teklif`);
  set('ovConversion', '%' + (exposure.conversion * 100).toFixed(1).replace('.', ','), 'teklif / gösterim');

  const unpaidRatio = payment.endedWithWinner
    ? (payment.expiredUnpaid / payment.endedWithWinner) * 100
    : 0;
  set(
    'ovUnpaid',
    `${fmtN(payment.expiredUnpaid)} / ${fmtN(payment.endedWithWinner)}`,
    `%${unpaidRatio.toFixed(1).replace('.', ',')} ödenmemiş · ${fmtN(payment.receiptUploaded)} dekont yüklendi`
  );
}
