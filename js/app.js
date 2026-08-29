/* =============================================================================
   app.js — behaviour for the public site.

   Every page arrives fully rendered from scripts/build.mjs, so nothing here is
   required to read the site. It adds the mobile menu, scroll reveal, the
   portfolio filter and search, and the project lightbox.
   ========================================================================== */
import * as R from './render.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export const DATA = (() => {
  const el = document.getElementById('site-data');
  try { return el ? JSON.parse(el.textContent) : null; } catch { return null; }
})();

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const state = { filter: 'All', query: '', editing: false };

/* ------------------------------------------------------ scroll + chrome */
const progress = $('#progress');
const head = $('#siteHead');
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    if (head) head.dataset.stuck = window.scrollY > 8 ? 'true' : 'false';
    ticking = false;
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* --------------------------------------------------------- mobile menu */
const navToggle = $('#navToggle');
navToggle?.addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  navToggle.setAttribute('aria-expanded', String(open));
});
$$('#nav a').forEach((a) => a.addEventListener('click', () => {
  document.body.classList.remove('nav-open');
  navToggle?.setAttribute('aria-expanded', 'false');
}));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
    document.body.classList.remove('nav-open');
    navToggle?.setAttribute('aria-expanded', 'false');
    navToggle?.focus();
  }
});

/* -------------------------------------------------------------- reveal */
let revealObserver = null;
export function observeReveal() {
  const risers = $$('.rise:not(.in)');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    risers.forEach((el) => el.classList.add('in'));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (es, obs) => es.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        obs.unobserve(e.target);
      }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
  }
  risers.forEach((el) => revealObserver.observe(el));
}

/** Fade images in once decoded, so a slow photo never flashes half-drawn. */
export function paintImages(root = document) {
  $$('.thumb, .cover-slide', root).forEach((img) => {
    if (img.complete) img.classList.add('on');
    else img.addEventListener('load', () => img.classList.add('on'), { once: true });
  });
}

/* ------------------------------------------------------- cover slides */
let coverTimer = null;
export function setupCoverFlow() {
  const slides = $$('#coverSlides .cover-slide');
  clearInterval(coverTimer);
  if (slides.length < 2 || reduceMotion) return;
  let i = 0;
  coverTimer = setInterval(() => {
    slides[i].classList.remove('active');
    i = (i + 1) % slides.length;
    slides[i].classList.add('active');
  }, 6500);
}

/* ---------------------------------------------------- counters (stats) */
function animateCounters() {
  const tiles = $$('.stat-v');
  if (!tiles.length || reduceMotion || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((es, obs) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    obs.unobserve(e.target);
    const el = e.target;
    const text = el.textContent.trim();
    const m = /^(\d+)(\D*)$/.exec(text);          // only animate plain numbers
    if (!m) return;
    const target = +m[1], suffix = m[2];
    const started = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - started) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { threshold: 0.4 });
  tiles.forEach((t) => io.observe(t));
}

/* ------------------------------------------------- portfolio filtering */
const gallery = $('#gallery');
const searchBox = $('#projSearch');
const searchClear = $('#searchClear');
const resultCount = $('#resultCount');

function applyFilter() {
  if (!gallery) return;
  const q = state.query.trim().toLowerCase();
  let shown = 0;

  $$('.card', gallery).forEach((card) => {
    const okCat = state.filter === 'All' || card.dataset.cat === state.filter;
    const okText = !q || (card.dataset.search || '').includes(q);
    const visible = okCat && okText;
    card.hidden = !visible;
    if (visible) shown++;
  });

  $$('#filters .filter').forEach((b) => b.classList.toggle('active', b.dataset.f === state.filter));

  if (resultCount) {
    const total = $$('.card', gallery).length;
    resultCount.textContent = shown === total
      ? `${total} project${total === 1 ? '' : 's'}`
      : `${shown} of ${total} project${total === 1 ? '' : 's'}`;
  }

  let empty = $('.empty', gallery);
  if (!shown) {
    if (!empty) {
      empty = document.createElement('p');
      empty.className = 'empty';
      gallery.appendChild(empty);
    }
    empty.hidden = false;
    empty.textContent = q
      ? `Nothing matches “${state.query}”.`
      : `No projects in “${state.filter}” yet.`;
  } else if (empty) {
    empty.hidden = true;
  }
  if (searchClear) searchClear.hidden = !q;
}

/** Owner mode repaints the grid; re-run the filter over the fresh cards. */
export function renderWork() {
  if (!gallery) return;
  const filters = $('#filters');
  if (filters) filters.innerHTML = R.renderFilters(DATA, state.filter);
  gallery.innerHTML = R.renderGallery(DATA, 'All', state.editing);
  paintImages(gallery);
  $$('.rise', gallery).forEach((el) => el.classList.add('in'));
  applyFilter();
}

document.addEventListener('click', (e) => {
  const f = e.target.closest('#filters [data-f]');
  if (f) { state.filter = f.dataset.f; applyFilter(); return; }

  const card = e.target.closest('.card');
  if (card && !state.editing && !e.target.closest('.card-tools')) openLb(card.dataset.id);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest?.('.card');
  if (card && !state.editing) { e.preventDefault(); openLb(card.dataset.id); }
});

let searchTimer = null;
searchBox?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = searchBox.value; applyFilter(); }, 120);
});
searchBox?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { searchBox.value = ''; state.query = ''; applyFilter(); }
});
searchClear?.addEventListener('click', () => {
  searchBox.value = ''; state.query = ''; applyFilter(); searchBox.focus();
});

/* ----------------------------------------------------------- lightbox */
const lb        = $('#lightbox');
const lbStage   = $('#lbStage');
const lbStrip   = $('#lbStrip');
const lbBar     = $('#lbBar');
const lbCount   = $('#lbCount');
const lbPlayBtn = $('#lbPlayBtn');
const lbControls = $('#lbControls');

let media = [];
let index = 0;
let playing = false;
let hoverPause = false;
let autoTimer = null;
let lastFocus = null;
const INTERVAL = 4200;

const imageCount = () => media.filter((m) => !R.isPdf(m)).length;
const updatePlayBtn = () => { if (lbPlayBtn) lbPlayBtn.textContent = playing ? '⏸' : '▶'; };

function scheduleAuto() {
  clearTimeout(autoTimer);
  if (!lbBar) return;
  lbBar.classList.remove('run');
  lbBar.style.animation = 'none';
  lbBar.style.width = '0';
  const cur = media[index];
  if (!(playing && cur && !R.isPdf(cur) && imageCount() > 1)) return;
  void lbBar.offsetWidth;                        // reflow so the bar restarts
  lbBar.style.animation = '';
  lbBar.style.setProperty('--dur', INTERVAL + 'ms');
  lbBar.classList.add('run');
  lbBar.style.animationPlayState = hoverPause ? 'paused' : 'running';
  if (!hoverPause) autoTimer = setTimeout(() => show(index + 1), INTERVAL);
}

function show(i) {
  if (!media.length) return;
  index = (i + media.length) % media.length;
  const m = media[index];
  const title = $('#lbTitle').textContent;
  const openBox = $('#lbOpen');

  if (R.isPdf(m)) {
    lbStage.innerHTML = `<div class="lb-frame"><iframe class="lb-pdf" src="${R.attr(m.src)}" title="${R.attr(title)}"></iframe></div>`;
    openBox.innerHTML = `<a class="btn btn-sm" href="${R.attr(m.src)}" target="_blank" rel="noopener">⤓ Open PDF</a>`;
  } else {
    lbStage.innerHTML = `<div class="lb-frame"><img src="${R.attr(m.src)}" alt="${R.attr(title)} — sheet ${index + 1} of ${media.length}"></div>`;
    openBox.innerHTML = `<a class="btn btn-sm" href="${R.attr(m.src)}" target="_blank" rel="noopener">⤢ Full size</a>`;
  }

  $$('.lb-thumb', lbStrip).forEach((t, n) => t.classList.toggle('active', n === index));
  lbStrip.children[index]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  if (lbCount) lbCount.textContent = `${index + 1} / ${media.length}`;

  // Warm the neighbours so paging feels instant.
  [index + 1, index - 1].forEach((n) => {
    const nb = media[(n + media.length) % media.length];
    if (nb && !R.isPdf(nb)) new Image().src = nb.src;
  });

  scheduleAuto();
}

const chips = (arr) => (arr || []).map((v) => `<span>${R.esc(v)}</span>`).join('');

export function openLb(id) {
  const pr = DATA?.projects.find((p) => p.id === id);
  if (!pr || !lb) return;
  media = (pr.media && pr.media.length ? pr.media : [{ type: 'image', src: pr.image }]).filter((m) => m && m.src);
  if (!media.length) return;

  $('#lbCat').textContent = pr.category || '';
  $('#lbTitle').textContent = pr.title;
  $('#lbSub').textContent = [pr.buildingType, pr.location, pr.year].filter(Boolean).join(' · ');
  $('#lbDesc').textContent = R.cleanText(pr.description || pr.desc || '');

  const scope = $('#lbScope'), soft = $('#lbSoft'), tags = $('#lbTags');
  scope.innerHTML = (pr.scope || []).map((s) => `<li>${R.esc(s)}</li>`).join('');
  soft.innerHTML = chips(pr.software);
  tags.innerHTML = chips(pr.tags);
  $('#lbScopeBox').hidden = !(pr.scope || []).length;
  $('#lbSoftBox').hidden = !(pr.software || []).length;
  $('#lbTagBox').hidden = !(pr.tags || []).length;

  lbStrip.innerHTML = media
    .map((m, i) => R.isPdf(m)
      ? `<div class="lb-thumb pdf" data-lbi="${i}" role="button" tabindex="0">PDF</div>`
      : `<img class="lb-thumb" src="${R.attr(R.thumbOf(m.src))}" data-lbi="${i}" alt="" loading="lazy">`)
    .join('');
  lbStrip.style.display = media.length > 1 ? 'flex' : 'none';
  lbControls.style.display = media.length > 1 ? 'flex' : 'none';

  playing = imageCount() > 1 && !reduceMotion;
  updatePlayBtn();

  lastFocus = document.activeElement;
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
  show(0);
  // The dialog is visibility:hidden until data-open flips, and a hidden element
  // cannot take focus. Flip it on one frame, focus on the next, by which point
  // the computed visibility has actually changed.
  requestAnimationFrame(() => {
    lb.dataset.open = 'true';
    requestAnimationFrame(() => $('#lbClose').focus());
  });

  // Deep-linkable, and the back button closes the dialog.
  if (history.pushState) history.pushState({ lb: id }, '', '#project=' + encodeURIComponent(id));
}

function closeLb(fromPop) {
  if (!lb || lb.dataset.open !== 'true') return;
  clearTimeout(autoTimer);
  playing = false;
  lb.dataset.open = 'false';
  document.body.style.overflow = '';
  setTimeout(() => { lb.hidden = true; lbStage.innerHTML = ''; }, 300);
  lastFocus?.focus();
  if (!fromPop && location.hash.startsWith('#project=')) history.back();
}

$('#lbClose')?.addEventListener('click', () => closeLb());
$('#lbPrev')?.addEventListener('click', () => show(index - 1));
$('#lbNext')?.addEventListener('click', () => show(index + 1));
lbPlayBtn?.addEventListener('click', () => { playing = !playing; updatePlayBtn(); scheduleAuto(); });
lbStrip?.addEventListener('click', (e) => {
  const t = e.target.closest('[data-lbi]');
  if (t) show(+t.dataset.lbi);
});
lb?.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });
lbStage?.addEventListener('mouseenter', () => { hoverPause = true; scheduleAuto(); });
lbStage?.addEventListener('mouseleave', () => { hoverPause = false; scheduleAuto(); });
window.addEventListener('popstate', () => closeLb(true));

/** Keep Tab inside the dialog while it is open. */
function trapFocus(e) {
  const items = $$('button, a[href], [tabindex]:not([tabindex="-1"])', lb)
    .filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

document.addEventListener('keydown', (e) => {
  if (lb?.dataset.open !== 'true') return;
  if (e.key === 'Tab') { trapFocus(e); return; }
  if (e.key === 'Escape') closeLb();
  else if (e.key === 'ArrowRight') show(index + 1);
  else if (e.key === 'ArrowLeft') show(index - 1);
  else if (e.key === ' ') { e.preventDefault(); playing = !playing; updatePlayBtn(); scheduleAuto(); }
});

let touchX = null;
lbStage?.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
lbStage?.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 45) show(index + (dx < 0 ? 1 : -1));
  touchX = null;
}, { passive: true });

/* --------------------------------------------------------- owner mode */
let editorPromise = null;
export function loadEditor() {
  if (!editorPromise) {
    editorPromise = import('./editor.js')
      .then((m) => { m.init(); return m; })
      .catch((err) => { editorPromise = null; throw err; });
  }
  return editorPromise;
}

// The button is visible to everyone; the editor code is only fetched on click.
$('#editFab')?.addEventListener('click', () => loadEditor().then((m) => m.requestUnlock()));
if (location.hash === '#edit' || localStorage.getItem('pf.owner') === '1') loadEditor();
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) { e.preventDefault(); loadEditor(); }
});

/* ------------------------------------------------------------- start */
observeReveal();
paintImages();
setupCoverFlow();
animateCounters();
applyFilter();

// Opening a shared #project= link goes straight to that project.
const deep = /^#project=(.+)$/.exec(location.hash);
if (deep) setTimeout(() => openLb(decodeURIComponent(deep[1])), 200);
