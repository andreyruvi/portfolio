/* =============================================================================
   editor.js — Owner mode.

   Loaded on demand (visit the site with #edit, or press Ctrl+Shift+E).
   Lets the owner edit content in the live page and publish straight to GitHub:

       edit in browser  ->  Publish  ->  commit to data/site.json
                        ->  GitHub Actions rebuilds index.html
                        ->  live site updates, ~1 minute, no PC needed.

   The GitHub token is kept only in this browser's localStorage. It is never
   written into the repository and never leaves the browser except in requests
   to api.github.com.
   ========================================================================== */
(() => {
  'use strict';

  const API = 'https://api.github.com';
  const LS_TOKEN = 'pf.gh';
  const LS_OWNER = 'pf.owner';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  let data = null;      // working copy of site.json
  let repo = 'andreyruvi/portfolio';
  let branch = 'main';
  let editKey = '';
  let unlocked = false;
  let dirty = false;
  const pendingFiles = new Map();   // path -> base64 (new images to commit)

  /* --------------------------------------------------------------- toast */
  let toastEl;
  function toast(msg, kind = 'ok', ms = 3600) {
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

  /* --------------------------------------------------------------- modal */
  function modal(title, subtitle, bodyHTML, actions) {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true">
        <h3>${title}</h3>
        ${subtitle ? `<p>${subtitle}</p>` : ''}
        <div class="modal-body">${bodyHTML}</div>
        <div class="modal-actions"></div>
      </div>`;
    const bar = $('.modal-actions', wrap);
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.className = `btn btn-sm${a.ghost ? ' ghost' : ''}`;
      b.type = 'button';
      b.textContent = a.label;
      b.addEventListener('click', () => a.onClick(wrap));
      bar.appendChild(b);
    });
    wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { wrap.remove(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(wrap);
    $('input, textarea, select', wrap)?.focus();
    return wrap;
  }

  /* -------------------------------------------------------------- github */
  const token = () => localStorage.getItem(LS_TOKEN) || '';

  async function gh(path, options = {}) {
    const res = await fetch(API + path, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch { /* ignore */ }
      throw new Error(`GitHub ${res.status}: ${detail || res.statusText}`);
    }
    return res.status === 204 ? null : res.json();
  }

  /**
   * One atomic commit containing data/site.json plus any newly added images.
   * Uses the Git Data API (blobs -> tree -> commit -> ref) so the whole change
   * lands as a single commit and a single Actions run.
   */
  async function publish(message) {
    const ref = await gh(`/repos/${repo}/git/ref/heads/${branch}`);
    const baseSha = ref.object.sha;
    const baseCommit = await gh(`/repos/${repo}/git/commits/${baseSha}`);

    const tree = [];

    const jsonBlob = await gh(`/repos/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({
        content: JSON.stringify(data, null, 2),
        encoding: 'utf-8',
      }),
    });
    tree.push({ path: 'data/site.json', mode: '100644', type: 'blob', sha: jsonBlob.sha });

    for (const [path, base64] of pendingFiles) {
      const blob = await gh(`/repos/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: base64, encoding: 'base64' }),
      });
      tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    const newTree = await gh(`/repos/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
    });
    const commit = await gh(`/repos/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }),
    });
    await gh(`/repos/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    });
    return commit.sha;
  }

  /* --------------------------------------------------------- image intake */
  const MAX_EDGE = 1600;
  const THUMB_EDGE = 800;

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')); };
      img.src = url;
    });
  }

  function encode(img, maxEdge, quality) {
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/webp', quality);
    return url.split(',')[1];
  }

  function nextImageName() {
    let max = 0;
    const scan = (s) => {
      const m = /img-(\d+)\.webp$/.exec(s || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    };
    scan(data.profile.avatar); scan(data.profile.cover);
    (data.profile.covers || []).forEach(scan);
    data.projects.forEach((p) => { scan(p.image); (p.media || []).forEach((m) => scan(m.src)); });
    pendingFiles.forEach((_, path) => scan(path));
    return `img-${String(max + 1).padStart(3, '0')}.webp`;
  }

  /** Resize on the client, queue both derivatives, return the site-relative path. */
  async function stageImage(file) {
    const img = await readImage(file);
    const name = nextImageName();
    pendingFiles.set(`images/${name}`, encode(img, MAX_EDGE, 0.82));
    pendingFiles.set(`images/thumb/${name}`, encode(img, THUMB_EDGE, 0.72));
    return `images/${name}`;
  }

  async function pickImages(multiple = true) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = multiple;
      input.addEventListener('change', async () => {
        const out = [];
        for (const file of Array.from(input.files || [])) {
          try { out.push(await stageImage(file)); }
          catch { toast(`Skipped ${file.name} — not a readable image`, 'err'); }
        }
        resolve(out);
      });
      input.click();
    });
  }

  /* ------------------------------------------------------- inline editing */
  function markDirty() {
    dirty = true;
    const fab = $('#editFab');
    if (fab) fab.textContent = '● Unsaved changes — Publish';
  }

  function setPath(obj, dotted, value) {
    const parts = dotted.split('.');
    const last = parts.pop();
    let cur = obj;
    for (const p of parts) cur = cur[p];
    cur[last] = value;
  }

  function enableInline(on) {
    document.body.toggleAttribute('data-edit-on', on);
    $$('[data-field]').forEach((el) => {
      el.contentEditable = on ? 'true' : 'false';
      if (on && !el._bound) {
        el._bound = true;
        el.addEventListener('input', () => {
          setPath(data, el.dataset.field, el.textContent.trim());
          markDirty();
        });
        el.addEventListener('paste', (e) => {
          e.preventDefault();
          document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text'));
        });
      }
    });
  }

  /* ------------------------------------------------------- content panels */
  function editServices() {
    const body = data.services
      .map(
        (s, i) => `
        <div class="field">
          <label>Service ${i + 1} — title</label>
          <input data-svc-title="${i}" value="${s.title.replace(/"/g, '&quot;')}">
        </div>
        <div class="field">
          <label>Service ${i + 1} — description</label>
          <textarea data-svc-desc="${i}">${s.desc.replace(/</g, '&lt;')}</textarea>
        </div>`
      )
      .join('<hr style="border:0;border-top:1px solid var(--line);margin:1.25rem 0">');

    modal('Edit services', 'Put each bullet on its own line, after a line that says “Services Include:”.', body, [
      { label: 'Cancel', ghost: true, onClick: (m) => m.remove() },
      {
        label: 'Apply',
        onClick: (m) => {
          $$('[data-svc-title]', m).forEach((i) => { data.services[+i.dataset.svcTitle].title = i.value.trim(); });
          $$('[data-svc-desc]', m).forEach((t) => { data.services[+t.dataset.svcDesc].desc = t.value; });
          markDirty();
          m.remove();
          toast('Services updated — press Publish when you are done.');
        },
      },
    ]);
  }

  function editProject(id) {
    const p = data.projects.find((x) => x.id === id);
    if (!p) return;
    const cats = data.categories.filter((c) => c !== 'All');

    const body = `
      <div class="field"><label>Title</label><input id="pTitle" value="${p.title.replace(/"/g, '&quot;')}"></div>
      <div class="field"><label>Category</label>
        <select id="pCat">${cats
          .map((c) => `<option${c === p.category ? ' selected' : ''}>${c}</option>`)
          .join('')}</select></div>
      <div class="field"><label>Description</label><textarea id="pDesc">${(p.desc || '').replace(/</g, '&lt;')}</textarea></div>
      <div class="field"><label>Images (${(p.media || []).length})</label>
        <div id="pMedia" style="display:flex;flex-wrap:wrap;gap:.4rem"></div>
      </div>`;

    const m = modal(`Edit project`, 'Click an image to remove it. The first image is the cover.', body, [
      { label: 'Delete project', ghost: true, onClick: (mm) => {
          if (!confirm(`Delete “${p.title}”? This cannot be undone.`)) return;
          data.projects = data.projects.filter((x) => x.id !== id);
          markDirty(); mm.remove(); renderShell();
          toast('Project removed — press Publish to make it live.');
        } },
      { label: 'Add images', ghost: true, onClick: async () => {
          const added = await pickImages(true);
          p.media = (p.media || []).concat(added.map((src) => ({ type: 'image', src })));
          if (!p.image && p.media[0]) p.image = p.media[0].src;
          markDirty(); paintMedia();
          toast(`${added.length} image(s) added.`);
        } },
      { label: 'Apply', onClick: (mm) => {
          p.title = $('#pTitle', mm).value.trim();
          p.category = $('#pCat', mm).value;
          p.desc = $('#pDesc', mm).value;
          markDirty(); mm.remove(); renderShell();
          toast('Project updated — press Publish when you are done.');
        } },
    ]);

    function paintMedia() {
      const box = $('#pMedia', m);
      box.innerHTML = (p.media || [])
        .map(
          (mm, i) =>
            `<button type="button" data-i="${i}" title="Remove" style="width:62px;aspect-ratio:4/3;border:1px solid var(--line);border-radius:2px;overflow:hidden;padding:0">
               <img src="${mm.src}" alt="" style="width:100%;height:100%;object-fit:cover"></button>`
        )
        .join('');
      $$('button', box).forEach((b) =>
        b.addEventListener('click', () => {
          p.media.splice(+b.dataset.i, 1);
          if (p.media[0]) p.image = p.media[0].src;
          markDirty(); paintMedia();
        })
      );
    }
    paintMedia();
  }

  async function addProject() {
    const images = await pickImages(true);
    if (!images.length) return;
    const cats = data.categories.filter((c) => c !== 'All');
    data.projects.unshift({
      id: `p${Date.now()}`,
      title: 'New project',
      category: cats[0] || 'Project',
      desc: '',
      image: images[0],
      media: images.map((src) => ({ type: 'image', src })),
    });
    markDirty();
    renderShell();
    toast('Project added — click it to set the title and category.');
  }

  /* ------------------------------------------------------- editor chrome */
  function renderShell() {
    // Repaint project cards so added/removed/renamed projects show immediately,
    // without waiting for the Actions rebuild.
    const gallery = $('#gallery');
    if (!gallery) return;
    gallery.innerHTML = data.projects
      .map((p) => {
        const cover = (p.image || '').replace('images/', 'images/thumb/');
        const n = (p.media || []).length;
        return `<button class="card rise in" type="button" data-id="${p.id}" data-cat="${p.category || ''}">
            <div class="card-media"><img class="on" src="${cover}" alt="${p.title}" loading="lazy">
              ${n ? `<span class="card-count">${n} image${n > 1 ? 's' : ''}</span>` : ''}</div>
            <div class="card-body"><div class="card-cat">${p.category || 'Project'}</div>
              <h3 class="card-title">${p.title}</h3></div>
          </button>`;
      })
      .join('');
    $$('.card', gallery).forEach((c) =>
      c.addEventListener('click', () => (unlocked ? editProject(c.dataset.id) : null))
    );
  }

  function toolbar() {
    if ($('#editBar')) return;
    const bar = document.createElement('div');
    bar.id = 'editBar';
    bar.style.cssText =
      'position:fixed;left:1rem;bottom:1rem;z-index:95;display:flex;flex-wrap:wrap;gap:.4rem;max-width:calc(100vw - 2rem)';
    const mk = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'edit-fab';
      b.style.position = 'static';
      b.textContent = label;
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    };
    mk('+ Project', addProject);
    mk('Services', editServices);
    mk('Cover photo', async () => {
      const [src] = await pickImages(false);
      if (!src) return;
      data.profile.cover = src;
      const hero = $('#heroMedia img');
      if (hero) hero.src = src;
      markDirty();
      toast('Cover replaced.');
    });
    mk('Availability', () => {
      data.profile.available = !data.profile.available;
      markDirty();
      toast(`Status: ${data.profile.available ? 'Available for work' : 'Fully booked'}`);
    });
    mk('Sign out', () => {
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_OWNER);
      location.hash = '';
      location.reload();
    });
    document.body.appendChild(bar);
  }

  async function doPublish() {
    if (!dirty && !pendingFiles.size) { toast('Nothing to publish yet.'); return; }
    const fab = $('#editFab');
    fab.textContent = 'Publishing…';
    fab.disabled = true;
    try {
      const sha = await publish(`Update site content (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`);
      pendingFiles.clear();
      dirty = false;
      fab.textContent = '✓ Published';
      fab.disabled = false;
      toast(`Published ${sha.slice(0, 7)}. The live site updates in about a minute.`, 'ok', 7000);
      setTimeout(() => { fab.textContent = 'Owner edit'; }, 6000);
    } catch (err) {
      fab.textContent = '● Unsaved changes — Publish';
      fab.disabled = false;
      toast(String(err.message || err), 'err', 9000);
    }
  }

  function unlock() {
    unlocked = true;
    localStorage.setItem(LS_OWNER, '1');
    enableInline(true);
    toolbar();
    renderShell();
    const fab = $('#editFab');
    fab.dataset.on = 'true';
    fab.textContent = 'Owner edit';
    fab.onclick = doPublish;
    toast('Owner mode on. Click any text to edit it, then press Publish.', 'ok', 6000);
  }

  function askUnlock() {
    modal(
      'Owner sign-in',
      'Your GitHub token is stored only in this browser. Anyone using this device could publish, so sign out on shared computers.',
      `<div class="field"><label>Edit key</label><input id="uKey" type="password" autocomplete="off"></div>
       <div class="field"><label>GitHub token${token() ? ' (saved — leave blank to reuse)' : ''}</label>
         <input id="uTok" type="password" autocomplete="off" placeholder="github_pat_…"></div>`,
      [
        { label: 'Cancel', ghost: true, onClick: (m) => m.remove() },
        {
          label: 'Unlock',
          onClick: (m) => {
            if ($('#uKey', m).value !== editKey) { toast('Wrong edit key.', 'err'); return; }
            const t = $('#uTok', m).value.trim();
            if (t) localStorage.setItem(LS_TOKEN, t);
            if (!token()) { toast('A GitHub token is required to publish.', 'err'); return; }
            m.remove();
            unlock();
          },
        },
      ]
    );
  }

  /* ----------------------------------------------------------------- init */
  function init(site) {
    if (!site) { toast('Site data missing.', 'err'); return; }
    data = JSON.parse(JSON.stringify(site));
    repo = site.editor?.repo || repo;
    branch = site.editor?.branch || branch;
    editKey = site.editor?.editKey || '';

    const fab = document.createElement('button');
    fab.id = 'editFab';
    fab.className = 'edit-fab';
    fab.type = 'button';
    fab.textContent = 'Owner edit';
    fab.addEventListener('click', () => (unlocked ? doPublish() : askUnlock()));
    document.body.appendChild(fab);

    window.addEventListener('beforeunload', (e) => {
      if (dirty || pendingFiles.size) { e.preventDefault(); e.returnValue = ''; }
    });

    if (localStorage.getItem(LS_OWNER) === '1' && token()) askUnlock();
  }

  window.PortfolioEditor = { init };
})();
