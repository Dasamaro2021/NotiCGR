/* NotiCGR – acceso (demo local: cuentas en localStorage; en producción esto va en el servidor) */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const US = 'noticgr.users', SS = 'noticgr.session';
  const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const ses = get(SS);
  if (ses && ses.user) return location.replace('index.html');   // el invitado sí puede volver a elegir

  const hash = async s => {
    try {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('noticgr:' + s));
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    } catch { return btoa(unescape(encodeURIComponent(s))); }
  };
  const enter = s => { localStorage.setItem(SS, JSON.stringify(s)); location.href = 'index.html'; };
  const fail = (f, m) => { f.querySelector('.err').textContent = m; };
  const mode = up => {
    $('#f-in').hidden = up; $('#f-up').hidden = !up;
    $('#t-in').setAttribute('aria-selected', !up); $('#t-up').setAttribute('aria-selected', up);
    document.querySelectorAll('.err').forEach(e => { e.textContent = ''; });
  };
  $('#t-in').onclick = () => mode(false);
  $('#t-up').onclick = () => mode(true);
  if (new URLSearchParams(location.search).get('modo') === 'registro') mode(true);
  $('#guest').onclick = () => enter({ guest: true });

  $('#f-up').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, name = f.u.value.trim(), p = f.p.value;
    if (!/^[\p{L}\d_.]{3,20}$/u.test(name)) return fail(f, 'El usuario debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo.');
    if (p.length < 6) return fail(f, 'La contraseña debe tener al menos 6 caracteres.');
    if (p !== f.p2.value) return fail(f, 'Las contraseñas no coinciden.');
    const users = get(US) || [];
    if (users.some(u => u.name.toLowerCase() === name.toLowerCase())) return fail(f, 'Ese nombre de usuario ya está en uso.');
    users.push({ name, pass: await hash(p) });
    localStorage.setItem(US, JSON.stringify(users));
    enter({ user: name });
  });

  $('#f-in').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, name = f.u.value.trim().toLowerCase();
    const u = (get(US) || []).find(x => x.name.toLowerCase() === name);
    if (!u || u.pass !== await hash(f.p.value)) return fail(f, 'Usuario o contraseña incorrectos.');
    enter({ user: u.name });
  });
})();
