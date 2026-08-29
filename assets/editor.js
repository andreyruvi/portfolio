/* =============================================================================
   editor.js — Owner mode. Loaded on demand (#edit, or Ctrl+Shift+E).

   The workflow:

       edit in the page  ->  Save & Download  ->  portfolio-update.zip
                         ->  extract it into your portfolio folder
                         ->  PUBLISH.bat  ->  live site.

   The zip holds a finished index.html, the matching data/site.json, and any
   photos you added — each already resized and converted, at the right path.

   Drafts auto-save into this browser (IndexedDB), so closing the tab mid-edit
   loses nothing. "Reset to file" throws the draft away and goes back to the
   published version.

   Nothing here talks to GitHub. Publishing is PUBLISH.bat's job, using the Git
   login already on your computer.
   ========================================================================== */
import * as R from './render.js';
import { buildPage } from './page.js';
import { DATA, state, renderWork, observeReveal, paintImages, setupCoverFlow } from './app.js';
import { makeZip, textBytes, base64Bytes, download } from './zip.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const LS_OWNER = 'pf.owner';
const DB_NAME = 'pf-portfolio', STORE = 'kv';

let unlocked = false;
let dirty = false;
let ORIGINAL = null;                 // pristine copy of the published content
const pending = new Map();           // repo path -> base64, written into the zip
const stagedDims = new Map();        // repo path -> width/height attributes

/* =========================================================== tiny helpers */
let toastEl;
function toast(msg, kind = 'ok', ms = 3800) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.dataset.kind = kind;
  toastEl.dataset.show = 'true';
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => { toastEl.dataset.show = 'false'; }, ms);
}

function getPath(path) { return path.split('.').reduce((o, k) => (o ? o[k] : ''), DATA); }
function setPath(path, val) {
  const parts = path.split('.');
  const last = parts.pop();
  let o = DATA;
  for (const p of parts) o = o[p];
  o[last] = val;
}

/* ---------------------------------------------------------------- IndexedDB */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(key, val) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch { /* drafts are a convenience, never load-bearing */ }
}
async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const q = tx.objectStore(STORE).get(key);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
  } catch { return undefined; }
}
async function idbDel(key) {
  try {
    const db = await idb();
    await new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = res; tx.onerror = res;
    });
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------- draft state */
/**
 * A draft saved in this browser is NOT published. Conflating the two is how a
 * new project can look saved and still never reach the live site, so say which
 * state we are in, in both places the owner looks.
 */
function markStatus(msg) {
  const bar = $('#editToolbar');
  if (bar) bar.dataset.dirty = dirty ? 'true' : 'false';
  const fab = $('#editFab');
  if (fab) {
    fab.dataset.dirty = dirty ? 'true' : 'false';
    fab.textContent = dirty ? '● Save & Download' : '🔒 Owner edit';
  }
  const st = $('#saveState');
  if (st) st.textContent = msg !== undefined ? msg : (dirty ? 'NOT SAVED TO YOUR FOLDER YET' : 'up to date');
}

let saveTimer = null;
function persist() {
  dirty = true;
  markStatus('saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await idbSet('data', JSON.parse(JSON.stringify(DATA)));
    await idbSet('pending', Object.fromEntries(pending));
    markStatus('NOT DOWNLOADED YET — draft saved in this browser');
  }, 400);
}

async function clearDraft() {
  await idbDel('data');
  await idbDel('pending');
  pending.clear();
  dirty = false;
  markStatus('up to date');
}

/* ==================================================== save & download */
/** Sizes for the <img> tags: from the page for existing photos, from the
 *  canvas for ones added just now. Only a hint that stops the layout jumping. */
function dimsFor(src) {
  if (stagedDims.has(src)) return stagedDims.get(src);
  const el = document.querySelector(`img[src="${CSS.escape(src)}"][width][height]`);
  return el ? ` width="${el.getAttribute('width')}" height="${el.getAttribute('height')}"` : '';
}

/**
 * Hands over everything the site needs, at the paths it needs:
 *   index.html          the finished page
 *   data/site.json      the same content as data, so the two never disagree
 *   images/…            any photo added in this session, full size and thumb
 */
function saveAndDownload() {
  const html = buildPage(DATA, { dims: dimsFor });
  const files = [
    { name: 'index.html', bytes: textBytes(html) },
    { name: 'data/site.json', bytes: textBytes(JSON.stringify(DATA, null, 2)) },
  ];
  for (const [path, b64] of pending) files.push({ name: path, bytes: base64Bytes(b64) });

  download(makeZip(files), 'portfolio-update.zip');

  const photos = [...pending.keys()].filter((k) => !k.startsWith('images/thumb/')).length;
  markStatus('DOWNLOADED — extract it into your folder, then run PUBLISH.bat');
  toast(
    photos
      ? `Downloaded portfolio-update.zip — index.html plus ${photos} new photo${photos > 1 ? 's' : ''}. Extract it INTO your portfolio folder, overwrite when asked, then run PUBLISH.bat.`
      : 'Downloaded portfolio-update.zip with the new index.html. Extract it INTO your portfolio folder, overwrite when asked, then run PUBLISH.bat.',
    'ok', 15000
  );
}

/* ============================================================ image intake */
const MAX_EDGE = 1600, THUMB_EDGE = 800;

const readImage = (file) => new Promise((res, rej) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); res(img); };
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('not an image')); };
  img.src = url;
});

function encode(img, maxEdge, quality) {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { b64: c.toDataURL('image/webp', quality).split(',')[1], w: c.width, h: c.height };
}

const fileToBase64 = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(',')[1]);
  fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(file);
});

/**
 * Next free file name. Starts from the high-water mark the build recorded from
 * the images folder itself — the JSON alone does not know about files that sit
 * on disk unreferenced, and reusing one of those numbers would overwrite a
 * photo that is still in the repository.
 */
function nextName(ext) {
  const stem = ext === 'pdf' ? 'doc' : 'img';
  const re = new RegExp(`${stem}-(\\d+)\\.${ext}$`);
  let max = Number(DATA.counters?.[stem === 'doc' ? 'doc' : 'img']) || 0;
  const scan = (s) => { const m = re.exec(s || ''); if (m) max = Math.max(max, +m[1]); };
  scan(DATA.profile.avatar); scan(DATA.profile.cover);
  (DATA.profile.covers || []).forEach(scan);
  DATA.projects.forEach((p) => { scan(p.image); (p.media || []).forEach((m) => scan(m.src)); });
  pending.forEach((_, p) => scan(p));
  return `${stem}-${String(max + 1).padStart(3, '0')}.${ext}`;
}

/** Shrink in the browser, queue both derivatives, return the site-relative path. */
async function stageImage(file) {
  const img = await readImage(file);
  const name = nextName('webp');
  const full = encode(img, MAX_EDGE, 0.82);
  const thumb = encode(img, THUMB_EDGE, 0.72);
  pending.set(`images/${name}`, full.b64);
  pending.set(`images/thumb/${name}`, thumb.b64);
  stagedDims.set(`images/${name}`, ` width="${full.w}" height="${full.h}"`);
  stagedDims.set(`images/thumb/${name}`, ` width="${thumb.w}" height="${thumb.h}"`);
  return { type: 'image', src: `images/${name}` };
}

async function stagePdf(file) {
  const name = nextName('pdf');
  pending.set(`files/${name}`, await fileToBase64(file));
  return { type: 'pdf', src: `files/${name}` };
}

function pickFiles({ multiple = true, pdf = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = pdf ? 'image/*,application/pdf' : 'image/*';
    input.multiple = multiple;
    input.addEventListener('change', async () => {
      const out = [];
      for (const f of Array.from(input.files || [])) {
        try {
          out.push(f.type === 'application/pdf' ? await stagePdf(f) : await stageImage(f));
        } catch { toast(`Skipped ${f.name} — could not read it`, 'err'); }
      }
      resolve(out);
    });
    input.click();
  });
}

/* ============================================================ re-rendering */
export function renderAll() {
  const p = DATA.profile;

  $$('[data-field]').forEach((el) => {
    const v = getPath(el.getAttribute('data-field'));
    if (el.textContent !== (v || '')) el.textContent = v || '';
  });

  $('#brandName').textContent = p.name;
  $('#verifiedBadge').hidden = !p.verified;
  $('#availDot').hidden = !p.available;
  $('#statusCell').innerHTML = p.available ? '<span class="mini-dot"></span>Available' : 'Busy';
  $('#avatarImg').src = R.thumbOf(p.avatar) || p.avatar || '';
  $('#coverSlides').innerHTML = R.renderCoverSlides(DATA);
  setupCoverFlow();

  $('#tools').innerHTML = R.renderTools(DATA, state.editing);
  $('#svcGrid').innerHTML = R.renderServices(DATA, state.editing);
  $('#ctaRow').innerHTML = R.renderCta(DATA);
  $('#contactInfo').innerHTML = R.renderContact(DATA, state.editing);
  renderWork();

  bindInline();
  paintImages();
  observeReveal();
  $$('.rise').forEach((el) => el.classList.add('in'));
}

function bindInline() {
  const on = state.editing;

  $$('[data-field]').forEach((el) => {
    if (on) {
      el.setAttribute('contenteditable', 'true');
      if (!el._bound) {
        el._bound = true;
        el.addEventListener('blur', () => { setPath(el.getAttribute('data-field'), el.textContent.trim()); persist(); });
        el.addEventListener('paste', (e) => {
          e.preventDefault();
          document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text'));
        });
      }
    } else {
      el.removeAttribute('contenteditable');
    }
  });

  if (!on) return;

  $$('#tools .tname').forEach((el) => {
    el.addEventListener('blur', () => { DATA.tools[+el.dataset.ti] = el.textContent.trim(); persist(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  });

  $$('#svcGrid [data-si]').forEach((el) => {
    el.addEventListener('blur', () => {
      DATA.services[+el.dataset.si][el.dataset.sk] = el.textContent.trim();
      persist();
    });
  });

  $$('#contactInfo [data-cpath]').forEach((el) => {
    el.addEventListener('blur', () => {
      setPath(el.dataset.cpath, el.textContent.trim());
      $('#ctaRow').innerHTML = R.renderCta(DATA);
      persist();
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  });
}

/** Scroll to a card and pulse it, so a save is visibly a save. */
function flashCard(id) {
  requestAnimationFrame(() => {
    const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.add('just-saved');
    setTimeout(() => card.classList.remove('just-saved'), 2400);
  });
}

/* =============================================================== modals */
function modal(title, sub, bodyHTML, actions) {
  const wrap = document.createElement('div');
  wrap.className = 'pm';
  wrap.innerHTML = `<div class="pm-box" role="dialog" aria-modal="true">
      <h3>${R.esc(title)}</h3>${sub ? `<p class="sub">${R.esc(sub)}</p>` : ''}
      <div class="pm-body">${bodyHTML}</div>
      <div class="pm-actions"></div></div>`;
  const bar = $('.pm-actions', wrap);
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.className = 'btn' + (a.primary ? ' primary' : '');
    b.type = 'button';
    b.textContent = a.label;
    b.addEventListener('click', () => a.onClick(wrap));
    bar.appendChild(b);
  });
  const esc = (e) => { if (e.key === 'Escape') { wrap.remove(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
  document.body.appendChild(wrap);
  $('input, textarea, select', wrap)?.focus();
  return wrap;
}

function confirmBox(heading, text, onOk) {
  modal(heading, text, '', [
    { label: 'Cancel', onClick: (m) => m.remove() },
    { label: 'Delete', primary: true, onClick: (m) => { m.remove(); onOk(); } },
  ]);
}

/* ---------------------------------------------------------- edit details */
function openDetails() {
  const p = DATA.profile, c = DATA.contact;
  const box = modal('Edit details', 'Tools, contact channels and the two badges.', `
      <label>Tools / software (comma-separated)</label>
      <input id="dTools" type="text" value="${R.attr(DATA.tools.join(', '))}">
      <label>Contact email</label>
      <input id="dEmail" type="text" value="${R.attr(c.email || '')}">
      <label>WhatsApp number (with country code, e.g. +8490…)</label>
      <input id="dWhatsapp" type="text" value="${R.attr(c.whatsapp || '')}">
      <label>Telegram — handle or full URL</label>
      <input id="dTelegram" type="text" value="${R.attr(c.telegram || '')}" placeholder="@yourhandle">
      <label>X (Twitter) — handle or full URL</label>
      <input id="dX" type="text" value="${R.attr(c.x || '')}" placeholder="@yourhandle">
      <label>Instagram — handle or full URL</label>
      <input id="dInstagram" type="text" value="${R.attr(c.instagram || '')}" placeholder="@yourhandle">
      <label>Available for work?</label>
      <select id="dAvailable">
        <option value="yes"${p.available ? ' selected' : ''}>Yes — show green “Available”</option>
        <option value="no"${p.available ? '' : ' selected'}>No — show “Busy”</option>
      </select>
      <label>Verified badge?</label>
      <select id="dVerified">
        <option value="yes"${p.verified ? ' selected' : ''}>Show badge</option>
        <option value="no"${p.verified ? '' : ' selected'}>Hide badge</option>
      </select>`, [
    { label: 'Cancel', onClick: (m) => m.remove() },
    { label: 'Save details', primary: true, onClick: (m) => {
        DATA.tools = $('#dTools', m).value.split(',').map((s) => s.trim()).filter(Boolean);
        DATA.contact.email     = $('#dEmail', m).value.trim();
        DATA.contact.whatsapp  = $('#dWhatsapp', m).value.trim();
        DATA.contact.telegram  = $('#dTelegram', m).value.trim();
        DATA.contact.x         = $('#dX', m).value.trim();
        DATA.contact.instagram = $('#dInstagram', m).value.trim();
        DATA.profile.available = $('#dAvailable', m).value === 'yes';
        DATA.profile.verified  = $('#dVerified', m).value === 'yes';
        m.remove(); persist(); renderAll();
        toast('Details updated. Save & Download when you are finished.');
      } },
  ]);
  return box;
}

/* ----------------------------------------------------------- cover photos */
function openCover() {
  const m = modal('Cover photos', 'Upload one or more images — they crossfade as a slideshow. The first one shows first; use ◄ ► to reorder.', `
      <div id="coverList" class="media-list"></div>
      <button class="btn" type="button" id="coverAddFiles" style="width:100%;justify-content:center;margin-top:.6rem">⢒ Add cover images from device</button>
      <div class="pm-row"><input id="coverUrl" type="text" placeholder="…or paste an image URL"><button class="btn" type="button" id="coverAddUrl">Add</button></div>`, [
    { label: 'Done', primary: true, onClick: (w) => w.remove() },
  ]);

  const covers = () => (DATA.profile.covers ||= []);
  function sync() {
    DATA.profile.cover = covers()[0] || '';
    persist();
    $('#coverSlides').innerHTML = R.renderCoverSlides(DATA);
    setupCoverFlow();
    paint();
  }
  function paint() {
    $('#coverList', m).innerHTML = R.renderMediaList(covers(), 'cover');
    $$('[data-crm]', m).forEach((b) => b.addEventListener('click', () => { covers().splice(+b.dataset.crm, 1); sync(); }));
    $$('[data-cmv]', m).forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i, j = b.dataset.cmv === 'up' ? i - 1 : i + 1;
      const a = covers();
      if (j < 0 || j >= a.length) return;
      [a[i], a[j]] = [a[j], a[i]];
      sync();
    }));
  }
  $('#coverAddFiles', m).addEventListener('click', async () => {
    const added = await pickFiles({ multiple: true });
    covers().push(...added.filter((x) => x.type === 'image').map((x) => x.src));
    sync();
  });
  $('#coverAddUrl', m).addEventListener('click', () => {
    const v = $('#coverUrl', m).value.trim();
    if (!v) return;
    covers().push(v);
    $('#coverUrl', m).value = '';
    sync();
  });
  $('#coverUrl', m).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#coverAddUrl', m).click(); }
  });
  paint();
}

/* -------------------------------------------------------- project editor */
function openProject(id) {
  const isNew = !id;
  const pr = isNew
    ? { id: 'p' + Date.now(), title: '', category: (DATA.categories.find((c) => c !== 'All') || 'Project'), desc: '', image: '', media: [] }
    : DATA.projects.find((x) => x.id === id);
  if (!pr) return;

  const draft = JSON.parse(JSON.stringify(pr));

  const m = modal(isNew ? 'Add project' : 'Edit project', 'The first image is the cover shown in the grid.', `
      <label>Title</label>
      <input id="pmTitle" type="text" value="${R.attr(draft.title)}">
      <label>Category</label>
      <select id="pmCategory"></select>
      <div class="pm-cats" id="pmCatList"></div>
      <div class="pm-row"><input id="pmCatNew" type="text" placeholder="Add a new category"><button class="btn" type="button" id="pmCatAdd">Add</button></div>
      <label>Description</label>
      <textarea id="pmDesc">${R.esc(draft.desc || '')}</textarea>
      <label>Images &amp; PDFs</label>
      <div id="pmMediaList" class="media-list"></div>
      <button class="btn" type="button" id="pmAddFiles" style="width:100%;justify-content:center;margin-top:.6rem">⤒ Add images / PDFs from device</button>
      <div class="pm-row"><input id="pmMediaUrl" type="text" placeholder="…or paste an image / PDF URL"><button class="btn" type="button" id="pmAddUrl">Add</button></div>`, [
    { label: 'Cancel', onClick: (w) => w.remove() },
    { label: 'Save project', primary: true, onClick: (w) => {
        draft.title = $('#pmTitle', w).value.trim() || 'Untitled project';
        draft.category = $('#pmCategory', w).value;
        draft.desc = $('#pmDesc', w).value;
        draft.image = R.projThumb(draft) || '';
        if (isNew) DATA.projects.unshift(draft);
        else Object.assign(DATA.projects.find((x) => x.id === id), draft);

        // If a category filter is active and the project does not match it, the
        // card would be created and then immediately hidden. Move the filter to
        // where the project actually is.
        if (state.filter !== 'All' && state.filter !== draft.category) {
          state.filter = DATA.categories.includes(draft.category) ? draft.category : 'All';
        }

        w.remove(); persist(); renderAll();
        flashCard(draft.id);
        toast(isNew
          ? 'Project added — remember to Save & Download, it is not live yet.'
          : 'Project updated — remember to Save & Download, it is not live yet.', 'ok', 7000);
      } },
  ]);

  function paintCats() {
    // Older data can carry a category that never made it into the filter list.
    // Register it rather than quietly reassigning the project to another one.
    if (draft.category && !DATA.categories.includes(draft.category)) {
      DATA.categories.push(draft.category);
      persist();
    }
    const cats = DATA.categories.filter((c) => c !== 'All');
    if (!cats.includes(draft.category) && cats.length) draft.category = cats[0];
    $('#pmCategory', m).innerHTML = cats
      .map((c) => `<option${c === draft.category ? ' selected' : ''}>${R.esc(c)}</option>`).join('');
    $('#pmCatList', m).innerHTML = cats
      .map((c) => `<span class="pm-cat">${R.esc(c)}<button class="pm-cat-x" type="button" data-cat="${R.attr(c)}">✕</button></span>`).join('');
    $$('[data-cat]', m).forEach((b) => b.addEventListener('click', () => {
      removeCategory(b.dataset.cat);
      paintCats();
    }));
  }
  function paintMedia() {
    $('#pmMediaList', m).innerHTML = R.renderMediaList(draft.media || [], 'pm');
    $$('[data-rm]', m).forEach((b) => b.addEventListener('click', () => { draft.media.splice(+b.dataset.rm, 1); paintMedia(); }));
    $$('[data-mv]', m).forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i, j = b.dataset.mv === 'up' ? i - 1 : i + 1;
      const a = draft.media;
      if (j < 0 || j >= a.length) return;
      [a[i], a[j]] = [a[j], a[i]];
      paintMedia();
    }));
  }
  $('#pmCatAdd', m).addEventListener('click', () => {
    const v = $('#pmCatNew', m).value.trim();
    if (v && !DATA.categories.includes(v)) { DATA.categories.push(v); draft.category = v; persist(); }
    $('#pmCatNew', m).value = '';
    paintCats();
  });
  $('#pmCatNew', m).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#pmCatAdd', m).click(); }
  });
  $('#pmAddFiles', m).addEventListener('click', async () => {
    draft.media.push(...await pickFiles({ multiple: true, pdf: true }));
    paintMedia();
  });
  $('#pmAddUrl', m).addEventListener('click', () => {
    const v = $('#pmMediaUrl', m).value.trim();
    if (!v) return;
    draft.media.push({ type: /\.pdf($|\?)/i.test(v) ? 'pdf' : 'image', src: v });
    $('#pmMediaUrl', m).value = '';
    paintMedia();
  });
  $('#pmMediaUrl', m).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#pmAddUrl', m).click(); }
  });

  paintCats();
  paintMedia();
}

/* ------------------------------------------------------------ categories */
function removeCategory(name) {
  DATA.categories = DATA.categories.filter((c) => c !== name);
  if (!DATA.categories.includes('All')) DATA.categories.unshift('All');
  if (state.filter === name) state.filter = 'All';
  persist();
  renderAll();
}

function addCategoryInline() {
  const add = $('#filterAdd');
  if (!add) return;
  const input = document.createElement('input');
  input.className = 'filter-input';
  input.placeholder = 'New category';
  add.replaceWith(input);
  input.focus();
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (v && !DATA.categories.includes(v)) { DATA.categories.push(v); persist(); }
    renderAll();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { done = true; renderAll(); }
  });
  input.addEventListener('blur', commit);
}

/* ------------------------------------------------- delegated edit actions */
document.addEventListener('click', (e) => {
  if (!state.editing) return;
  const t = e.target;

  if (t.closest('[data-tool-add]')) { DATA.tools.push('New tool'); persist(); renderAll(); return; }
  const tr = t.closest('[data-tool-remove]');
  if (tr) { DATA.tools.splice(+tr.dataset.toolRemove, 1); persist(); renderAll(); return; }

  if (t.closest('[data-svc-add]')) {
    DATA.services.push({ title: 'New service', desc: 'Describe this service.' });
    persist(); renderAll(); return;
  }
  const sr = t.closest('[data-svc-remove]');
  if (sr) {
    const i = +sr.dataset.svcRemove;
    confirmBox('Remove service?', `“${DATA.services[i].title}” will be removed.`, () => {
      DATA.services.splice(i, 1); persist(); renderAll(); toast('Service removed.');
    });
    return;
  }

  if (t.closest('#filterAdd')) { addCategoryInline(); return; }
  const fx = t.closest('[data-fx]');
  if (fx) { e.stopPropagation(); removeCategory(fx.dataset.fx); return; }

  if (t.closest('[data-proj-add]')) { openProject(null); return; }
  const pe = t.closest('[data-proj-edit]');
  if (pe) { e.stopPropagation(); openProject(pe.dataset.projEdit); return; }
  const pd = t.closest('[data-proj-del]');
  if (pd) {
    e.stopPropagation();
    const pr = DATA.projects.find((x) => x.id === pd.dataset.projDel);
    confirmBox('Delete project?', `“${pr?.title || ''}” will be removed from your portfolio.`, () => {
      DATA.projects = DATA.projects.filter((x) => x.id !== pd.dataset.projDel);
      persist(); renderAll(); toast('Project deleted.');
    });
  }
}, true);

/* ============================================================== unlocking */
function toolbar() {
  if ($('#editToolbar')) return;
  const bar = document.createElement('div');
  bar.className = 'edit-toolbar';
  bar.id = 'editToolbar';
  bar.innerHTML = `
    <span class="status">◆ EDIT MODE — edits auto-save in this browser. <span id="saveState" style="opacity:.75"></span></span>
    <button type="button" id="tbAddProject">＋ Add project</button>
    <button type="button" id="tbDetails">⚙ Edit details</button>
    <button type="button" id="tbCover">⟲ Cover photos</button>
    <button type="button" id="tbAvatar">⟲ Change photo</button>
    <button type="button" id="tbKey">Change password</button>
    <button type="button" id="tbReset">↺ Reset to file</button>
    <button type="button" class="save" id="tbDownload">⤓ Save &amp; Download</button>
    <button type="button" id="tbExit">Exit</button>`;
  document.body.appendChild(bar);

  $('#tbAddProject').addEventListener('click', () => openProject(null));
  $('#tbDetails').addEventListener('click', openDetails);
  $('#tbCover').addEventListener('click', openCover);
  $('#tbAvatar').addEventListener('click', async () => {
    const [img] = await pickFiles({ multiple: false });
    if (!img) return;
    DATA.profile.avatar = img.src;
    persist(); renderAll();
    toast('Profile photo replaced.');
  });
  $('#tbKey').addEventListener('click', openChangeKey);
  $('#tbReset').addEventListener('click', () => {
    confirmBox('Throw away local changes?', 'Everything goes back to the version currently on your website.', async () => {
      Object.keys(DATA).forEach((k) => delete DATA[k]);
      Object.assign(DATA, JSON.parse(JSON.stringify(ORIGINAL)));
      await clearDraft();
      renderAll();
      const st = $('#saveState'); if (st) st.textContent = '';
      toast('Back to the published version.');
    });
  });
  $('#tbDownload').addEventListener('click', saveAndDownload);
  $('#tbExit').addEventListener('click', () => {
    if (dirty && !confirm('You have changes that are not downloaded yet. Leave edit mode anyway?')) return;
    localStorage.removeItem(LS_OWNER);
    location.hash = '';
    location.reload();
  });

  $('#coverEditBtn').hidden = false;
  $('#avatarEditBtn').hidden = false;
  $('#coverEditBtn').addEventListener('click', openCover);
  $('#avatarEditBtn').addEventListener('click', () => $('#tbAvatar').click());
}

function openChangeKey() {
  modal('Change password', 'This is the key you type to open owner mode. It is stored in data/site.json, so Save & Download and publish after changing it.', `
      <label>New password</label>
      <input id="ckNew" type="password" autocomplete="new-password">
      <label>Type it again</label>
      <input id="ckNew2" type="password" autocomplete="new-password">`, [
    { label: 'Cancel', onClick: (m) => m.remove() },
    { label: 'Change', primary: true, onClick: (m) => {
        const a = $('#ckNew', m).value, b = $('#ckNew2', m).value;
        if (!a) { toast('Enter a password.', 'err'); return; }
        if (a !== b) { toast('The two passwords do not match.', 'err'); return; }
        DATA.editor.editKey = a;
        m.remove(); persist();
        toast('Password changed. Save & Download, then run PUBLISH.bat to make it live.');
      } },
  ]);
}

async function unlock() {
  unlocked = true;
  state.editing = true;
  localStorage.setItem(LS_OWNER, '1');
  document.body.setAttribute('data-edit-on', '');
  toolbar();

  const draft = await idbGet('data');
  const savedPending = await idbGet('pending');
  if (draft) {
    Object.keys(DATA).forEach((k) => delete DATA[k]);
    Object.assign(DATA, draft);
    if (savedPending) Object.entries(savedPending).forEach(([k, v]) => pending.set(k, v));
    dirty = true;
    markStatus('NOT DOWNLOADED YET — draft restored');
    toast('Restored the draft you were working on in this browser. It is not on your website yet — use Save & Download.', 'ok', 9000);
  }

  renderAll();
  $$('.hint').forEach((h) => h.setAttribute('data-show', ''));
  toast('Edit anything you like. When you are done: Save & Download, extract into your folder, then PUBLISH.bat.', 'ok', 9000);
  markStatus();
}

function askUnlock() {
  modal('Owner login', 'Enter your password to edit the site.', `
      <label>Password</label>
      <input id="uKey" type="password" autocomplete="current-password">`, [
    { label: 'Cancel', onClick: (m) => m.remove() },
    { label: 'Unlock', primary: true, onClick: (m) => {
        if ($('#uKey', m).value !== (DATA.editor?.editKey || '')) { toast('Wrong password.', 'err'); return; }
        m.remove();
        unlock();
      } },
  ]);
}

/* ==================================================================== init */
/** Entry point for the always-visible Owner edit button in the page. */
export function requestUnlock() {
  if (unlocked) saveAndDownload();
  else askUnlock();
}

export function init() {
  ORIGINAL = JSON.parse(JSON.stringify(DATA));

  window.addEventListener('beforeunload', (e) => {
    if (dirty || pending.size) { e.preventDefault(); e.returnValue = ''; }
  });

  if (localStorage.getItem(LS_OWNER) === '1') askUnlock();
}
