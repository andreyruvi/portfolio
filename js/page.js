/* =============================================================================
   page.js — builds every page of the site from the data files.

   Shared, exactly like render.js: scripts/build.mjs calls it from Node, and the
   browser calls it in owner mode so "Save & Download" hands you finished HTML
   rather than a data file you would have to convert. One generator, so the page
   you download is the page the build produces.

   `opts.dims(src)` returns the ` width="…" height="…"` attributes for an image.
   Node reads it off disk; the browser reads it off the images already on the
   page. Either way it is a hint that stops the layout jumping while loading.

   To add a page: write a section function, add an entry to PAGES, and add a
   link to NAV. Nothing else needs to change.
   ========================================================================== */
import * as R from './render.js';

const esc = R.esc;
const attr = R.attr;
const noDims = () => '';

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0a0c10"/><path d="M6 6h15M6 6v15" stroke="#c8a24a" stroke-width="3" fill="none"/><path d="M58 58h-15M58 58v-15" stroke="#c8a24a" stroke-width="3" fill="none"/><text x="32" y="41" font-family="monospace" font-size="22" fill="#c8a24a" text-anchor="middle" font-weight="700">AD</text></svg>`
)}`;

export const NAV = [
  { file: 'index.html',     label: 'Home' },
  { file: 'about.html',     label: 'About' },
  { file: 'services.html',  label: 'Services' },
  { file: 'portfolio.html', label: 'Portfolio' },
  { file: 'contact.html',   label: 'Contact' },
];

export const siteUrlOf = (site) => (site.seo?.siteUrl || '').replace(/\/?$/, '/');

/* ------------------------------------------------------------ page chrome */
function head(site, page) {
  const url = siteUrlOf(site);
  const canonical = url + (page.file === 'index.html' ? '' : page.file);
  const ogImage = url + site.profile.cover;
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(page.title)}</title>
<meta name="description" content="${attr(page.description)}">
<meta name="author" content="${attr(site.profile.owner || site.profile.name)}">
<meta name="keywords" content="${attr((site.seo?.keywords || []).join(', '))}">
<meta name="theme-color" content="#0a0c10">
<link rel="canonical" href="${attr(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${attr(site.profile.name)}">
<meta property="og:url" content="${attr(canonical)}">
<meta property="og:title" content="${attr(page.title)}">
<meta property="og:description" content="${attr(page.description)}">
<meta property="og:image" content="${attr(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${attr(page.title)}">
<meta name="twitter:description" content="${attr(page.description)}">
<meta name="twitter:image" content="${attr(ogImage)}">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${page.preloadCover ? `<link rel="preload" as="image" href="${attr(site.profile.cover)}" fetchpriority="high">` : ''}
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
<script type="application/ld+json">${jsonLd(site)}</script>`;
}

function jsonLd(site) {
  const { profile, contact, seo } = site;
  const url = siteUrlOf(site);
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: profile.name,
    alternateName: profile.owner,
    description: profile.intro,
    url,
    image: url + profile.cover,
    email: contact.email,
    telephone: contact.whatsapp,
    areaServed: { '@type': 'Country', name: 'United States' },
    availableLanguage: 'English',
    foundingDate: profile.since,
    knowsAbout: seo?.keywords || site.tools,
    sameAs: [contact.x, contact.instagram].filter(Boolean),
    makesOffer: site.services.map((s) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: s.title, description: s.summary },
    })),
  });
}

function header(site, current) {
  const links = NAV.map((n) =>
    `<a href="${n.file}"${n.file === current ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`
  ).join('');
  return `
<a class="skip" href="#main">Skip to content</a>
<header class="site-head" id="siteHead" data-stuck="false">
  <div class="wrap">
    <a class="brand" href="index.html" aria-label="${attr(site.profile.name)} — home">
      <span class="sheet">AD</span>
      <span class="brand-text">
        <span class="name" id="brandName">${esc(site.profile.name)}</span>
        <span class="brand-sub">${esc(site.profile.title)}</span>
      </span>
    </a>
    <nav class="nav" id="nav" aria-label="Main">${links}</nav>
    <a class="btn primary btn-sm nav-cta" href="contact.html">Start a project</a>
    <button class="nav-toggle" id="navToggle" type="button" aria-expanded="false" aria-controls="nav" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>`;
}

function footer(site) {
  const ct = site.contact;
  const links = NAV.map((n) => `<li><a href="${n.file}">${esc(n.label)}</a></li>`).join('');
  const services = site.services.slice(0, 6)
    .map((s) => `<li><a href="services.html">${esc(s.title)}</a></li>`).join('');
  return `
<footer class="site-foot">
  <div class="wrap foot-grid">
    <div class="foot-brand">
      <div class="brand">
        <span class="sheet">AD</span>
        <span class="name">${esc(site.profile.name)}</span>
      </div>
      <p>${esc(site.profile.intro)}</p>
      <div class="foot-status"><span class="mini-dot"></span>${esc(site.profile.availability)}</div>
    </div>
    <div>
      <h4>Site</h4>
      <ul>${links}</ul>
    </div>
    <div>
      <h4>Services</h4>
      <ul>${services}</ul>
    </div>
    <div>
      <h4>Contact</h4>
      <ul>
        ${ct.email ? `<li><a href="mailto:${attr(ct.email)}">${esc(ct.email)}</a></li>` : ''}
        ${ct.whatsapp ? `<li><a href="${attr(R.waUrl(ct.whatsapp))}" target="_blank" rel="noopener">WhatsApp</a></li>` : ''}
        ${ct.telegram ? `<li><a href="${attr(R.socialUrl(ct.telegram, 'https://t.me/'))}" target="_blank" rel="noopener">Telegram</a></li>` : ''}
        <li>${esc(site.profile.hours)}</li>
      </ul>
    </div>
  </div>
  <div class="wrap foot-bar">
    <span>© ${new Date().getFullYear()} ${esc(site.profile.name)}</span>
    <span>${esc(site.tools.join(' · '))}</span>
  </div>
</footer>`;
}

const LIGHTBOX = `
<div class="lb" id="lightbox" data-open="false" role="dialog" aria-modal="true" aria-labelledby="lbTitle" hidden>
  <button class="lb-close" id="lbClose" type="button">CLOSE ✕</button>
  <div class="lb-inner">
    <div class="lb-strip" id="lbStrip"></div>
    <div class="lb-stage" id="lbStage"></div>
    <div class="lb-controls" id="lbControls">
      <button class="lb-nav" type="button" id="lbPrev" title="Previous" aria-label="Previous image">‹</button>
      <button class="lb-play" type="button" id="lbPlayBtn" title="Play / pause" aria-label="Play or pause slideshow">⏸</button>
      <div class="lb-progress"><div class="lb-progress-bar" id="lbBar"></div></div>
      <span class="lb-count" id="lbCount"></span>
      <button class="lb-nav" type="button" id="lbNext" title="Next" aria-label="Next image">›</button>
    </div>
    <div class="lb-body">
      <div class="lb-head-row">
        <div>
          <div class="cat" id="lbCat"></div>
          <h3 id="lbTitle"></h3>
          <div class="lb-sub" id="lbSub"></div>
        </div>
        <div id="lbOpen"></div>
      </div>
      <div class="lb-cols">
        <p id="lbDesc"></p>
        <div class="lb-facts">
          <div class="lb-fact" id="lbScopeBox"><h4>Scope</h4><ul id="lbScope"></ul></div>
          <div class="lb-fact" id="lbSoftBox"><h4>Software</h4><div class="chips" id="lbSoft"></div></div>
          <div class="lb-fact" id="lbTagBox"><h4>Tags</h4><div class="chips" id="lbTags"></div></div>
        </div>
      </div>
    </div>
  </div>
</div>`;

/* ---------------------------------------------------------------- blocks */
const ctaBand = (site) => `
<section class="band cta-band">
  <div class="wrap">
    <div class="cta-inner">
      <div>
        <div class="label ct-label" data-field="copy.contactLabel">${esc(site.copy.contactLabel)}</div>
        <h2 data-field="copy.contactHeading">${esc(site.copy.contactHeading)}</h2>
        <p data-field="copy.contactTagline">${esc(site.copy.contactTagline)}</p>
      </div>
      <div class="cta-actions">
        <a class="btn primary" href="contact.html">Start a project</a>
        <a class="btn" href="portfolio.html">View portfolio</a>
      </div>
    </div>
  </div>
</section>`;

const pageHead = (kicker, title, sub) => `
<section class="page-head">
  <div class="wrap">
    <div class="label">${esc(kicker)}</div>
    <h1>${esc(title)}</h1>
    ${sub ? `<p class="lede">${esc(sub)}</p>` : ''}
  </div>
</section>`;

const secHead = (idx, heading, field) => `
<div class="sec-head rise"><span class="idx">${esc(idx)}</span>` +
`<h2${field ? ` data-field="${field}"` : ''}>${esc(heading)}</h2><span class="rule"></span></div>`;

/* ------------------------------------------------------------------ pages */
function homeBody(site, dims) {
  const p = site.profile;
  return `
<section class="hero">
  <div class="hero-media" id="coverFrame">
    <div class="cover-slides" id="coverSlides">${R.renderCoverSlides(site)}</div>
    <div class="cover-sheen"></div>
    <div class="sheettag label" data-field="copy.sheetTag">${esc(site.copy.sheetTag)}</div>
    <button class="photo-edit" type="button" id="coverEditBtn" hidden>⟲ Manage cover photos</button>
  </div>
  <div class="wrap hero-body">
    <div class="hero-text">
      <div class="label hero-kicker" data-field="copy.heroKicker">${esc(site.copy.heroKicker)}</div>
      <h1 data-field="copy.heroHeadline">${esc(site.copy.heroHeadline)}</h1>
      <p class="hero-sub" data-field="copy.heroSub">${esc(site.copy.heroSub)}</p>
      <div class="hero-cta">
        <a class="btn primary" href="portfolio.html">View portfolio</a>
        <a class="btn" href="contact.html">Start a project</a>
      </div>
    </div>
    <div class="titleblock">${R.renderSpec(site)}</div>
  </div>
</section>

<section class="band stats-band">
  <div class="wrap stats">${R.renderStats(site)}</div>
</section>

<section id="about" class="section">
  <div class="wrap">
    ${secHead('01', site.copy.aboutHeading, 'copy.aboutHeading')}
    <div class="about-grid rise">
      <div>
        <p class="lede" data-field="profile.intro">${esc(p.intro)}</p>
        <a class="link-arrow" href="about.html">More about how I work <span>→</span></a>
      </div>
      <div class="about-side">
        <div class="tools-label label" data-field="copy.toolsHeading">${esc(site.copy.toolsHeading)}</div>
        <div class="tools" id="tools">${R.renderTools(site, false)}</div>
      </div>
    </div>
  </div>
</section>

<section id="services" class="section">
  <div class="wrap">
    ${secHead('02', site.copy.servicesHeading, 'copy.servicesHeading')}
    <div class="svc-grid rise" id="svcGrid">${R.renderServices(site, false, { limit: 6 })}</div>
    <a class="link-arrow" href="services.html">All eight services in detail <span>→</span></a>
  </div>
</section>

<section id="work" class="section">
  <div class="wrap">
    ${secHead('03', site.copy.workHeading, 'copy.workHeading')}
    <div class="gallery" id="gallery">${R.renderGallery(site, 'All', false, { dims, limit: 6 })}</div>
    <a class="link-arrow" href="portfolio.html">All ${site.projects.length} projects <span>→</span></a>
  </div>
</section>

${ctaBand(site)}`;
}

function aboutBody(site) {
  const p = site.profile;
  return `
${pageHead('About', 'Architectural documentation, produced remotely', p.intro)}

<section class="section">
  <div class="wrap about-two">
    <div class="prose">${R.paras(p.bio)}</div>
    <aside class="fact-card">
      <h3>At a glance</h3>
      <div class="ci-row"><span class="ci-k">Working since</span><span class="ci-v">${esc(p.since)}</span></div>
      <div class="ci-row"><span class="ci-k">Location</span><span class="ci-v">${esc(p.location)}</span></div>
      <div class="ci-row"><span class="ci-k">Hours</span><span class="ci-v">${esc(p.hours)}</span></div>
      <div class="ci-row"><span class="ci-k">Engagement</span><span class="ci-v">${esc(p.engagement)}</span></div>
      <div class="ci-row"><span class="ci-k">Status</span><span class="ci-v"><span class="mini-dot"></span>${esc(p.availability)}</span></div>
      <a class="btn primary btn-block" href="contact.html">Start a project</a>
    </aside>
  </div>
</section>

<section class="band stats-band"><div class="wrap stats">${R.renderStats(site)}</div></section>

<section class="section">
  <div class="wrap">
    ${secHead('01', site.copy.processHeading, 'copy.processHeading')}
    <ol class="steps rise">${R.renderProcess(site)}</ol>
  </div>
</section>

<section class="section">
  <div class="wrap">
    ${secHead('02', site.copy.toolsHeading, 'copy.toolsHeading')}
    <div class="tool-table rise">${R.renderToolTable(site)}</div>
  </div>
</section>

${ctaBand(site)}`;
}

function servicesBody(site) {
  return `
${pageHead('Services', 'What I can take off your desk',
  'From a single permit set to ongoing documentation support. Every engagement runs against your standards — your title block, your layers, your view templates.')}

<section class="section">
  <div class="wrap">
    <div class="svc-grid detailed rise" id="svcGrid">${R.renderServices(site, false, { detailed: true })}</div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    ${secHead('01', 'Software', 'copy.toolsHeading')}
    <div class="tool-table rise">${R.renderToolTable(site)}</div>
  </div>
</section>

${ctaBand(site)}`;
}

function portfolioBody(site, dims) {
  return `
${pageHead('Portfolio', site.copy.workHeading,
  'Permit sets, construction documents, scan-to-BIM conversions and 3D modelling. Click any project for the full sheet set.')}

<section class="section">
  <div class="wrap">
    <div class="work-bar rise">
      <div class="filters" id="filters" role="group" aria-label="Filter projects by category">${R.renderFilters(site, 'All')}</div>
      <div class="search">
        <label class="sr-only" for="projSearch">Search projects</label>
        <input type="search" id="projSearch" placeholder="Search title, software, scope…" autocomplete="off">
        <button type="button" id="searchClear" aria-label="Clear search" hidden>✕</button>
      </div>
    </div>
    <p class="result-count" id="resultCount" aria-live="polite"></p>
    <div class="gallery" id="gallery">${R.renderGallery(site, 'All', false, { dims })}</div>
  </div>
</section>

${ctaBand(site)}`;
}

function contactBody(site) {
  return `
${pageHead(site.copy.contactLabel, site.copy.contactHeading, site.copy.contactTagline)}

<section class="section">
  <div class="wrap contact-two">
    <div>
      <div class="ci-cap label" data-field="copy.contactReach">${esc(site.copy.contactReach)}</div>
      <div class="contact-info" id="contactInfo">${R.renderContact(site, false)}</div>
      <div class="cta-row" id="ctaRow">${R.renderCta(site)}</div>
    </div>
    <aside class="fact-card">
      <h3>What to send</h3>
      <p>The more of this you can include, the faster I can quote accurately.</p>
      <ul class="check">
        <li>Drawings, CAD files, PDFs or sketches</li>
        <li>Point cloud or survey data, if there is any</li>
        <li>The deliverable you need — permit set, CD set, model, DWG</li>
        <li>Your title block and layer standard</li>
        <li>Target date, and whether it is fixed</li>
      </ul>
      <p class="muted">I will reply with scope, format and a realistic timeline before any work starts.</p>
    </aside>
  </div>
</section>`;
}

/* ------------------------------------------------------------------ build */
export const PAGES = [
  {
    file: 'index.html',
    nav: 'index.html',
    preloadCover: true,
    title: (s) => `${s.profile.name} — ${s.profile.title}`,
    description: (s) => s.copy.heroSub,
    body: homeBody,
  },
  {
    file: 'about.html',
    nav: 'about.html',
    title: (s) => `About — ${s.profile.name}`,
    description: () => 'Architectural BIM and CAD documentation produced remotely for US architects, builders and developers. Experience, software and how a project runs.',
    body: aboutBody,
  },
  {
    file: 'services.html',
    nav: 'services.html',
    title: (s) => `Services — Architectural BIM, CAD and Permit Drawings`,
    description: () => 'Architectural BIM modeling, permit drawings, CAD drafting, construction documentation, scan-to-BIM, structural drafting, MEP coordination and 3D visualisation.',
    body: servicesBody,
  },
  {
    file: 'portfolio.html',
    nav: 'portfolio.html',
    title: (s) => `Portfolio — ${s.projects.length} architectural BIM and CAD projects`,
    description: () => 'Permit sets, full construction documents, scan-to-BIM conversions and 3D models. Residential and commercial projects in Revit, Chief Architect, AutoCAD and SketchUp.',
    body: portfolioBody,
  },
  {
    file: 'contact.html',
    nav: 'contact.html',
    title: (s) => `Contact — ${s.profile.name}`,
    description: (s) => s.copy.contactTagline,
    body: contactBody,
  },
];

export function buildPage(site, pageDef, opts = {}) {
  const dims = opts.dims || noDims;
  const page = {
    file: pageDef.file,
    title: pageDef.title(site),
    description: pageDef.description(site),
    preloadCover: !!pageDef.preloadCover,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
${head(site, page)}
</head>
<body data-page="${attr(pageDef.file)}">
<div id="progress"></div>
${header(site, pageDef.nav)}

<main id="main">
${pageDef.body(site, dims)}
</main>

${footer(site)}
${LIGHTBOX}

<button class="edit-fab" id="editFab" type="button" title="Owner login">🔒 Owner edit</button>

<script type="application/json" id="site-data">${JSON.stringify(site).replace(/</g, '\\u003c')}</script>
<script type="module" src="js/app.js"></script>
</body>
</html>
`;
}

/** Every page, keyed by filename — what build.mjs writes and what the browser
 *  puts into the download zip. */
export function buildAll(site, opts = {}) {
  const out = {};
  for (const def of PAGES) out[def.file] = buildPage(site, def, opts);
  return out;
}
