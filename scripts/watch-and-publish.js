#!/usr/bin/env node
/*
 * Watches the Downloads folder for "duong-portfolio.html" (the file the
 * "Owner edit -> Save & Download" button in index.html produces), pulls any
 * newly embedded base64 images/PDFs out into images/ and files/, writes the
 * cleaned result over index.html, then commits and pushes to GitHub.
 *
 * Run this locally while you edit the live/local site as the owner:
 *   node scripts/watch-and-publish.js
 * or double-click watch-and-publish.bat
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO_DIR = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(REPO_DIR, 'index.html');
const IMAGES_DIR = path.join(REPO_DIR, 'images');
const FILES_DIR = path.join(REPO_DIR, 'files');
const WATCH_NAME = process.env.WATCH_FILENAME || 'duong-portfolio.html';
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.join(os.homedir(), 'Downloads');
const WATCH_PATH = path.join(DOWNLOADS_DIR, WATCH_NAME);

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: REPO_DIR, encoding: 'utf8' });
}

function nextCounter(dir, prefix) {
  if (!fs.existsSync(dir)) return 1;
  let max = 0;
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(new RegExp('^' + prefix + '-(\\d+)\\.'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
};

function hashFile(p) {
  return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
}

// Maps content-hash -> existing relative path, so re-processing the same
// download (fs.watch commonly fires more than once per write) or re-uploading
// an unchanged image reuses the existing file instead of creating a duplicate.
function buildHashIndex() {
  const index = new Map();
  for (const [dir, relDir] of [[IMAGES_DIR, 'images'], [FILES_DIR, 'files']]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      index.set(hashFile(path.join(dir, f)), `${relDir}/${f}`);
    }
  }
  return index;
}

// Pulls every data:<mime>;base64,<data>" occurrence out of html and writes
// it to images/ (or files/ for non-images), replacing it with a relative path.
function extractEmbeddedAssets(html) {
  const re = /data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)"/g;
  let imgCounter = nextCounter(IMAGES_DIR, 'img');
  let fileCounter = nextCounter(FILES_DIR, 'file');
  const hashIndex = buildHashIndex();
  const created = [];

  const cleaned = html.replace(re, (match, mime, b64) => {
    const ext = MIME_EXT[mime.toLowerCase()];
    if (!ext) return match; // unknown type, leave untouched
    const buf = Buffer.from(b64, 'base64');
    const hash = crypto.createHash('sha1').update(buf).digest('hex');
    const existing = hashIndex.get(hash);
    if (existing) return `${existing}"`;

    const isImage = mime.toLowerCase().startsWith('image/') && mime.toLowerCase() !== 'image/svg+xml';
    const dir = isImage ? IMAGES_DIR : FILES_DIR;
    const relDir = isImage ? 'images' : 'files';
    const prefix = isImage ? 'img' : 'file';
    const counter = isImage ? imgCounter++ : fileCounter++;
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${prefix}-${String(counter).padStart(3, '0')}.${ext}`;
    fs.writeFileSync(path.join(dir, filename), buf);
    const rel = `${relDir}/${filename}`;
    hashIndex.set(hash, rel);
    created.push(rel);
    return `${rel}"`;
  });

  return { cleaned, created };
}

function waitForStableFile(filePath, cb) {
  let lastSize = -1;
  let stableTicks = 0;
  const timer = setInterval(() => {
    let size;
    try {
      size = fs.statSync(filePath).size;
    } catch {
      return; // file briefly gone mid-write; keep waiting
    }
    if (size === lastSize && size > 0) {
      stableTicks++;
      if (stableTicks >= 2) {
        clearInterval(timer);
        cb();
      }
    } else {
      stableTicks = 0;
      lastSize = size;
    }
  }, 300);
}

function publish() {
  log(`Detected export at ${WATCH_PATH}, processing...`);
  const raw = fs.readFileSync(WATCH_PATH, 'utf8');
  const { cleaned, created } = extractEmbeddedAssets(raw);

  const current = fs.existsSync(INDEX_PATH) ? fs.readFileSync(INDEX_PATH, 'utf8') : '';
  if (cleaned === current) {
    log('No changes from current index.html — skipping commit.');
    return;
  }

  fs.writeFileSync(INDEX_PATH, cleaned, 'utf8');
  if (created.length) log(`Extracted ${created.length} new embedded file(s): ${created.join(', ')}`);

  try {
    const addArgs = ['add', 'index.html'];
    if (fs.existsSync(IMAGES_DIR)) addArgs.push('images');
    if (fs.existsSync(FILES_DIR)) addArgs.push('files');
    run('git', addArgs);

    try {
      run('git', ['diff', '--cached', '--quiet']);
      log('Nothing staged to commit — skipping.');
      return;
    } catch {
      // non-zero exit means there ARE staged changes, which is what we want
    }

    run('git', ['commit', '-m', `Owner edit: update portfolio (${new Date().toISOString()})`]);
    log('Committed. Pushing to origin/main...');
    run('git', ['push', 'origin', 'main']);
    log('Pushed to GitHub successfully.');
  } catch (err) {
    log(`ERROR during git commit/push: ${err.message}`);
    log('Your changes are saved in index.html locally — resolve the git issue and push manually.');
  }
}

function main() {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    console.error(`Downloads folder not found: ${DOWNLOADS_DIR}`);
    process.exit(1);
  }
  log(`Watching ${WATCH_PATH}`);
  log('Leave this running. In the site, click "Owner edit" -> make changes -> "Save & Download".');

  fs.watch(DOWNLOADS_DIR, (eventType, filename) => {
    if (filename !== WATCH_NAME) return;
    if (!fs.existsSync(WATCH_PATH)) return;
    waitForStableFile(WATCH_PATH, () => {
      try {
        publish();
      } catch (err) {
        log(`ERROR: ${err.message}`);
      }
    });
  });
}

if (require.main === module) main();

module.exports = { extractEmbeddedAssets, publish };
