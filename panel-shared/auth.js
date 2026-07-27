// auth.js — giriş formu ve oturum yaşam döngüsü.
import { setSession, clearSession, onUnauthorized } from './api.js';

const $ = (id) => document.getElementById(id);

function show(view) {
  $('loginView').classList.toggle('hidden', view !== 'login');
  $('appView').classList.toggle('hidden', view !== 'app');
}

export function showApp() { show('app'); }
export function showLogin() { show('login'); }

export function logout(reason) {
  clearSession();
  show('login');
  const el = $('loginMsg');
  if (reason) {
    el.textContent = reason;
    el.className = 'msg err';
  } else {
    el.textContent = '';
    el.className = 'msg';
  }
}

export function initAuth({ onLogin, allowedRoles = ['seller', 'admin'] }) {
  onUnauthorized((reason) => logout(reason));
  $('logoutBtn').addEventListener('click', () => logout(''));

  const submit = async () => {
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    const msgEl = $('loginMsg');
    msgEl.textContent = 'Giriş yapılıyor…';
    msgEl.className = 'msg';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Giriş başarısız');
      if (!data.token) throw new Error('Sunucu oturum anahtarı döndürmedi');
      if (!allowedRoles.includes(data.user?.role)) {
        throw new Error(
          allowedRoles.includes('seller')
            ? 'Bu panel satıcı hesapları içindir.'
            : 'Bu panel yönetici hesapları içindir.'
        );
      }

      setSession({ token: data.token, user: data.user });
      msgEl.textContent = '';
      show('app');
      onLogin(data.user);
    } catch (e) {
      msgEl.textContent = e.message;
      msgEl.className = 'msg err';
    }
  };

  $('loginBtn').addEventListener('click', submit);
  $('loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}
