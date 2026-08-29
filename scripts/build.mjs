#!/usr/bin/env node
/**
 * build.mjs — generates every page from the data files.
 *
 *   data/site.json      profile, copy, contact, stats, tools, process, SEO
 *   data/services.json  the service cards
 *   data/projects.json  the portfolio
 *
 * The pages themselves come from js/page.js, the same module the browser uses
 * for "Save & Download", so a page built here and a page saved from the site
 * are the same page.
 *
 * You normally never need to run this — owner mode hands you finished HTML.
 * Run it after editing the JSON files by hand:
 *
 *   node scripts/build.mjs        (or: npm run build)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll, siteUrlOf, PAGES } from '../js/page.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

/* ------------------------------------------------------------- load data */
const site = read('data/site.json');
site.services = read('data/services.json');
site.projects = read('data/projects.json');

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
  } catch { /* not on disk — skip the hint */ }
  return null;
}
const sizeAttrs = (src) => {
  const d = dims(src);
  return d ? ` width="${d.w}" height="${d.h}"` : '';
};

/* --------------------------------------------------------------- counters */
/**
 * Owner mode names new files img-NNN / doc-NNN. It can only see what the JSON
 * references, so an unreferenced leftover on disk would be silently overwritten
 * by the next upload. Record the real high-water mark from the directories.
 */
function highest(dir, stem) {
  let max = 0;
  try {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      const m = new RegExp(`^${stem}-(\\d+)\\.`).exec(f);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  } catch { /* directory may not exist yet */ }
  return max;
}
site.counters = { img: highest('images', 'img'), doc: highest('files', 'doc') };

/* ------------------------------------------------------------------ write */
const pages = buildAll(site, { dims: sizeAttrs });
let bytes = 0;
for (const [file, html] of Object.entries(pages)) {
  fs.writeFileSync(path.join(ROOT, file), html);
  bytes += Buffer.byteLength(html);
}

/* ------------------------------------------------------- sitemap + robots */
const url = siteUrlOf(site);
const today = new Date().toISOString().slice(0, 10);
const urls = PAGES.map((p) => {
  const loc = url + (p.file === 'index.html' ? '' : p.file);
  const priority = p.file === 'index.html' ? '1.0' : p.file === 'portfolio.html' ? '0.9' : '0.7';
  return `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>${priority}</priority></url>`;
}).join('\n');

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
fs.writeFileSync(path.join(ROOT, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${url}sitemap.xml\n`);

/* Keep data/site.json in step, so a page saved from the browser and a page
   built here carry the same counters. Services and projects stay in their own
   files — this only rewrites the parts site.json owns. */
const { services, projects, ...siteOnly } = site;
fs.writeFileSync(path.join(ROOT, 'data/site.json'), JSON.stringify(siteOnly, null, 2) + '\n');

console.log(
  `built ${Object.keys(pages).length} pages · ${(bytes / 1024).toFixed(1)} KB total · ` +
  `${site.projects.length} projects, ${site.services.length} services, ${site.tools.length} tools · ` +
  `next image img-${String(site.counters.img + 1).padStart(3, '0')}`
);
