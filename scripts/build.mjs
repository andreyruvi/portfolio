#!/usr/bin/env node
/**
 * build.mjs — writes index.html (plus sitemap.xml and robots.txt) from
 * data/site.json.
 *
 * The document itself is produced by assets/page.js, the same module the
 * browser uses for "Save & Download", so a page built here and a page saved
 * from the site are identical.
 *
 * You normally never need to run this: owner mode hands you a finished
 * index.html. Run it only if you edited data/site.json by hand.
 *
 *   node scripts/build.mjs      (or: npm run build)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPage, siteUrlOf } from '../assets/page.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));

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
 * references, so an unreferenced leftover on disk (img-105.webp and friends)
 * would be silently overwritten by the next upload. Record the real high-water
 * mark from the directories so the browser never reuses a number.
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
const html = buildPage(site, { dims: sizeAttrs });
fs.writeFileSync(path.join(ROOT, 'index.html'), html);

const url = siteUrlOf(site);
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(
  path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${url}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>
</urlset>
`
);
fs.writeFileSync(
  path.join(ROOT, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${url}sitemap.xml\n`
);

/* Keep data/site.json in step, so a page saved from the browser and a page
   built here carry the same counters. */
fs.writeFileSync(path.join(ROOT, 'data/site.json'), JSON.stringify(site, null, 2) + '\n');

console.log(
  `built index.html · ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB · ` +
    `${site.projects.length} projects, ${site.services.length} services, ` +
    `${site.tools.length} tools · next image img-${String(site.counters.img + 1).padStart(3, '0')}`
);
