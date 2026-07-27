// notify.js — platform genelinde push bildirim gönderimi (mevcut uç).
import { apiJson } from '/panel-shared/api.js';

const $ = (id) => document.getElementById(id);

export function initNotify() {
  $('notifyBtn').addEventListener('click', async () => {
    const title = $('notifyTitle').value.trim();
    const message = $('notifyBody').value.trim();
    const msg = $('notifyMsg');

    if (!title || !message) {
      msg.textContent = 'Başlık ve mesaj zorunlu.';
      msg.className = 'msg err';
      return;
    }

    msg.textContent = 'Gönderiliyor…';
    msg.className = 'msg';
    try {
      const data = await apiJson('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, toAllBuyers: true, toAllSellers: true, includeGuests: true }),
      });
      const total = (data.counts && data.counts.totalTokens) || 0;
      msg.textContent = `Gönderildi — ${total} cihaza ulaştı.`;
      msg.className = 'msg ok';
      $('notifyTitle').value = '';
      $('notifyBody').value = '';
    } catch (err) {
      if (err.message === 'unauthorized') return;
      msg.textContent = err.message;
      msg.className = 'msg err';
    }
  });
}
