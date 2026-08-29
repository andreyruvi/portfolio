#!/usr/bin/env node
/**
 * optimize-images.mjs
 *
 * Converts every raster image in images/ to two WebP derivatives:
 *   images/<name>.webp        full size, max 1600px on the long edge
 *   images/thumb/<name>.webp  gallery card, max 800px on the long edge
 *
 * Source files (.png/.jpg/.jpeg) are left alone on disk but are never
 * referenced by the site, so they can be pruned safely at any time.
 *
 * Idempotent: an existing derivative that is newer than its source is skipped,
 * so this is cheap to run on every push in CI.
 *
 * Usage:  node scripts/optimize-images.mjs [--prune]
 *   --prune  delete source PNG/JPG once a .webp derivative exists
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES = path.join(ROOT, 'images');
const THUMBS = path.join(IMAGES, 'thumb');

const FULL_MAX = 1600;
const THUMB_MAX = 800;
const FULL_Q = 80;
const THUMB_Q = 70;

const SOURCE_RE = /\.(png|jpe?g)$/i;
const prune = process.argv.includes('--prune');

/** Pick whichever ImageMagick entrypoint this machine has. */
function magick(args) {
  for (const bin of ['magick', 'convert']) {
    try {
      execFileSync(bin, bin === 'magick' ? args : args, { stdio: 'pipe' });
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
  }
  throw new Error('ImageMagick not found (need `magick` or `convert` on PATH)');
}

function isFresh(src, out) {
  if (!fs.existsSync(out)) return false;
  return fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs;
}

function derive(src, out, max, quality) {
  if (isFresh(src, out)) return false;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  magick([
    src,
    '-auto-orient',
    '-strip',
    '-resize', `${max}x${max}>`,
    '-quality', String(quality),
    '-define', 'webp:method=5',
    out,
  ]);
  return true;
}

function main() {
  if (!fs.existsSync(IMAGES)) {
    console.log('no images/ directory — nothing to do');
    return;
  }
  fs.mkdirSync(THUMBS, { recursive: true });

  const sources = fs
    .readdirSync(IMAGES)
    .filter((f) => SOURCE_RE.test(f))
    .sort();

  let built = 0;
  let bytesIn = 0;
  let bytesOut = 0;

  for (const file of sources) {
    const src = path.join(IMAGES, file);
    const base = file.replace(SOURCE_RE, '');
    const full = path.join(IMAGES, `${base}.webp`);
    const thumb = path.join(THUMBS, `${base}.webp`);

    let changed = false;
    changed = derive(src, full, FULL_MAX, FULL_Q) || changed;
    changed = derive(src, thumb, THUMB_MAX, THUMB_Q) || changed;
    if (changed) built++;

    bytesIn += fs.statSync(src).size;
    bytesOut += fs.statSync(full).size + fs.statSync(thumb).size;

    if (prune) fs.rmSync(src);
  }

  const mb = (n) => (n / 1048576).toFixed(1);
  console.log(
    `${sources.length} source images · ${built} rebuilt · ` +
      `${mb(bytesIn)}MB -> ${mb(bytesOut)}MB ` +
      `(${bytesIn ? Math.round((1 - bytesOut / bytesIn) * 100) : 0}% smaller)`
  );
}

main();
