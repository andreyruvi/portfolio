/* =============================================================================
   page.js — builds the whole index.html document from data/site.json.

   Shared, exactly like render.js: scripts/build.mjs calls it from Node, and the
   browser calls it in owner mode so "Save & Download" hands you a finished
   index.html rather than a data file you would have to convert. One generator,
   so the page you download is the page the build produces.

   `opts.dims(src)` returns the ` width="…" height="…"` attribute string for an
   image. Node reads it off disk; the browser reads it off the images already on
   the page. Either way it is only a hint that stops the layout jumping.
   ========================================================================== */
import * as R from './render.js';

const esc = R.esc;
const attr = R.attr;
const noDims = () => '';

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0a0c10"/><path d="M6 6h15M6 6v15" stroke="#d7a24a" stroke-width="3" fill="none"/><path d="M58 58h-15M58 58v-15" stroke="#d7a24a" stroke-width="3" fill="none"/><text x="32" y="41" font-family="monospace" font-size="22" fill="#d7a24a" text-anchor="middle" font-weight="700">DL</text></svg>`
)}`;

export function pageTitleOf(site) {
  return `${site.profile.name} — ${site.profile.title.split('—')[0].trim()}`;
}

export function metaDescOf(site) {
  return site.profile.bio.replace(/\s+/g, ' ').slice(0, 155).replace(/[,\s]+\S*$/, '') + '…';
}

export function siteUrlOf(site) {
  return (site.seo?.siteUrl || '').replace(/\/?$/, '/');
}

function jsonLd(site) {
  const { profile, contact, seo } = site;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: profile.name,
    description: profile.bio,
    url: siteUrlOf(site),
    image: siteUrlOf(site) + profile.cover,
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

export function buildPage(site, opts = {}) {
  const dims = opts.dims || noDims;
  const year = opts.year || new Date().getFullYear();
  const { profile, copy, contact, seo } = site;
  const title = pageTitleOf(site);
  const desc = metaDescOf(site);
  const url = siteUrlOf(site);
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
            <img id="avatarImg" src="${attr(avatarSrc)}"${dims(avatarSrc)} alt="${attr(profile.name)}">
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
      <div class="gallery" id="gallery">${R.renderGallery(site, 'All', false, { dims })}</div>
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${attr(desc)}">
<meta name="author" content="${attr(profile.name)}">
<meta name="keywords" content="${attr((seo?.keywords || []).join(', '))}">
<meta name="theme-color" content="#0a0c10">
<link rel="canonical" href="${attr(url)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${attr(url)}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(desc)}">
<meta property="og:image" content="${attr(url + profile.cover)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${attr(title)}">
<meta name="twitter:description" content="${attr(desc)}">
<meta name="twitter:image" content="${attr(url + profile.cover)}">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="image" href="${attr(profile.cover)}" fetchpriority="high">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/styles.css">
<script type="application/ld+json">${jsonLd(site)}</script>
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
    <span>© ${year} ${esc(profile.name)}</span>
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
}
