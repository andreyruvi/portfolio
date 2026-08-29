/* =============================================================================
   render.js — the markup, written once.
   Imported by scripts/build.mjs to pre-render index.html, and by the browser so
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

const pad2 = (n) => (n < 10 ? '0' : '') + n;

/**
 * Service and project text is stored with runs of blank lines between the
 * bullet points. Rendering it verbatim leaves big holes, so collapse the runs
 * to a single newline — same words, same order, nothing hidden.
 */
export const cleanText = (s = '') => String(s).replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim();

/** Build passes a real implementation so every <img> carries width/height. */
const noDims = () => '';

/* ------------------------------------------------------------------- hero */
export function renderCoverSlides(data) {
  const p = data.profile;
  const covers = (p.covers && p.covers.length) ? p.covers : (p.cover ? [p.cover] : []);
  return covers
    .map(
      (src, i) =>
        `<img class="cover-slide${i === 0 ? ' active' : ''}" src="${attr(src)}" alt="Cover"` +
        `${i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'}>`
    )
    .join('');
}

export function renderSpec(data) {
  const p = data.profile;
  return `
        <div class="cell"><div class="k">Rate</div><div class="v" data-field="profile.rate">${esc(p.rate)}</div></div>
        <div class="cell"><div class="k">Location</div><div class="v" data-field="profile.location">${esc(p.location)}</div></div>
        <div class="cell"><div class="k">Since</div><div class="v" data-field="profile.since">${esc(p.since)}</div></div>
        <div class="cell"><div class="k">Status</div><div class="v" id="statusCell">${
          p.available ? '<span class="mini-dot"></span>Available' : 'Busy'
        }</div></div>`;
}

/* ------------------------------------------------------------------ tools */
export function renderTools(data, editing) {
  if (!editing) {
    return data.tools.map((t) => `<span class="tool">${esc(t)}</span>`).join('');
  }
  return (
    data.tools
      .map(
        (t, i) =>
          `<span class="tool tool-edit"><span class="tname" contenteditable="true" data-ti="${i}">${esc(t)}</span>` +
          `<button class="tx" type="button" title="Remove" data-tool-remove="${i}">✕</button></span>`
      )
      .join('') + '<button class="tool-add" type="button" data-tool-add>＋ Add tool</button>'
  );
}

/* --------------------------------------------------------------- services */
export function renderServices(data, editing) {
  if (!editing) {
    return data.services
      .map(
        (s, i) =>
          `<article class="svc"><div class="n">${pad2(i + 1)}</div>` +
          `<h3>${esc(s.title)}</h3><p>${esc(cleanText(s.desc))}</p></article>`
      )
      .join('');
  }
  return (
    data.services
      .map(
        (s, i) =>
          `<article class="svc svc-editing">` +
          `<button class="svc-x" type="button" title="Remove" data-svc-remove="${i}">✕</button>` +
          `<div class="n">${pad2(i + 1)}</div>` +
          `<h3 contenteditable="true" data-si="${i}" data-sk="title">${esc(s.title)}</h3>` +
          `<p contenteditable="true" data-si="${i}" data-sk="desc">${esc(s.desc)}</p></article>`
      )
      .join('') +
    '<button class="svc svc-add" type="button" data-svc-add>＋ Add service</button>'
  );
}

/* ---------------------------------------------------------------- filters */
export function renderFilters(data, currentFilter = 'All', editing = false) {
  const btn = (c) =>
    `<button class="filter${c === currentFilter ? ' active' : ''}" type="button" data-f="${attr(c)}">${esc(c)}</button>`;
  if (!editing) return data.categories.map(btn).join('');
  return (
    data.categories
      .map((c) =>
        c === 'All'
          ? btn(c)
          : `<span class="filter-wrap">${btn(c)}<button class="filter-x" type="button" data-fx="${attr(c)}" title="Remove category">✕</button></span>`
      )
      .join('') + '<button class="filter-add" type="button" id="filterAdd">＋ Add category</button>'
  );
}

/* ---------------------------------------------------------------- gallery */
export function renderGallery(data, currentFilter = 'All', editing = false, opts = {}) {
  const dims = opts.dims || noDims;
  const items = data.projects.filter(
    (pr) => currentFilter === 'All' || pr.category === currentFilter
  );

  const cards = items
    .map((pr, i) => {
      const media = pr.media || [];
      const imgs = media.filter((m) => !isPdf(m)).length;
      const pdfs = media.filter((m) => isPdf(m)).length;
      const badge = media.length
        ? `<div class="mbadge">${imgs > 1 ? `<span>▦ ${imgs}</span>` : ''}${pdfs ? `<span>PDF ${pdfs}</span>` : ''}</div>`
        : '';
      const cover = thumbOf(projThumb(pr));
      return (
        `<article class="card rise" data-id="${attr(pr.id)}" data-cat="${attr(pr.category || '')}" ` +
        `style="transition-delay:${(i % 6) * 70}ms" tabindex="0" role="button" aria-label="${attr(pr.title)}">` +
        `<span class="corner">${pad2(i + 1)} / ${esc(pr.category || 'Project')}</span>${badge}` +
        `<div class="card-media"><img class="thumb" src="${attr(cover)}"${dims(cover)} alt="${attr(pr.title)}" loading="lazy" decoding="async"></div>` +
        `<div class="meta"><div class="cat">${esc(pr.category || 'Project')}</div><div class="t">${esc(pr.title)}</div></div>` +
        (editing
          ? `<div class="card-tools"><button type="button" data-proj-edit="${attr(pr.id)}">✎ Edit</button>` +
            `<button type="button" data-proj-del="${attr(pr.id)}">✕</button></div>`
          : '') +
        `</article>`
      );
    })
    .join('');

  const addTile = editing
    ? '<button class="add-card" type="button" data-proj-add>＋ Add project</button>'
    : '';
  const empty =
    !items.length && !editing
      ? `<p class="empty">No projects in “${esc(currentFilter)}” yet.</p>`
      : '';
  return cards + addTile + empty;
}

/* ---------------------------------------------------------------- contact */
export function renderCta(data) {
  const ct = data.contact;
  const out = [];
  if (ct.email) out.push(`<a class="btn primary" href="mailto:${attr(ct.email)}">✉ Email me</a>`);
  if (ct.whatsapp) out.push(`<a class="btn" href="${attr(waUrl(ct.whatsapp))}" target="_blank" rel="noopener">✆ WhatsApp</a>`);
  if (ct.telegram) out.push(`<a class="btn" href="${attr(socialUrl(ct.telegram, 'https://t.me/'))}" target="_blank" rel="noopener">✈ Telegram</a>`);
  if (ct.x) out.push(`<a class="btn" href="${attr(socialUrl(ct.x, 'https://x.com/'))}" target="_blank" rel="noopener">𝕏 X</a>`);
  if (ct.instagram) out.push(`<a class="btn" href="${attr(socialUrl(ct.instagram, 'https://instagram.com/'))}" target="_blank" rel="noopener">◎ Instagram</a>`);
  return out.join('');
}

export function contactRows(data) {
  const ct = data.contact;
  const p = data.profile;
  return [
    { k: 'Email',     path: 'contact.email',     val: ct.email,     ph: 'you@email.com',   link: (v) => 'mailto:' + v, self: true },
    { k: 'WhatsApp',  path: 'contact.whatsapp',  val: ct.whatsapp,  ph: '+84 90 123 4567', link: waUrl },
    { k: 'Telegram',  path: 'contact.telegram',  val: ct.telegram,  ph: '@yourhandle',     link: (v) => socialUrl(v, 'https://t.me/') },
    { k: 'X',         path: 'contact.x',         val: ct.x,         ph: '@yourhandle',     link: (v) => socialUrl(v, 'https://x.com/') },
    { k: 'Instagram', path: 'contact.instagram', val: ct.instagram, ph: '@yourhandle',     link: (v) => socialUrl(v, 'https://instagram.com/') },
    { k: 'Location',  path: 'profile.location',  val: p.location,   ph: 'City, Country',   link: null },
  ];
}

export function renderContact(data, editing) {
  const rows = contactRows(data);
  if (!editing) {
    return rows
      .filter((r) => r.val)
      .map((r) => {
        const v = r.link
          ? `<a href="${attr(r.link(r.val))}"${r.self ? '' : ' target="_blank" rel="noopener"'}>${esc(r.val)}</a>`
          : esc(r.val);
        return `<div class="ci-row"><span class="ci-k">${r.k}</span><span class="ci-v">${v}</span></div>`;
      })
      .join('');
  }
  return rows
    .map(
      (r) =>
        `<div class="ci-row"><span class="ci-k">${r.k}</span>` +
        `<span class="ci-v ci-edit" contenteditable="true" data-cpath="${r.path}" data-ph="${attr(r.ph)}">${r.val ? esc(r.val) : ''}</span></div>`
    )
    .join('');
}

/* ------------------------------------------------- media list (owner mode) */
export function renderMediaList(list, kind) {
  // kind: 'pm' for project media, 'cover' for cover photos
  const rmAttr = kind === 'cover' ? 'data-crm' : 'data-rm';
  const mvAttr = kind === 'cover' ? 'data-cmv' : 'data-mv';
  const firstLabel = kind === 'cover' ? 'first' : 'cover';
  if (!list.length) return '<p class="media-empty">Nothing added yet.</p>';
  return list
    .map((m, i) => {
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
    })
    .join('');
}
