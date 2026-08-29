#!/usr/bin/env node
/**
 * build.mjs — renders index.html from data/site.json.
 *
 * data/site.json is the single source of truth. The section markup comes from
 * assets/render.js, the very same module the browser uses in owner mode, so the
 * pre-rendered page and the live-edited page can never drift apart.
 *
 * Run:  node scripts/build.mjs
 * CI runs this on every push, so changing data/site.json is enough to publish.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from '../assets/render.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const { profile, copy, contact, seo } = site;

/* --------------------------------------------------- intrinsic image sizes */
/** Cheap WebP header read so images reserve their space and never shift text. */
function dims(src) {
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
  } catch { /* not on disk yet — skip the hint */ }
  return null;
}
const sizeAttrs = (src) => {
  const d = dims(src);
  return d ? ` width="${d.w}" height="${d.h}"` : '';
};

/* -------------------------------------------------------------------- seo */
const esc = R.esc;
const attr = R.attr;
const pageTitle = `${profile.name} — ${profile.title.split('—')[0].trim()}`;
const metaDesc =
  profile.bio.replace(/\s+/g, ' ').slice(0, 155).replace(/[,\s]+\S*$/, '') + '…';
const siteUrl = (seo?.siteUrl || '').replace(/\/?$/, '/');

function jsonLd() {
  return JSON.stringify({
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
    knowsAbout: seo?.keywords || site.tools,
    sameAs: [contact.x, contact.instagram].filter(Boolean),
    makesOffer: site.services.map((s) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: s.title },
    })),
  });
}

const favicon = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0a0c10"/><path d="M6 6h15M6 6v15" stroke="#d7a24a" stroke-width="3" fill="none"/><path d="M58 58h-15M58 58v-15" stroke="#d7a24a" stroke-width="3" fill="none"/><text x="32" y="41" font-family="monospace" font-size="22" fill="#d7a24a" text-anchor="middle" font-weight="700">DL</text></svg>`
)}`;

/* --------------------------------------------------------------- sections */
const avatarSrc = R.thumbOf(profile.avatar);

const hero = `
  <header class="hero">
    <div class="wrap">
      <div class="cover frame" id="coverFrame">
        <div class="cover-slides" id="coverSlides">${R.renderCoverSlides(site)}</div>
        <div class="cover-sheen"></div>
        <div class="sheettag label" data-field="copy.sheetTag">${esc(copy.sheetTag)}</div>
        <button class="photo-edit" type="button" id="coverEditBtn" hidden>⟲ Manage cover photos</button>
      </div>
      <div class="identity">
        <div class="avatar-wrap">
          <div class="avatar frame" id="avatarFrame">
            <img id="avatarImg" src="${attr(avatarSrc)}"${sizeAttrs(avatarSrc)} alt="${attr(profile.name)}">
            <button class="photo-edit" type="button" id="avatarEditBtn" hidden>⟲ Change photo</button>
          </div>
          <span class="avail-dot" id="availDot"${profile.available ? '' : ' hidden'}></span>
        </div>
        <div class="id-main">
          <div class="namerow">
            <h1 data-field="profile.name">${esc(profile.name)}</h1>
            <span class="verified" id="verifiedBadge" title="Verified"${profile.verified ? '' : ' hidden'}>✓</span>
            <span class="handle" data-field="profile.handle">${esc(profile.handle || '')}</span>
          </div>
          <div class="title-line" data-field="profile.title">${esc(profile.title)}</div>
        </div>
      </div>
      <div class="titleblock">${R.renderSpec(site)}
      </div>
    </div>
  </header>`;

const about = `
  <section id="about">
    <div class="wrap">
      <div class="sec-head rise"><span class="idx">01</span><h2 data-field="copy.aboutHeading">${esc(copy.aboutHeading)}</h2><span class="rule"></span></div>
      <div class="about-grid rise">
        <p class="bio" data-field="profile.bio">${esc(profile.bio)}</p>
      </div>
      <div class="sec-head rise sec-head-sub"><span class="idx">01.1</span><h2 data-field="copy.toolsHeading">${esc(copy.toolsHeading)}</h2><span class="rule"></span></div>
      <div class="tools rise" id="tools">${R.renderTools(site, false)}</div>
    </div>
  </section>`;

const services = `
  <section id="services">
    <div class="wrap">
      <div class="sec-head rise"><span class="idx">02</span><h2 data-field="copy.servicesHeading">${esc(copy.servicesHeading)}</h2><span class="rule"></span></div>
      <div class="svc-grid rise" id="svcGrid">${R.renderServices(site, false)}</div>
    </div>
  </section>`;

const work = `
  <section id="work">
    <div class="wrap">
      <div class="sec-head rise"><span class="idx">03</span><h2 data-field="copy.workHeading">${esc(copy.workHeading)}</h2><span class="rule"></span></div>
      <div class="filters rise" id="filters" role="group" aria-label="Filter projects by category">${R.renderFilters(site, 'All', false)}</div>
      <div class="gallery" id="gallery">${R.renderGallery(site, 'All', false, { dims: sizeAttrs })}</div>
    </div>
  </section>`;

const contactSection = `
  <section id="contact">
    <div class="wrap">
      <div class="contact-wrap frame rise">
        <div class="label ct-label" data-field="copy.contactLabel">${esc(copy.contactLabel)}</div>
        <h2 data-field="copy.contactHeading">${esc(copy.contactHeading)}</h2>
        <p data-field="copy.contactTagline">${esc(copy.contactTagline)}</p>
        <div class="cta-row" id="ctaRow">${R.renderCta(site)}</div>
        <div class="ci-cap label" data-field="copy.contactReach">${esc(copy.contactReach)}</div>
        <div class="contact-info" id="contactInfo">${R.renderContact(site, false)}</div>
      </div>
    </div>
  </section>`;

const lightbox = `
  <div class="lb" id="lightbox" data-open="false" role="dialog" aria-modal="true" aria-labelledby="lbTitle" hidden>
    <button class="lb-close" id="lbClose" type="button">CLOSE ✕</button>
    <div class="lb-inner">
      <div class="lb-strip" id="lbStrip"></div>
      <div class="lb-stage" id="lbStage"></div>
      <div class="lb-controls" id="lbControls">
        <button class="lb-nav" type="button" id="lbPrev" title="Previous" aria-label="Previous">‹</button>
        <button class="lb-play" type="button" id="lbPlayBtn" title="Play / pause" aria-label="Play or pause">⏸</button>
        <div class="lb-progress"><div class="lb-progress-bar" id="lbBar"></div></div>
        <span class="lb-count" id="lbCount"></span>
        <button class="lb-nav" type="button" id="lbNext" title="Next" aria-label="Next">›</button>
      </div>
      <div class="lb-body">
        <div class="cat" id="lbCat"></div>
        <h3 id="lbTitle"></h3>
        <p id="lbDesc"></p>
        <div id="lbOpen"></div>
      </div>
    </div>
  </div>`;

/* ------------------------------------------------------------------ shell */
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${attr(metaDesc)}">
<meta name="author" content="${attr(profile.name)}">
<meta name="keywords" content="${attr((seo?.keywords || []).join(', '))}">
<meta name="theme-color" content="#0a0c10">
<link rel="canonical" href="${attr(siteUrl)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${attr(siteUrl)}">
<meta property="og:title" content="${attr(pageTitle)}">
<meta property="og:description" content="${attr(metaDesc)}">
<meta property="og:image" content="${attr(siteUrl + profile.cover)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${attr(pageTitle)}">
<meta name="twitter:description" content="${attr(metaDesc)}">
<meta name="twitter:image" content="${attr(siteUrl + profile.cover)}">
<link rel="icon" href="${favicon}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="image" href="${attr(profile.cover)}" fetchpriority="high">
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
      <span class="name" id="brandName">${esc(profile.name)}</span>
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
${hero}
${about}
${services}
${work}
${contactSection}
</main>

<footer class="site-foot">
  <div class="wrap">
    <span>© ${new Date().getFullYear()} ${esc(profile.name)}</span>
    <span>${esc(site.tools.join(' · '))}</span>
  </div>
</footer>

${lightbox}

<button class="edit-fab" id="editFab" type="button" title="Owner login">🔒 Owner edit</button>

<script type="application/json" id="site-data">${JSON.stringify(site).replace(/</g, '\\u003c')}</script>
<script type="module" src="assets/app.js"></script>
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
    `${site.projects.length} projects, ${site.services.length} services, ${site.tools.length} tools`
);
