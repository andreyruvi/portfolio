/* =============================================================================
   app.js — behaviour for the public site.
   The page arrives fully rendered from scripts/build.mjs, so everything here is
   enhancement: it re-renders only when the visitor changes the filter.
   ========================================================================== */
import * as R from './render.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export const DATA = (() => {
  const el = document.getElementById('site-data');
  try { return el ? JSON.parse(el.textContent) : null; } catch { return null; }
})();

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const state = { filter: 'All', editing: false };

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

const sections = ['about', 'services', 'work', 'contact'].map((id) => document.getElementById(id)).filter(Boolean);
if (sections.length && 'IntersectionObserver' in window) {
  const links = new Map($$('.nav a').map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver(
    (es) => es.forEach((e) => {
      const l = links.get(e.target.id);
      if (l) l.setAttribute('aria-current', e.isIntersecting ? 'true' : 'false');
    }),
    { rootMargin: '-45% 0px -50% 0px' }
  );
  sections.forEach((s) => spy.observe(s));
}

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

/* -------------------------------------------------------- cover slides */
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

/* ------------------------------------------------------------ gallery */
export function renderWork() {
  const gallery = $('#gallery');
  const filters = $('#filters');
  if (!gallery || !filters) return;
  filters.innerHTML = R.renderFilters(DATA, state.filter, state.editing);
  gallery.innerHTML = R.renderGallery(DATA, state.filter, state.editing);
  paintImages(gallery);
  observeReveal();
  $$('.rise', gallery).forEach((el) => el.classList.add('in'));
}

document.addEventListener('click', (e) => {
  const f = e.target.closest('#filters [data-f]');
  if (f) {
    state.filter = f.getAttribute('data-f');
    renderWork();
    return;
  }
  const card = e.target.closest('.card');
  if (card && !state.editing && !e.target.closest('.card-tools')) openLb(card.dataset.id);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest?.('.card');
  if (card && !state.editing) { e.preventDefault(); openLb(card.dataset.id); }
});

/* ----------------------------------------------------------- lightbox */
const lb       = $('#lightbox');
const lbStage  = $('#lbStage');
const lbStrip  = $('#lbStrip');
const lbBar    = $('#lbBar');
const lbCount  = $('#lbCount');
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

function updatePlayBtn() {
  if (lbPlayBtn) lbPlayBtn.textContent = playing ? '⏸' : '▶';
}

function scheduleAuto() {
  clearTimeout(autoTimer);
  if (!lbBar) return;
  lbBar.classList.remove('run');
  lbBar.style.animation = 'none';
  lbBar.style.width = '0';
  const cur = media[index];
  if (!(playing && cur && !R.isPdf(cur) && imageCount() > 1)) return;
  void lbBar.offsetWidth;                       // reflow so the bar restarts
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
  const openBox = $('#lbOpen');

  if (R.isPdf(m)) {
    lbStage.innerHTML = `<div class="lb-frame"><iframe class="lb-pdf" src="${R.attr(m.src)}" title="${R.attr($('#lbTitle').textContent)}"></iframe></div>`;
    openBox.innerHTML = `<a class="btn" href="${R.attr(m.src)}" target="_blank" rel="noopener">⤓ Open / download PDF</a>`;
  } else {
    lbStage.innerHTML = `<div class="lb-frame"><img src="${R.attr(m.src)}" alt="${R.attr($('#lbTitle').textContent)} — image ${index + 1} of ${media.length}"></div>`;
    openBox.innerHTML = `<a class="btn" href="${R.attr(m.src)}" target="_blank" rel="noopener">⤢ Open full image</a>`;
  }

  $$('.lb-thumb', lbStrip).forEach((t, n) => t.classList.toggle('active', n === index));
  const active = lbStrip.children[index];
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  if (lbCount) lbCount.textContent = `${index + 1} / ${media.length}`;

  // Warm the neighbours so paging feels instant.
  [index + 1, index - 1].forEach((n) => {
    const nb = media[(n + media.length) % media.length];
    if (nb && !R.isPdf(nb)) new Image().src = nb.src;
  });

  scheduleAuto();
}

export function openLb(id) {
  const pr = DATA?.projects.find((p) => p.id === id);
  if (!pr) return;
  media = (pr.media && pr.media.length ? pr.media : [{ type: 'image', src: pr.image }]).filter((m) => m && m.src);
  if (!media.length) return;

  $('#lbCat').textContent = pr.category || '';
  $('#lbTitle').textContent = pr.title;
  $('#lbDesc').textContent = R.cleanText(pr.desc);

  lbStrip.innerHTML = media
    .map((m, i) =>
      R.isPdf(m)
        ? `<div class="lb-thumb pdf" data-lbi="${i}" role="button" tabindex="0">PDF</div>`
        : `<img class="lb-thumb" src="${R.attr(R.thumbOf(m.src))}" data-lbi="${i}" alt="" loading="lazy">`
    )
    .join('');
  lbStrip.style.display = media.length > 1 ? 'flex' : 'none';
  lbControls.style.display = media.length > 1 ? 'flex' : 'none';

  playing = imageCount() > 1 && !reduceMotion;
  updatePlayBtn();

  lastFocus = document.activeElement;
  lb.hidden = false;
  requestAnimationFrame(() => { lb.dataset.open = 'true'; });
  document.body.style.overflow = 'hidden';
  show(0);
  $('#lbClose').focus();
}

function closeLb() {
  clearTimeout(autoTimer);
  playing = false;
  lb.dataset.open = 'false';
  document.body.style.overflow = '';
  setTimeout(() => { lb.hidden = true; lbStage.innerHTML = ''; }, 300);
  if (lastFocus) lastFocus.focus();
}

$('#lbClose')?.addEventListener('click', closeLb);
$('#lbPrev')?.addEventListener('click', () => show(index - 1));
$('#lbNext')?.addEventListener('click', () => show(index + 1));
lbPlayBtn?.addEventListener('click', () => { playing = !playing; updatePlayBtn(); scheduleAuto(); });
lbStrip?.addEventListener('click', (e) => {
  const t = e.target.closest('[data-lbi]');
  if (t) show(+t.dataset.lbi);
});
lb?.addEventListener('click', (e) => { if (e.target === lb || e.target === $('.lb-inner', lb)) closeLb(); });
lbStage?.addEventListener('mouseenter', () => { hoverPause = true; scheduleAuto(); });
lbStage?.addEventListener('mouseleave', () => { hoverPause = false; scheduleAuto(); });

document.addEventListener('keydown', (e) => {
  if (lb?.dataset.open !== 'true') return;
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

// The button is visible to everyone, exactly as it was before; the editor code
// itself is only fetched once someone actually clicks it.
$('#editFab')?.addEventListener('click', () => loadEditor().then((m) => m.requestUnlock()));

if (location.hash === '#edit' || localStorage.getItem('pf.owner') === '1') loadEditor();
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) { e.preventDefault(); loadEditor(); }
});

/* ------------------------------------------------------------- start */
observeReveal();
paintImages();
setupCoverFlow();
