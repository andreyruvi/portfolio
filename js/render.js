/* =============================================================================
   render.js — the markup, written once.

   Imported by scripts/build.mjs to generate the pages, and by the browser so
   owner mode can repaint a section after an edit. Both sides therefore produce
   identical HTML; there is no second copy of the markup to drift out of sync.

   Every function here is pure: data in, HTML string out.
   ========================================================================== */

/* ------------------------------------------------------------------ utils */
export const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const attr = (s = '') => esc(s).replace(/"/g, '&quot;');

export const socialUrl = (v, base) => {
  v = (v || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return base + v.replace(/^@/, '');
};

export const waUrl = (v) => 'https://wa.me/' + String(v || '').replace(/[^0-9]/g, '');

/** images/foo.webp -> images/thumb/foo.webp */
export const thumbOf = (src = '') =>
  src.startsWith('images/') && !src.startsWith('images/thumb/')
    ? 'images/thumb/' + src.slice('images/'.length)
    : src;

export const isPdf = (m) => m && (m.type === 'pdf' || /\.pdf($|\?)/i.test(m.src || ''));

export function projThumb(pr) {
  const media = pr.media || [];
  const first = media.find((m) => !isPdf(m));
  return (first && first.src) || pr.image || '';
}

/** Collapse the runs of blank lines the source text carries. */
export const cleanText = (s = '') =>
  String(s).replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim();

/** Split a multi-paragraph string into <p> elements. */
export const paras = (s = '') =>
  cleanText(s).split('\n').filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');

const pad2 = (n) => (n < 10 ? '0' : '') + n;
const noDims = () => '';

/** Everything a project can be searched on, lower-cased. */
export const searchIndex = (pr) =>
  [pr.title, pr.category, pr.buildingType, pr.location, pr.year, pr.description,
   ...(pr.software || []), ...(pr.tags || []), ...(pr.scope || [])]
    .filter(Boolean).join(' ').toLowerCase();

/** Category chips are derived from the projects, so they can never disagree. */
export function categoriesOf(projects) {
  const seen = [];
  projects.forEach((p) => { if (p.category && !seen.includes(p.category)) seen.push(p.category); });
  return ['All', ...seen];
}

/* ------------------------------------------------------------------- hero */
export function renderCoverSlides(site) {
  const p = site.profile;
  const covers = (p.covers && p.covers.length) ? p.covers : (p.cover ? [p.cover] : []);
  return covers
    .map((src, i) =>
      `<img class="cover-slide${i === 0 ? ' active' : ''}" src="${attr(src)}" alt=""` +
      `${i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'}>`)
    .join('');
}

export function renderSpec(site) {
  const p = site.profile;
  const cells = [
    ['Engagement', esc(p.engagement)],
    ['Location', esc(p.location)],
    ['Working since', esc(p.since)],
    ['Status', `<span class="mini-dot"></span>${esc(p.availability)}`],
  ];
  return cells
    .map(([k, v]) => `<div class="cell"><div class="k">${k}</div><div class="v">${v}</div></div>`)
    .join('');
}

export function renderStats(site) {
  return (site.stats || [])
    .map((s) => `<div class="stat"><div class="stat-v">${esc(s.value)}</div><div class="stat-k">${esc(s.label)}</div></div>`)
    .join('');
}

/* ------------------------------------------------------------------ tools */
export function renderTools(site, editing) {
  if (!editing) {
    return site.tools.map((t) => `<span class="tool">${esc(t)}</span>`).join('');
  }
  return (
    site.tools
      .map((t, i) =>
        `<span class="tool tool-edit"><span class="tname" contenteditable="true" data-ti="${i}">${esc(t)}</span>` +
        `<button class="tx" type="button" title="Remove" data-tool-remove="${i}">✕</button></span>`)
      .join('') + '<button class="tool-add" type="button" data-tool-add>＋ Add tool</button>'
  );
}

/** Software with a line on what it is used for — the credibility section. */
export function renderToolTable(site) {
  const notes = site.toolNotes || {};
  return site.tools
    .map((t) =>
      `<div class="tool-row"><div class="tool-name">${esc(t)}</div>` +
      `<div class="tool-note">${esc(notes[t] || '')}</div></div>`)
    .join('');
}

/* --------------------------------------------------------------- services */
export function renderServices(site, editing, opts = {}) {
  const detailed = !!opts.detailed;
  const list = opts.limit ? site.services.slice(0, opts.limit) : site.services;

  if (!editing) {
    return list
      .map((s, i) =>
        `<article class="svc">` +
        `<div class="n">${pad2(i + 1)}</div>` +
        `<h3>${esc(s.title)}</h3>` +
        `<p>${esc(s.summary || s.desc || '')}</p>` +
        (detailed && s.bullets && s.bullets.length
          ? `<ul class="svc-list">${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
          : '') +
        `</article>`)
      .join('');
  }

  return (
    site.services
      .map((s, i) =>
        `<article class="svc svc-editing">` +
        `<button class="svc-x" type="button" title="Remove" data-svc-remove="${i}">✕</button>` +
        `<div class="n">${pad2(i + 1)}</div>` +
        `<h3 contenteditable="true" data-si="${i}" data-sk="title">${esc(s.title)}</h3>` +
        `<p contenteditable="true" data-si="${i}" data-sk="summary">${esc(s.summary || '')}</p>` +
        `</article>`)
      .join('') +
    '<button class="svc svc-add" type="button" data-svc-add>＋ Add service</button>'
  );
}

/* ---------------------------------------------------------------- filters */
export function renderFilters(site, currentFilter = 'All') {
  const cats = categoriesOf(site.projects);
  return cats
    .map((c) => {
      const n = c === 'All' ? site.projects.length : site.projects.filter((p) => p.category === c).length;
      return `<button class="filter${c === currentFilter ? ' active' : ''}" type="button" data-f="${attr(c)}">` +
             `${esc(c)}<span class="filter-n">${n}</span></button>`;
    })
    .join('');
}

/* ---------------------------------------------------------------- gallery */
export function projectCard(pr, i, editing, dims = noDims) {
  const media = pr.media || [];
  const imgs = media.filter((m) => !isPdf(m)).length;
  const pdfs = media.filter((m) => isPdf(m)).length;
  const badge = media.length
    ? `<div class="mbadge">${imgs > 1 ? `<span>▦ ${imgs}</span>` : ''}${pdfs ? `<span>PDF ${pdfs}</span>` : ''}</div>`
    : '';
  const cover = thumbOf(projThumb(pr));
  const sub = [pr.buildingType, pr.location, pr.year].filter(Boolean).join(' · ');

  return (
    `<article class="card rise" data-id="${attr(pr.id)}" data-cat="${attr(pr.category || '')}" ` +
    `data-search="${attr(searchIndex(pr))}" style="transition-delay:${(i % 6) * 70}ms" ` +
    `tabindex="0" role="button" aria-label="${attr(pr.title)}">` +
    `<span class="corner">${pad2(i + 1)} / ${esc(pr.category || 'Project')}</span>${badge}` +
    `<div class="card-media"><img class="thumb" src="${attr(cover)}"${dims(cover)} alt="${attr(pr.title)}" loading="lazy" decoding="async"></div>` +
    `<div class="meta">` +
      `<div class="cat">${esc(pr.category || 'Project')}</div>` +
      `<h3 class="t">${esc(pr.title)}</h3>` +
      (sub ? `<div class="card-sub">${esc(sub)}</div>` : '') +
      `<div class="card-soft">${(pr.software || []).map((s) => `<span>${esc(s)}</span>`).join('')}</div>` +
    `</div>` +
    (editing
      ? `<div class="card-tools"><button type="button" data-proj-edit="${attr(pr.id)}">✎ Edit</button>` +
        `<button type="button" data-proj-del="${attr(pr.id)}">✕</button></div>`
      : '') +
    `</article>`
  );
}

export function renderGallery(site, currentFilter = 'All', editing = false, opts = {}) {
  const dims = opts.dims || noDims;
  let items = site.projects.filter((pr) => currentFilter === 'All' || pr.category === currentFilter);
  if (opts.limit) items = items.slice(0, opts.limit);

  const cards = items.map((pr, i) => projectCard(pr, i, editing, dims)).join('');
  const addTile = editing ? '<button class="add-card" type="button" data-proj-add>＋ Add project</button>' : '';
  const empty = !items.length && !editing
    ? `<p class="empty">No projects in “${esc(currentFilter)}” yet.</p>` : '';
  return cards + addTile + empty;
}

/* ---------------------------------------------------------------- contact */
export function renderCta(site, opts = {}) {
  const ct = site.contact;
  const out = [];
  if (ct.email) out.push(`<a class="btn primary" href="mailto:${attr(ct.email)}?subject=${encodeURIComponent('Project enquiry')}">✉ Email me</a>`);
  if (ct.whatsapp) out.push(`<a class="btn" href="${attr(waUrl(ct.whatsapp))}" target="_blank" rel="noopener">✆ WhatsApp</a>`);
  if (ct.telegram) out.push(`<a class="btn" href="${attr(socialUrl(ct.telegram, 'https://t.me/'))}" target="_blank" rel="noopener">✈ Telegram</a>`);
  if (!opts.short) {
    if (ct.x) out.push(`<a class="btn" href="${attr(socialUrl(ct.x, 'https://x.com/'))}" target="_blank" rel="noopener">𝕏 X</a>`);
    if (ct.instagram) out.push(`<a class="btn" href="${attr(socialUrl(ct.instagram, 'https://instagram.com/'))}" target="_blank" rel="noopener">◎ Instagram</a>`);
  }
  return out.join('');
}

export function contactRows(site) {
  const ct = site.contact;
  const p = site.profile;
  return [
    { k: 'Email',     path: 'contact.email',     val: ct.email,     ph: 'you@email.com',   link: (v) => 'mailto:' + v, self: true },
    { k: 'WhatsApp',  path: 'contact.whatsapp',  val: ct.whatsapp,  ph: '+84 90 123 4567', link: waUrl },
    { k: 'Telegram',  path: 'contact.telegram',  val: ct.telegram,  ph: '@yourhandle',     link: (v) => socialUrl(v, 'https://t.me/') },
    { k: 'X',         path: 'contact.x',         val: ct.x,         ph: '@yourhandle',     link: (v) => socialUrl(v, 'https://x.com/') },
    { k: 'Instagram', path: 'contact.instagram', val: ct.instagram, ph: '@yourhandle',     link: (v) => socialUrl(v, 'https://instagram.com/') },
    { k: 'Working hours', path: 'profile.hours', val: p.hours,      ph: 'US business hours', link: null },
  ];
}

export function renderContact(site, editing) {
  const rows = contactRows(site);
  if (!editing) {
    return rows.filter((r) => r.val).map((r) => {
      const v = r.link
        ? `<a href="${attr(r.link(r.val))}"${r.self ? '' : ' target="_blank" rel="noopener"'}>${esc(r.val)}</a>`
        : esc(r.val);
      return `<div class="ci-row"><span class="ci-k">${r.k}</span><span class="ci-v">${v}</span></div>`;
    }).join('');
  }
  return rows.map((r) =>
    `<div class="ci-row"><span class="ci-k">${r.k}</span>` +
    `<span class="ci-v ci-edit" contenteditable="true" data-cpath="${r.path}" data-ph="${attr(r.ph)}">${r.val ? esc(r.val) : ''}</span></div>`
  ).join('');
}

/* ---------------------------------------------------------------- process */
export function renderProcess(site) {
  return (site.process || [])
    .map((s) =>
      `<li class="step"><div class="step-n">${esc(s.step)}</div>` +
      `<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`)
    .join('');
}

/* ------------------------------------------------- media list (owner mode) */
export function renderMediaList(list, kind) {
  const rmAttr = kind === 'cover' ? 'data-crm' : 'data-rm';
  const mvAttr = kind === 'cover' ? 'data-cmv' : 'data-mv';
  const firstLabel = kind === 'cover' ? 'first' : 'cover';
  if (!list.length) return '<p class="media-empty">Nothing added yet.</p>';
  return list.map((m, i) => {
    const src = typeof m === 'string' ? m : m.src;
    const pdf = typeof m !== 'string' && isPdf(m);
    const body = pdf
      ? '<div class="mi-body pdf">PDF</div>'
      : `<div class="mi-body"><img src="${attr(thumbOf(src))}" alt=""></div>`;
    return (
      `<div class="media-item">${body}` +
      `<button class="mx" type="button" ${rmAttr}="${i}" title="Remove">✕</button>` +
      `<span class="mi-pos">${i + 1}${i === 0 ? ' · ' + firstLabel : ''}</span>` +
      `<div class="mi-nav">` +
      `<button class="mi-move" type="button" ${mvAttr}="up" data-i="${i}" title="Move earlier"${i === 0 ? ' disabled' : ''}>◄</button>` +
      `<button class="mi-move" type="button" ${mvAttr}="down" data-i="${i}" title="Move later"${i === list.length - 1 ? ' disabled' : ''}>►</button>` +
      `</div></div>`
    );
  }).join('');
}
