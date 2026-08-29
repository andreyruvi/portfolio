/* =============================================================================
   app.js — interactivity for the public site.
   The page is already fully rendered by scripts/build.mjs; this file only adds
   behaviour, so the content is visible even if this script never loads.
   ========================================================================== */
(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const DATA = (() => {
    const el = document.getElementById('site-data');
    try { return el ? JSON.parse(el.textContent) : null; }
    catch { return null; }
  })();
  window.SITE = DATA;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------ scroll progress */
  const progress = $('#progress');
  const head = $('#siteHead');
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      if (progress) progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      if (head) head.dataset.stuck = y > 8 ? 'true' : 'false';
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* --------------------------------------------------------- nav highlight */
  const sections = ['about', 'services', 'work', 'contact']
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    const links = new Map($$('.nav a').map((a) => [a.getAttribute('href').slice(1), a]));
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const link = links.get(e.target.id);
          if (link) link.setAttribute('aria-current', e.isIntersecting ? 'true' : 'false');
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    sections.forEach((s) => spy.observe(s));
  }

  /* ---------------------------------------------------------- reveal on scroll */
  const risers = $$('.rise');
  if (!risers.length) { /* nothing to do */ }
  else if (reduceMotion || !('IntersectionObserver' in window)) {
    risers.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('in');
          obs.unobserve(e.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
    risers.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------ hero slides */
  const heroMedia = $('#heroMedia');
  if (heroMedia) {
    const slides = $$('img', heroMedia);
    slides.forEach((img) => {
      if (img.complete) img.classList.add('on-loaded');
      img.addEventListener('load', () => img.classList.add('on-loaded'), { once: true });
    });
    if (slides.length > 1 && !reduceMotion) {
      let i = 0;
      setInterval(() => {
        slides[i].classList.remove('on');
        i = (i + 1) % slides.length;
        slides[i].classList.add('on');
      }, 6500);
    }
  }

  /* ------------------------------------------------------- service expanders */
  $$('.svc-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.svc');
      const open = card.dataset.open === 'true';
      card.dataset.open = open ? 'false' : 'true';
      btn.setAttribute('aria-expanded', String(!open));
      btn.firstChild.nodeValue = open
        ? btn.dataset.labelClosed || btn.firstChild.nodeValue
        : 'Show less';
    });
    btn.dataset.labelClosed = btn.firstChild.nodeValue;
  });

  /* -------------------------------------------------------------- filters */
  const gallery = $('#gallery');
  const cards = $$('.card', gallery || document);

  $$('.filters button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      $$('.filters button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      let shown = 0;
      cards.forEach((card) => {
        const match = cat === 'All' || card.dataset.cat === cat;
        card.hidden = !match;
        if (match) shown++;
      });
      let empty = $('.empty', gallery);
      if (!shown) {
        if (!empty) {
          empty = document.createElement('p');
          empty.className = 'empty';
          gallery.appendChild(empty);
        }
        empty.textContent = `No projects in “${cat}” yet.`;
        empty.hidden = false;
      } else if (empty) {
        empty.hidden = true;
      }
    });
  });

  /* ------------------------------------------------------------- lightbox */
  const lb       = $('#lightbox');
  const lbImage  = $('#lbImage');
  const lbTitle  = $('#lbTitle');
  const lbCat    = $('#lbCat');
  const lbDesc   = $('#lbDesc');
  const lbStrip  = $('#lbStrip');
  const lbCount  = $('#lbCounter');

  let media = [];
  let index = 0;
  let lastFocus = null;

  const thumbOf = (src) =>
    src.startsWith('images/') ? `images/thumb/${src.slice(7)}` : src;

  function show(i) {
    if (!media.length) return;
    index = (i + media.length) % media.length;
    const src = media[index].src;
    lbImage.classList.remove('on');
    const pre = new Image();
    pre.onload = () => {
      lbImage.src = src;
      lbImage.alt = `${lbTitle.textContent} — image ${index + 1} of ${media.length}`;
      lbImage.classList.add('on');
    };
    pre.onerror = () => { lbImage.src = src; lbImage.classList.add('on'); };
    pre.src = src;

    lbCount.textContent = `${String(index + 1).padStart(2, '0')} / ${String(media.length).padStart(2, '0')}`;
    $$('button', lbStrip).forEach((b, n) => b.setAttribute('aria-current', String(n === index)));
    const active = lbStrip.children[index];
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });

    // Warm the neighbours so paging feels instant.
    [index + 1, index - 1].forEach((n) => {
      const m = media[(n + media.length) % media.length];
      if (m) new Image().src = m.src;
    });
  }

  function openProject(id) {
    if (!DATA) return;
    const project = DATA.projects.find((p) => p.id === id);
    if (!project) return;

    media = (project.media && project.media.length
      ? project.media
      : [{ src: project.image }]).filter((m) => m && m.src);
    if (!media.length) return;

    lbTitle.textContent = project.title;
    lbCat.textContent = project.category || '';
    lbDesc.textContent = (project.desc || '').trim();

    lbStrip.innerHTML = media
      .map(
        (m, i) =>
          `<button type="button" aria-label="Image ${i + 1}" aria-current="${i === 0}">` +
          `<img src="${thumbOf(m.src)}" alt="" loading="lazy"></button>`
      )
      .join('');
    $$('button', lbStrip).forEach((b, i) => b.addEventListener('click', () => show(i)));

    lastFocus = document.activeElement;
    lb.hidden = false;
    requestAnimationFrame(() => { lb.dataset.open = 'true'; });
    document.body.style.overflow = 'hidden';
    show(0);
    $('#lbClose').focus();
  }

  function closeLightbox() {
    lb.dataset.open = 'false';
    document.body.style.overflow = '';
    setTimeout(() => { lb.hidden = true; lbImage.removeAttribute('src'); }, 300);
    if (lastFocus) lastFocus.focus();
  }

  cards.forEach((card) => card.addEventListener('click', () => openProject(card.dataset.id)));
  $('#lbClose')?.addEventListener('click', closeLightbox);
  $('#lbPrev')?.addEventListener('click', () => show(index - 1));
  $('#lbNext')?.addEventListener('click', () => show(index + 1));
  lb?.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });

  document.addEventListener('keydown', (e) => {
    if (lb?.dataset.open !== 'true') return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowRight') show(index + 1);
    else if (e.key === 'ArrowLeft') show(index - 1);
  });

  // Swipe on touch devices.
  let touchX = null;
  $('#lbStage')?.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  $('#lbStage')?.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 45) show(index + (dx < 0 ? 1 : -1));
    touchX = null;
  }, { passive: true });

  /* ------------------------------------------- fade images in as they load */
  $$('img[loading="lazy"], .hero-media img, .card-media img').forEach((img) => {
    if (img.complete) img.classList.add('on');
    else img.addEventListener('load', () => img.classList.add('on'), { once: true });
  });

  /* ----------------------------------------------------------- owner mode */
  // The editor is a separate file and is only fetched when the owner asks for
  // it: visit the site with #edit, or press Ctrl+Shift+E.
  let editorLoading = false;
  function loadEditor() {
    if (editorLoading || window.PortfolioEditor) return;
    editorLoading = true;
    const s = document.createElement('script');
    s.src = 'assets/editor.js';
    s.onload = () => window.PortfolioEditor?.init(DATA);
    s.onerror = () => { editorLoading = false; };
    document.body.appendChild(s);
  }

  if (location.hash === '#edit' || localStorage.getItem('pf.owner') === '1') loadEditor();
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      e.preventDefault();
      loadEditor();
    }
  });
})();
