/* NotiCGR – acceso: las cuentas viven en el servidor (api.php) */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const GUEST = 'noticgr.guest';
  const call = async (a, data) => {
    try {
      const r = await fetch('api.php?a=' + a, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify(data) });
      const j = await r.json();
      return r.ok ? j : { error: j.error || 'Error del servidor.' };
    } catch { return { error: 'No hay conexión con el servidor.' }; }
  };
  fetch('api.php?a=me', { credentials: 'same-origin' }).then(r => r.json()).then(j => { if (j.user) location.replace('index.html'); }).catch(() => {});

  const fail = (f, m) => { f.querySelector('.err').textContent = m; };
  const mode = up => {
    $('#f-in').hidden = up; $('#f-up').hidden = !up;
    $('#t-in').setAttribute('aria-selected', !up); $('#t-up').setAttribute('aria-selected', up);
    document.querySelectorAll('.err').forEach(e => { e.textContent = ''; });
  };
  $('#t-in').onclick = () => mode(false);
  $('#t-up').onclick = () => mode(true);
  if (new URLSearchParams(location.search).get('modo') === 'registro') mode(true);
  $('#guest').onclick = () => { localStorage.setItem(GUEST, '1'); location.href = 'index.html'; };

  async function send(e, action, data, check) {
    e.preventDefault();
    const f = e.target, bad = check && check(f);
    if (bad) return fail(f, bad);
    const btn = f.querySelector('.btn'); btn.disabled = true;
    const r = await call(action, data(f));
    btn.disabled = false;
    if (r.error) return fail(f, r.error);
    localStorage.removeItem(GUEST); location.href = 'index.html';
  }
  $('#f-up').addEventListener('submit', e => send(e, 'register', f => ({ u: f.u.value.trim(), p: f.p.value }), f =>
    !/^[\p{L}\d_.]{3,20}$/u.test(f.u.value.trim()) ? 'El usuario debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo.'
    : f.p.value.length < 6 ? 'La contraseña debe tener al menos 6 caracteres.'
    : f.p.value !== f.p2.value ? 'Las contraseñas no coinciden.' : ''));
  $('#f-in').addEventListener('submit', e => send(e, 'login', f => ({ u: f.u.value.trim(), p: f.p.value })));
})();
