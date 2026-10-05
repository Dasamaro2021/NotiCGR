/* NotiCGR – lógica del dashboard (sin backend por ahora: usa localStorage) */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const CATS = { General: 200, Política: 350, Economía: 150, Justicia: 265, Regional: 30, Tecnología: 215 };
  const KEY = 'noticgr.posts.v1', MAX_PDF = 2 * 1024 * 1024, HR = 3.6e6;
  const TAG = /#[\p{L}\d_]+/gu;
  const S = { q: '', cat: '', sort: 'new', pdf: false, saved: false, edit: false, file: null };
  let freshId = '', editId = '', tt;

  /* ---------- sesión (ver login.html / auth.js) ---------- */
  const KEYS = 'noticgr.session', FIRST_MS = 40e3, EVERY_MS = 120e3;   // aviso a invitados: primera vez y repetición
  let ses = null; try { ses = JSON.parse(localStorage.getItem(KEYS)); } catch {}
  if (!ses) { location.replace('login.html'); return; }
  const GUEST = !!ses.guest, ME = ses.user || 'Invitado';
  document.body.classList.toggle('guest', GUEST);

  const seed = () => [
    { id: 's1', cat: 'Regional', t: Date.now() - .5 * HR, likes: 24, text: 'Abren inscripciones para las veedurías ciudadanas de la región Caribe. El plazo cierra el 15 de octubre y la participación es gratuita. #Veedurías #Regional' },
    { id: 's2', cat: 'Economía', t: Date.now() - 2 * HR, likes: 17, text: 'Ya está disponible para consulta pública el informe trimestral de ejecución presupuestal. Adjunto el resumen en una hoja. #Presupuesto #Transparencia', file: { name: 'resumen-ejecucion.pdf', size: 48200, url: '' } },
    { id: 's3', cat: 'Justicia', t: Date.now() - 5 * HR, likes: 12, text: 'La audiencia pública de seguimiento a los contratos de infraestructura será el próximo jueves a las 9:00 a. m. #Audiencia #Contratación' },
    { id: 's4', cat: 'Tecnología', t: Date.now() - 26 * HR, likes: 31, text: 'Nuevo portal de datos abiertos: los conjuntos de datos ya se pueden descargar en formato CSV. #DatosAbiertos' },
    { id: 's5', cat: 'General', t: Date.now() - 50 * HR, likes: 8, text: 'Bienvenidos a NotiCGR. Publica sin cuenta, adjunta un PDF de una hoja y filtra por tema. #Bienvenida' }
  ];
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); if (Array.isArray(v)) return v; } catch {} return seed(); };
  let posts = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(posts)); } catch { toast('No se pudo guardar en este navegador. Prueba con un PDF más liviano.'); } };

  /* ---------- utilidades ---------- */
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const size = b => b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const ago = t => {
    const m = Math.round((Date.now() - t) / 6e4);
    if (m < 1) return 'justo ahora';
    if (m < 60) return rtf.format(-m, 'minute');
    const h = Math.round(m / 60);
    return h < 24 ? rtf.format(-h, 'hour') : rtf.format(-Math.round(h / 24), 'day');
  };
  function toast(m) {
    const t = $('#toast'); t.textContent = m; t.classList.add('on');
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2800);
  }

  /* ---------- tablón ---------- */
  const body = t => esc(t).replace(TAG, x => `<button class="tag" data-act="tag" data-t="${x}">${x}</button>`);
  const pdf = f => {
    const open = f.url ? `<a class="pdf" href="${f.url}" download="${esc(f.name)}" target="_blank" rel="noopener">` : '<div class="pdf">';
    return open + `<span class="ic">PDF</span><span><b>${esc(f.name)}</b><br><small>1 hoja, ${size(f.size)}</small></span><span class="go">${f.url ? 'Abrir' : 'Ejemplo'}</span>` + (f.url ? '</a>' : '</div>');
  };
  const card = p => `<article class="post${p.id === freshId ? ' new' : ''}" data-id="${p.id}">
    <div class="av" aria-hidden="true">${esc((p.author || 'R')[0].toUpperCase())}</div>
    <div class="pb">
      <header><b>${esc(p.author || 'Redacción')}</b><span class="cat" style="--h:${CATS[p.cat] ?? 200}">${p.cat}</span><time datetime="${new Date(p.t).toISOString()}">${ago(p.t)}</time>${p.edited ? '<span class="muted">(editada)</span>' : ''}</header>
      ${p.id === editId ? editor(p) : `<p>${body(p.text)}</p>${p.file ? pdf(p.file) : ''}`}
      <div class="acts">
        ${S.edit ? '<button data-act="edit"><svg class="i"><use href="#i-edit"/></svg>Editar</button>' : ''}<button data-act="like" aria-pressed="${!!p.liked}" aria-label="Apoyar"><svg class="i"><use href="#i-heart"/></svg>${p.likes}</button>
        <button data-act="save" aria-pressed="${!!p.saved}"><svg class="i"><use href="#i-bookmark"/></svg>${p.saved ? 'Guardada' : 'Guardar'}</button>
        <button data-act="share"><svg class="i"><use href="#i-share"/></svg>Copiar texto</button>
        ${!GUEST && p.author === ME ? '<button class="del" data-act="del" aria-label="Eliminar noticia"><svg class="i"><use href="#i-trash"/></svg></button>' : ''}
      </div>
    </div></article>`;

  function view() {
    const q = S.q.trim().toLowerCase();
    return posts
      .filter(p => (!S.edit || p.author === ME) && (!S.cat || p.cat === S.cat) && (!S.pdf || p.file) && (!S.saved || p.saved) &&
        (!q || `${p.text} ${p.cat} ${p.file ? p.file.name : ''}`.toLowerCase().includes(q)))
      .sort((a, b) => S.sort === 'top' ? b.likes - a.likes || b.t - a.t : b.t - a.t);
  }
  function render() {
    const list = view();
    $('#feed').innerHTML = list.length ? list.map(card).join('')
      : S.edit && !posts.some(p => p.author === ME)
      ? '<div class="empty"><b>Aún no has subido ninguna noticia.</b><span>Cuando publiques una, podrás editarla o eliminarla desde aquí.</span><button class="btn" data-act="new">Crear una nueva noticia</button></div>'
      : '<div class="empty"><b>No hay noticias con estos filtros.</b><span>Quita algún filtro o publica la primera sobre este tema.</span></div>';
    $('#count').textContent = `${list.length} ${list.length === 1 ? 'noticia' : 'noticias'}`;
    $('#title').textContent = S.edit ? 'Editar noticia' : S.saved ? 'Guardadas' : 'Últimas noticias';
    document.body.classList.toggle('editing', S.edit);
    $('#composer').hidden = GUEST || S.edit;
    $('#n-all').textContent = posts.length;
    $('#n-saved').textContent = posts.filter(p => p.saved).length;
    $('#chips').innerHTML = ['', ...Object.keys(CATS)].map(c =>
      `<button class="chip" data-cat="${c}" aria-pressed="${S.cat === c}">${c || 'Todas'}<small>${c ? posts.filter(p => p.cat === c).length : posts.length}</small></button>`).join('');
    const m = {};
    posts.forEach(p => (p.text.match(TAG) || []).forEach(t => { (m[t.toLowerCase()] ||= { t, n: 0 }).n++; }));
    const top = Object.values(m).sort((a, b) => b.n - a.n).slice(0, 6);
    $('#topics').innerHTML = top.length
      ? top.map(x => `<button class="topic" data-tag="${x.t}">${x.t}<small>${x.n} ${x.n === 1 ? 'noticia' : 'noticias'}</small></button>`).join('')
      : '<p class="muted">Aún no hay etiquetas.</p>';
  }
  const sortUI = () => document.querySelectorAll('#sort button').forEach(x => x.setAttribute('aria-pressed', x.dataset.sort === S.sort));
  function resetFilters() {
    Object.assign(S, { q: '', cat: '', sort: 'new', pdf: false, saved: false, edit: false }); editId = '';
    $('#q').value = ''; $('#onlypdf').checked = false; sortUI();
    setActive($('[data-view=all]'));
  }
  const editor = p => `<div class="ed"><textarea id="ed-text" maxlength="500" rows="4">${esc(p.text)}</textarea>
    <div class="cbar"><select class="ghost" id="ed-cat" aria-label="Categoría">${Object.keys(CATS).map(c => `<option${c === p.cat ? ' selected' : ''}>${c}</option>`).join('')}</select>
    ${p.file ? '<label class="check"><input type="checkbox" id="ed-rm"> Quitar PDF</label>' : ''}<span class="sp"></span>
    <button class="ghost" data-act="cancel">Cancelar</button><button class="btn" data-act="update">Guardar cambios</button></div></div>`;
  function toUpload() {
    Object.assign(S, { saved: false, edit: false }); editId = '';
    setActive($('[data-view=all]')); render();
    window.scrollTo({ top: 0, behavior: 'smooth' }); $('#text').focus({ preventScroll: true });
  }
  function setQ(t) { S.q = t; $('#q').value = t; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  $('#feed').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'new') return toUpload();
    const p = posts.find(x => x.id === b.closest('.post').dataset.id), a = b.dataset.act;
    if (GUEST && (a === 'like' || a === 'save')) return gate('Para apoyar o guardar noticias necesitas una cuenta.');
    if (a === 'edit') { editId = p.id; render(); return $('#ed-text').focus(); }
    if (a === 'cancel') { editId = ''; return render(); }
    if (a === 'update') {
      const t = $('#ed-text').value.trim();
      if (!t) return toast('La noticia no puede quedar vacía.');
      Object.assign(p, { text: t, cat: $('#ed-cat').value, edited: true });
      if ($('#ed-rm')?.checked) delete p.file;
      editId = ''; toast('Cambios guardados.');
    }
    if (a === 'tag') return setQ(b.dataset.t);
    if (a === 'like') { p.liked = !p.liked; p.likes += p.liked ? 1 : -1; }
    if (a === 'save') p.saved = !p.saved;
    if (a === 'share') return navigator.clipboard?.writeText(p.text).then(() => toast('Texto copiado.'), () => toast('No se pudo copiar el texto.'));
    if (a === 'del') { if (!confirm('¿Eliminar esta noticia?')) return; posts = posts.filter(x => x !== p); toast('Noticia eliminada.'); }
    save(); render();
  });

  /* ---------- filtros ---------- */
  $('#q').addEventListener('input', e => { S.q = e.target.value; render(); });
  $('#chips').addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (c) { S.cat = c.dataset.cat; render(); } });
  $('#topics').addEventListener('click', e => { const t = e.target.closest('[data-tag]'); if (t) setQ(t.dataset.tag); });
  $('#sort').addEventListener('click', e => { const b = e.target.closest('[data-sort]'); if (b) { S.sort = b.dataset.sort; sortUI(); render(); } });
  $('#onlypdf').addEventListener('change', e => { S.pdf = e.target.checked; render(); });
  $('#reset').addEventListener('click', () => { resetFilters(); render(); });
  $('#mtoggle').addEventListener('click', e => e.currentTarget.setAttribute('aria-expanded', document.body.classList.toggle('aside-open')));

  /* ---------- panel de control ---------- */
  function setActive(a) {
    $('#nav').querySelectorAll('a').forEach(x => x.removeAttribute('aria-current'));
    a.setAttribute('aria-current', 'page');
  }
  $('#nav').addEventListener('click', e => {
    const a = e.target.closest('a[data-view]');
    if (!a || a.getAttribute('href') !== '#') return;   // si le pones un href real, navega normal
    e.preventDefault();
    const v = a.dataset.view;
    if (GUEST && (v === 'upload' || v === 'edit' || v === 'saved')) return gate('Para subir, editar o guardar noticias necesitas una cuenta.');
    if (v === 'upload') return toUpload();
    if (v === 'settings') return toast(`«${a.querySelector('.lbl').textContent}» todavía no está disponible.`);
    S.saved = v === 'saved'; S.edit = v === 'edit'; editId = ''; setActive(a); render();
  });

  /* ---------- publicar ---------- */
  const tx = $('#text'), pub = $('#pub'), cnt = $('#cnt');
  $('#pcat').innerHTML = Object.keys(CATS).map(c => `<option>${c}</option>`).join('');
  tx.addEventListener('input', () => {
    const left = tx.maxLength - tx.value.length;
    cnt.textContent = left; cnt.classList.toggle('warn', left < 40);
    pub.disabled = !tx.value.trim();
  });
  tx.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') publish(); });
  pub.addEventListener('click', publish);

  function fileUI() {
    $('#fchip').classList.toggle('on', !!S.file);
    if (S.file) $('#fname').textContent = `${S.file.name} (${size(S.file.size)})`;
  }
  async function pickPdf(f) {
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return toast('Solo se aceptan archivos PDF.');
    if (f.size > MAX_PDF) return toast('El PDF pesa más de 2 MB.');
    try {
      const url = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(f); });
      // Comprobación aproximada de páginas; la validación definitiva debe hacerse en el servidor.
      const pages = (atob(url.split(',')[1]).match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
      if (pages > 1) return toast(`El PDF tiene ${pages} hojas. Sube uno de una sola hoja.`);
      S.file = { name: f.name, size: f.size, url }; fileUI();
    } catch { toast('No se pudo leer el archivo.'); }
  }
  $('#attach').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) pickPdf(f); });
  $('#fremove').addEventListener('click', () => { S.file = null; fileUI(); });
  const box = $('#composer');
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drag'); });
  box.addEventListener('dragleave', () => box.classList.remove('drag'));
  box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('drag'); if (e.dataTransfer.files[0]) pickPdf(e.dataTransfer.files[0]); });

  function publish() {
    if (GUEST) return gate('Para publicar necesitas una cuenta.');
    const text = tx.value.trim(); if (!text) return;
    const p = { id: 'p' + Date.now(), text, cat: $('#pcat').value, t: Date.now(), likes: 0, author: ME, file: S.file || undefined };
    posts.unshift(p); freshId = p.id;
    S.file = null; fileUI(); tx.value = ''; tx.dispatchEvent(new Event('input'));
    resetFilters(); save(); render(); toast('Noticia publicada.');
  }

  tx.dispatchEvent(new Event('input'));
  /* ---------- usuario, invitado y aviso de registro ---------- */
  $('#me-av').textContent = ME[0].toUpperCase();
  $('#me-name').textContent = ME;
  $('#me-role').textContent = GUEST ? 'Invitado' : 'Sesión iniciada';
  document.querySelectorAll('[data-out]').forEach(b => {
    b.textContent = GUEST ? 'Ingresar' : 'Salir';
    b.addEventListener('click', () => { localStorage.removeItem(KEYS); location.href = 'login.html'; });
  });
  if (GUEST) { $('#composer').hidden = true; $('#guestbox').hidden = false; }

  const gateEl = $('#gate'); let gateT;
  const lock = on => ['.side', '.topbar', '.app'].forEach(s => $(s).toggleAttribute('inert', on));   // bloquea todo lo de atrás
  function gate(msg) {
    clearTimeout(gateT);
    $('#gate-msg').textContent = msg || 'Llevas un rato leyendo como invitado. Crea una cuenta gratis para publicar, apoyar y guardar noticias.';
    gateEl.classList.add('on'); lock(true); $('#gate-go').focus();
  }
  $('#gate-guest').addEventListener('click', () => {
    gateEl.classList.remove('on'); lock(false);
    gateT = setTimeout(gate, EVERY_MS);
  });
  if (GUEST) gateT = setTimeout(gate, FIRST_MS);

  render();
})();
