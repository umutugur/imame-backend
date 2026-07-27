// api.js — fetch sarmalayıcı + oturum saklama.
// 401/403 alındığında oturumu temizler ve kayıtlı dinleyiciyi çağırır.
const TOKEN_KEY = 'seller_token';
const USER_KEY = 'seller_user';
let unauthorizedHandler = null;

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }

export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

export function setSession({ token, user }) {
  localStorage.setItem(TOKEN_KEY, token || '');
  localStorage.setItem(USER_KEY, JSON.stringify(user || null));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  // Eski sürümden kalan anahtarlar
  localStorage.removeItem('seller_id');
  localStorage.removeItem('user');
}

export function onUnauthorized(fn) { unauthorizedHandler = fn; }

export async function apiFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401 || res.status === 403) {
    clearSession();
    if (unauthorizedHandler) unauthorizedHandler('Oturum süreniz doldu. Lütfen tekrar giriş yapın.');
    throw new Error('unauthorized');
  }
  return res;
}

// JSON yanıtı çöz; sunucunun mesajını hataya taşır.
export async function apiJson(url, opts = {}) {
  const res = await apiFetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || (data && data.ok === false)) {
    throw new Error((data && data.message) || 'İşlem başarısız');
  }
  return data;
}
