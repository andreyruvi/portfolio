# Duong L. — Architectural Design Studio

Portfolio site. Live at **https://andreyruvi.github.io/portfolio/**

---

## The short version

You never need to touch code.

1. Open the site and add `#edit` to the address:
   `https://andreyruvi.github.io/portfolio/#edit`
2. Click **Owner edit**, enter your edit key and your GitHub token.
3. Change whatever you want — click text to type over it, add projects, add photos.
4. Click **Publish**.
5. Wait about a minute. The live site updates by itself.

That's the whole workflow. No downloading, no ZIP files, no `.bat` file, no PC required —
it works from your phone too.

---

## What you can change in the browser

| Button / action | What it does |
|---|---|
| Click any heading, the bio, rate, location, year | Type over it directly |
| **+ Project** | Pick photos from your computer or phone → creates a new project |
| Click a project card (in owner mode) | Rename it, change its category, edit its description, add or remove photos, or delete it |
| **Services** | Edit the six service titles and descriptions |
| **Cover photo** | Replace the big banner image at the top |
| **Availability** | Toggle between "Available for work" and "Fully booked" |
| **Publish** | Sends everything to GitHub and updates the live site |
| **Sign out** | Removes your token from this browser (do this on shared computers) |

Photos are shrunk and converted to WebP **in your browser** before upload, so adding a
50 MB render does not put a 50 MB file in the repository.

---

## How it works underneath

```
data/site.json          ← all the words and image paths. The single source of truth.
images/*.webp           ← full-size photos (max 1600px)
images/thumb/*.webp     ← small versions used in the gallery grid
assets/styles.css       ← the design
assets/app.js           ← gallery filters, lightbox, scrolling behaviour
assets/editor.js        ← owner edit mode (only loaded when you ask for it)
scripts/build.mjs       ← turns site.json into index.html
scripts/optimize-images.mjs  ← turns any PNG/JPG in images/ into WebP
.github/workflows/publish.yml ← runs the two scripts on every push
index.html              ← generated. Do not edit by hand; it gets overwritten.
```

When anything is pushed to `main`, GitHub Actions runs `optimize-images` then `build`,
and commits the rebuilt `index.html` back. GitHub Pages serves it. That is the
"automatic" part — pushing *is* deploying.

---

## Running it on your own PC (optional)

You only need this if you want to preview changes before they go live.

```bash
git clone https://github.com/andreyruvi/portfolio.git
cd portfolio
node scripts/build.mjs          # rebuild index.html from data/site.json
npx serve .                     # or: python -m http.server 8000
```

Then open http://localhost:8000

Requires [Node.js](https://nodejs.org) 18+. Image optimisation additionally needs
[ImageMagick](https://imagemagick.org) — but you do not need it locally, because
GitHub does that step for you on every push.

---

## Your GitHub token

The **Publish** button needs a token so the browser can write to this repository.

Create one at
<https://github.com/settings/personal-access-tokens/new>:

- **Repository access:** Only select repositories → `andreyruvi/portfolio`
- **Permissions:** Contents → *Read and write*
- **Expiration:** 90 days (make a new one when it expires)

The token is stored only in your browser's local storage. It is never written into
this repository. If you use a shared or public computer, press **Sign out** when you
finish, or revoke the token from that same settings page.

---

## Notes

- The original PNG source images live in the git history (commit `94dddbb` and
  earlier). Nothing was lost; the working tree just carries the WebP versions,
  which cut the site from 102 MB to 15 MB.
- `index.html` is generated. If you edit it directly, your change disappears on the
  next push. Edit `data/site.json` (or use owner mode) instead.
- To add a category to the filter row, add it to `categories` in `data/site.json`.
