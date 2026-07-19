#!/usr/bin/env node
/*
 * Watches the Downloads folder for "duong-portfolio.html" and its sibling
 * "duong-portfolio-assets.zip" (the two files the "Owner edit -> Save &
 * Download" button in index.html produces — a small HTML file plus a zip of
 * only the newly-added images/PDFs). Unzips any new assets into images/ and
 * files/, writes the cleaned HTML over index.html, then commits and pushes
 * to GitHub.
 *
 * Run this locally while you edit the live/local site as the owner:
 *   node scripts/watch-and-publish.js
 * or double-click watch-and-publish.bat
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const REPO_DIR = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(REPO_DIR, 'index.html');
const IMAGES_DIR = path.join(REPO_DIR, 'images');
const FILES_DIR = path.join(REPO_DIR, 'files');
const WATCH_NAME = process.env.WATCH_FILENAME || 'duong-portfolio.html';
const ZIP_NAME = process.env.ASSETS_ZIP_FILENAME || 'duong-portfolio-assets.zip';
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.join(os.homedir(), 'Downloads');
const WATCH_PATH = path.join(DOWNLOADS_DIR, WATCH_NAME);
const ZIP_PATH = path.join(DOWNLOADS_DIR, ZIP_NAME);

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

function waitForStableFile(filePath, cb, { timeoutMs = null } = {}) {
  let lastSize = -1;
  let stableTicks = 0;
  const started = Date.now();
  const timer = setInterval(() => {
    if (timeoutMs !== null && Date.now() - started > timeoutMs) {
      clearInterval(timer);
      cb(false);
      return;
    }
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
        cb(true);
      }
    } else {
      stableTicks = 0;
      lastSize = size;
    }
  }, 300);
}

// Reads a zip file's central directory and returns [{name, data}], decoding
// both "stored" (method 0, what buildZip() in index.html writes) and
// "deflate" (method 8) entries so this stays compatible with any zip tool.
function readZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Not a valid zip (no end-of-central-directory record)');
  const total = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);

  const entries = [];
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error('Corrupt zip central directory');
    const method = buf.readUInt16LE(cdOffset + 10);
    const compSize = buf.readUInt32LE(cdOffset + 20);
    const nameLen = buf.readUInt16LE(cdOffset + 28);
    const extraLen = buf.readUInt16LE(cdOffset + 30);
    const commentLen = buf.readUInt16LE(cdOffset + 32);
    const localOffset = buf.readUInt32LE(cdOffset + 42);
    const name = buf.toString('utf8', cdOffset + 46, cdOffset + 46 + nameLen);

    const lfNameLen = buf.readUInt16LE(localOffset + 26);
    const lfExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lfNameLen + lfExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 0 ? raw : zlib.inflateRawSync(raw);
    entries.push({ name, data });

    cdOffset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function applyAssetsZip(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const entries = readZipEntries(buf);
  const written = [];
  for (const { name, data } of entries) {
    const dest = path.join(REPO_DIR, name);
    if (!dest.startsWith(REPO_DIR + path.sep)) continue; // guard against path traversal
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest)) {
      fs.writeFileSync(dest, data);
      written.push(name);
    }
  }
  return written;
}

// Which images/files/... paths does this HTML reference that don't exist on disk yet?
function findMissingReferencedAssets(html) {
  const re = /\b(images|files)\/[\w.+-]+\.\w+/g;
  const missing = new Set();
  let m;
  while ((m = re.exec(html))) {
    if (!fs.existsSync(path.join(REPO_DIR, m[0]))) missing.add(m[0]);
  }
  return [...missing];
}

function commitAndPush(summary) {
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

    run('git', ['commit', '-m', `Owner edit: update portfolio (${new Date().toISOString()})${summary ? '\n\n' + summary : ''}`]);
    log('Committed. Pushing to origin/main...');
    run('git', ['push', 'origin', 'main']);
    log('Pushed to GitHub successfully.');
  } catch (err) {
    log(`ERROR during git commit/push: ${err.message}`);
    log('Your changes are saved in index.html locally — resolve the git issue and push manually.');
  }
}

function publish() {
  log(`Detected export at ${WATCH_PATH}, processing...`);
  const raw = fs.readFileSync(WATCH_PATH, 'utf8');
  // legacy fallback: pulls out any base64 that slipped through unsplit
  const { cleaned, created } = extractEmbeddedAssets(raw);
  if (created.length) log(`Extracted ${created.length} embedded file(s) directly from HTML: ${created.join(', ')}`);

  const current = fs.existsSync(INDEX_PATH) ? fs.readFileSync(INDEX_PATH, 'utf8') : '';
  const missing = findMissingReferencedAssets(cleaned);

  const finish = (assetSummary) => {
    if (cleaned === current) {
      log('No changes from current index.html — skipping commit.');
      return;
    }
    fs.writeFileSync(INDEX_PATH, cleaned, 'utf8');
    commitAndPush(assetSummary);
  };

  if (missing.length === 0) {
    finish(null);
    return;
  }

  log(`Waiting for ${ZIP_NAME} with ${missing.length} referenced file(s) not yet on disk...`);
  waitForStableFile(ZIP_PATH, (ok) => {
    if (!ok) {
      log(`WARNING: ${ZIP_NAME} never appeared. Publishing HTML anyway — these paths will be broken until the assets are added: ${missing.join(', ')}`);
      finish(null);
      return;
    }
    try {
      const written = applyAssetsZip(ZIP_PATH);
      log(`Unzipped ${written.length} new file(s): ${written.join(', ')}`);
      const stillMissing = missing.filter((m) => !fs.existsSync(path.join(REPO_DIR, m)));
      if (stillMissing.length) log(`WARNING: still missing after unzip: ${stillMissing.join(', ')}`);
      finish(`Includes ${written.length} new asset file(s) from ${ZIP_NAME}.`);
    } catch (err) {
      log(`ERROR unzipping ${ZIP_NAME}: ${err.message}`);
      finish(null);
    }
  }, { timeoutMs: 20000 });
}

function main() {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    console.error(`Downloads folder not found: ${DOWNLOADS_DIR}`);
    process.exit(1);
  }
  log(`Watching ${WATCH_PATH} (+ ${ZIP_NAME} when new assets are added)`);
  log('Leave this running. In the site, click "Owner edit" -> make changes -> "Save & Download".');

  fs.watch(DOWNLOADS_DIR, (eventType, filename) => {
    if (filename !== WATCH_NAME) return;
    if (!fs.existsSync(WATCH_PATH)) return;
    waitForStableFile(WATCH_PATH, (ok) => {
      if (!ok) return;
      try {
        publish();
      } catch (err) {
        log(`ERROR: ${err.message}`);
      }
    });
  });
}

if (require.main === module) main();

module.exports = { extractEmbeddedAssets, readZipEntries, applyAssetsZip, findMissingReferencedAssets, publish };
