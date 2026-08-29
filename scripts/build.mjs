#!/usr/bin/env node
/**
 * build.mjs — renders index.html from data/site.json.
 *
 * data/site.json is the single source of truth. This script produces a fully
 * pre-rendered index.html (good for search engines and for anyone with JS off)
 * and inlines the same JSON so the client needs no extra request.
 *
 * Run:  node scripts/build.mjs
 * CI runs this on every push, so editing data/site.json is enough to publish.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));

/* ------------------------------------------------------------------ utils */
const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
           .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** images/foo.webp -> images/thumb/foo.webp (falls back to the original). */
const thumb = (src = '') => {
  if (!src.startsWith('images/')) return src;
  const rel = src.slice('images/'.length);
  const candidate = `images/thumb/${rel}`;
  return fs.existsSync(path.join(ROOT, candidate)) ? candidate : src;
};

const dims = (src) => {
  // Cheap WebP header read so every <img> can carry width/height and never
  // shift the layout while loading.
  try {
    const buf = fs.readFileSync(path.join(ROOT, src));
    if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (fmt === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
    if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  } catch { /* missing file — skip the hint */ }
  return null;
};

const sizeAttrs = (src) => {
  const d = dims(src);
  return d ? ` width="${d.w}" height="${d.h}"` : '';
};

/**
 * Service descriptions are one free-text blob. Split them into readable
 * paragraphs plus a bullet list so a wall of text becomes a scannable card.
 */
function parseService(desc = '') {
  const lines = desc.split('\n').map((l) => l.trim()).filter(Boolean);
  const intro = [];
  const bullets = [];
  const outro = [];
  let mode = 'intro';
  for (const line of lines) {
    if (/^services?\s+include:?$/i.test(line)) { mode = 'bullets'; continue; }
    if (mode === 'intro') { intro.push(line); continue; }
    // A long sentence after the list is a closing paragraph, not a bullet.
    if (line.length > 110) outro.push(line);
    else bullets.push(line.replace(/^[-•*]\s*/, ''));
  }
  return { intro, bullets, outro };
}

/* ------------------------------------------------------------------ icons */
const ICONS = {
  email: '<path d="M3 5h18v14H3z"/><path d="m3 6 9 7 9-7"/>',
  whatsapp: '<path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.2-5.2A8.5 8.5 0 1 1 21 11.5Z"/>',
  telegram: '<path d="m21 4-3 16-6-5-3 4-1-6L3 10l18-6Z"/>',
  x: '<path d="m4 4 16 16M20 4 4 20"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.email}</svg>`;

const CONTACT_META = {
  email:     { label: 'Email',     href: (v) => `mailto:${v}` },
  whatsapp:  { label: 'WhatsApp',  href: (v) => `https://wa.me/${String(v).replace(/[^\d]/g, '')}` },
  telegram:  { label: 'Telegram',  href: (v) => `https://t.me/${String(v).replace(/^@/, '')}` },
  x:         { label: 'X',         href: (v) => v },
  instagram: { label: 'Instagram', href: (v) => v },
};

/* --------------------------------------------------------------- sections */
const { profile, tools, services, categories, projects, contact, seo } = site;

const pageTitle = `${profile.name} — ${profile.title.split('—')[0].trim()}`;
const metaDesc =
  profile.bio.replace(/\s+/g, ' ').slice(0, 155).replace(/[,\s]+\S*$/, '') + '…';
const siteUrl = (seo?.siteUrl || '').replace(/\/?$/, '/');

function heroSection() {
  const covers = [profile.cover, ...(profile.covers || [])].filter(Boolean);
  const slides = covers
    .map(
      (src, i) =>
        `<img src="${esc(src)}"${sizeAttrs(src)} alt="${esc(profile.name)} — project cover ${i + 1}" ` +
        `${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} class="${i === 0 ? 'on' : ''}" data-slide="${i}">`
    )
    .join('\n        ');

  return `
  <header class="hero">
    <div class="hero-media" id="heroMedia">
        ${slides}
    </div>
    <div class="hero-body">
      <div class="wrap">
        <div class="hero-inner">
          <div class="avatar">
            <img src="${esc(thumb(profile.avatar))}"${sizeAttrs(thumb(profile.avatar))} alt="${esc(profile.name)} logo" width="264" height="264">
          </div>
          <div class="hero-text">
            <h1><span data-field="profile.name">${esc(profile.name)}</span>${
              profile.verified
                ? `<svg class="verified" viewBox="0 0 24 24" fill="currentColor" aria-label="Verified"><path d="m12 1.5 2.6 2.1 3.3-.3.9 3.2 2.7 2-1.6 2.9 1.6 2.9-2.7 2-.9 3.2-3.3-.3L12 22.5l-2.6-2.1-3.3.3-.9-3.2-2.7-2L4.1 12.5 2.5 9.6l2.7-2 .9-3.2 3.3.3L12 1.5Z" opacity=".9"/><path d="m8.5 12.2 2.3 2.3 4.7-4.7" stroke="#0a0c10" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
                : ''
            }</h1>
            <p class="role" data-field="profile.title">${esc(profile.title)}</p>
          </div>
        </div>
        <div class="spec">
          <div><div class="k">Rate</div><div class="v" data-field="profile.rate">${esc(profile.rate)}</div></div>
          <div><div class="k">Location</div><div class="v" data-field="profile.location">${esc(profile.location)}</div></div>
          <div><div class="k">Working since</div><div class="v" data-field="profile.since">${esc(profile.since)}</div></div>
          <div><div class="k">Status</div><div class="v">${
            profile.available
              ? '<span class="dot"></span>Available for work'
              : 'Fully booked'
          }</div></div>
        </div>
      </div>
    </div>
  </header>`;
}

function aboutSection() {
  return `
  <section class="section" id="about">
    <div class="wrap">
      <div class="section-head"><span class="num">01</span><h2>About</h2><span class="rule"></span></div>
      <div class="about-grid">
        <p class="bio" data-field="profile.bio">${esc(profile.bio)}</p>
        <div>
          <div class="tools-label">Software</div>
          <div class="tools">${tools.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function servicesSection() {
  const cards = services
    .map((s, i) => {
      const { intro, bullets, outro } = parseService(s.desc);
      const n = String(i + 1).padStart(2, '0');

      // Collapsed view stays short and even across the grid: one paragraph and
      // four bullets. Everything else sits behind the toggle.
      const leadPara = intro.slice(0, 1);
      const restParas = intro.slice(1);
      const leadBullets = bullets.slice(0, 4);
      const restBullets = bullets.slice(4);
      const hasMore = restParas.length || restBullets.length || outro.length;

      const more =
        (restBullets.length ? `<ul>${restBullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '') +
        restParas.map((p) => `<p>${esc(p)}</p>`).join('') +
        outro.map((p) => `<p>${esc(p)}</p>`).join('');

      return `
        <article class="svc" data-open="false" data-index="${i}">
          <h3><span class="idx">${n}</span>${esc(s.title)}</h3>
          ${leadPara.map((p) => `<p>${esc(p)}</p>`).join('')}
          ${leadBullets.length ? `<ul>${leadBullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
          ${hasMore ? `<div class="svc-more">${more}</div>` : ''}
          ${hasMore ? `<button class="svc-toggle" type="button" aria-expanded="false">Show full details</button>` : ''}
        </article>`;
    })
    .join('');

  return `
  <section class="section" id="services">
    <div class="wrap">
      <div class="section-head"><span class="num">02</span><h2>Services</h2><span class="rule"></span></div>
      <div class="svc-grid">${cards}
      </div>
    </div>
  </section>`;
}

function workSection() {
  const cats = categories && categories.length ? categories : ['All'];
  const filters = cats
    .map(
      (c, i) =>
        `<button type="button" data-cat="${esc(c)}" aria-pressed="${i === 0}">${esc(c)}</button>`
    )
    .join('');

  const cards = projects
    .map((p, i) => {
      const cover = thumb(p.image || (p.media && p.media[0] && p.media[0].src) || '');
      const count = (p.media || []).length;
      return `
        <button class="card rise" type="button" data-id="${esc(p.id)}" data-cat="${esc(p.category || '')}" style="transition-delay:${(i % 6) * 60}ms">
          <div class="card-media">
            <img src="${esc(cover)}"${sizeAttrs(cover)} alt="${esc(p.title)}" loading="lazy" decoding="async">
            ${count ? `<span class="card-count">${count} image${count > 1 ? 's' : ''}</span>` : ''}
          </div>
          <div class="card-body">
            <div class="card-cat">${esc(p.category || 'Project')}</div>
            <h3 class="card-title">${esc(p.title)}</h3>
          </div>
        </button>`;
    })
    .join('');

  return `
  <section class="section" id="work">
    <div class="wrap">
      <div class="section-head"><span class="num">03</span><h2>Selected work</h2><span class="rule"></span></div>
      <div class="filters" role="group" aria-label="Filter projects by category">${filters}</div>
      <div class="gallery" id="gallery">${cards}
      </div>
    </div>
  </section>`;
}

function contactSection() {
  const cards = Object.entries(contact)
    .filter(([, v]) => v)
    .map(([k, v]) => {
      const meta = CONTACT_META[k] || { label: k, href: (x) => x };
      const label = k === 'x' || k === 'instagram' ? String(v).replace(/^https?:\/\/(www\.)?/, '') : v;
      return `
        <a class="contact-card" href="${esc(meta.href(v))}"${
        k === 'email' ? '' : ' target="_blank" rel="noopener noreferrer"'
      }>
          ${icon(k)}
          <span><span class="k">${esc(meta.label)}</span><br><span class="v">${esc(label)}</span></span>
        </a>`;
    })
    .join('');

  return `
  <section class="section" id="contact">
    <div class="wrap">
      <div class="section-head"><span class="num">04</span><h2>Get in touch</h2><span class="rule"></span></div>
      <div class="contact-grid">${cards}
      </div>
      <div class="cta">
        <a class="btn" href="mailto:${esc(contact.email)}?subject=${encodeURIComponent('Project enquiry — ' + profile.name)}">Start a project</a>
        <a class="btn ghost" href="${esc(CONTACT_META.whatsapp.href(contact.whatsapp))}" target="_blank" rel="noopener noreferrer">Message on WhatsApp</a>
      </div>
    </div>
  </section>`;
}

function lightbox() {
  return `
  <div class="lb" id="lightbox" data-open="false" role="dialog" aria-modal="true" aria-labelledby="lbTitle" hidden>
    <div class="lb-head">
      <div class="meta">
        <div class="cat" id="lbCat"></div>
        <h3 id="lbTitle"></h3>
      </div>
      <button class="lb-close" id="lbClose" type="button" aria-label="Close (Esc)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>
    <div class="lb-stage" id="lbStage">
      <div class="lb-frame"><img id="lbImage" alt=""></div>
      <button class="lb-nav prev" id="lbPrev" type="button" aria-label="Previous image">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>
      </button>
      <button class="lb-nav next" id="lbNext" type="button" aria-label="Next image">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>
      </button>
    </div>
    <div class="lb-foot">
      <div class="lb-counter" id="lbCounter"></div>
      <div class="lb-strip" id="lbStrip"></div>
      <p class="lb-desc" id="lbDesc"></p>
    </div>
  </div>`;
}

function jsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: profile.name,
    description: profile.bio,
    url: siteUrl,
    image: siteUrl + profile.cover,
    email: contact.email,
    telephone: contact.whatsapp,
    areaServed: 'Worldwide',
    address: { '@type': 'PostalAddress', addressCountry: profile.location },
    foundingDate: profile.since,
    knowsAbout: seo?.keywords || tools,
    sameAs: [contact.x, contact.instagram].filter(Boolean),
    makesOffer: services.map((s) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: s.title },
    })),
  };
  return JSON.stringify(data);
}

/* ------------------------------------------------------------------ shell */
const favicon =
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0a0c10"/><path d="M6 6h15M6 6v15" stroke="#d7a24a" stroke-width="3" fill="none"/><path d="M58 58h-15M58 58v-15" stroke="#d7a24a" stroke-width="3" fill="none"/><text x="32" y="41" font-family="monospace" font-size="22" fill="#d7a24a" text-anchor="middle" font-weight="700">DL</text></svg>`
  )}`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(metaDesc)}">
<meta name="author" content="${esc(profile.name)}">
<meta name="keywords" content="${esc((seo?.keywords || []).join(', '))}">
<meta name="theme-color" content="#0a0c10">
<link rel="canonical" href="${esc(siteUrl)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(siteUrl)}">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:image" content="${esc(siteUrl + profile.cover)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(pageTitle)}">
<meta name="twitter:description" content="${esc(metaDesc)}">
<meta name="twitter:image" content="${esc(siteUrl + profile.cover)}">
<link rel="icon" href="${favicon}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="image" href="${esc(profile.cover)}" fetchpriority="high">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/styles.css">
<script type="application/ld+json">${jsonLd()}</script>
</head>
<body>
<div id="progress"></div>

<div class="site-head" id="siteHead" data-stuck="false">
  <div class="wrap">
    <a class="brand" href="#top">
      <span class="sheet">A-101</span>
      <span class="name">${esc(profile.name)}</span>
    </a>
    <nav class="nav" aria-label="Sections">
      <a href="#about">About</a>
      <a href="#services">Services</a>
      <a href="#work">Work</a>
      <a href="#contact">Contact</a>
    </nav>
  </div>
</div>

<main id="top">
${heroSection()}
${aboutSection()}
${servicesSection()}
${workSection()}
${contactSection()}
</main>

<footer class="site-foot">
  <div class="wrap" style="display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;justify-content:space-between;width:100%">
    <span>© ${new Date().getFullYear()} ${esc(profile.name)}</span>
    <span>Revit · Chief Architect · ArchiCAD · AutoCAD · SketchUp</span>
  </div>
</footer>

${lightbox()}

<script type="application/json" id="site-data">${JSON.stringify(site).replace(/</g, '\\u003c')}</script>
<script src="assets/app.js" defer></script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'index.html'), html);

/* ------------------------------------------------------ robots + sitemap */
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(
  path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteUrl}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>
</urlset>
`
);
fs.writeFileSync(
  path.join(ROOT, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`
);

console.log(
  `built index.html · ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB · ` +
    `${projects.length} projects, ${services.length} services`
);
