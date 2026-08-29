# Architectural Design Studio — portfolio website

Live at **https://andreyruvi.github.io/portfolio/**
Repository: `andreyruvi/portfolio`

A static site. No server, no database, no build step required to publish —
GitHub Pages serves the HTML files exactly as they are in this folder.

---

## First-time setup

**1. Install Git for Windows** — https://git-scm.com/download/win
Keep clicking Next; the default options are correct. `push.bat` opens this page
for you if Git is missing.

**2. Extract this ZIP** anywhere you like. `D:\Working Data\Github\portfolio` is
fine, so is your Desktop. `push.bat` uses its own folder as the repository, so
the location does not matter.

**3. Double-click `push.bat`.**

That's it. On the first run it initialises the repository, connects it to
GitHub, adopts the existing history, then commits and pushes.

### GitHub authentication — once, and never again

The first push opens a GitHub sign-in window in your browser. Sign in and allow
access. Git for Windows stores the result in Windows Credential Manager and
never asks again.

There is no password or token in any file in this project, and there should
never be one. If you are ever asked to paste a token into a file, don't.

If the login window does not appear, or you closed it by accident, just run
`push.bat` again.

---

## Adding a new project

Three steps.

**1. Put the images in a folder**

```
images/projects/<anything>/...        or simply images/
```
Any filename works. JPG, PNG and WebP are all fine. Large photos are converted
to WebP automatically on GitHub, so you do not need to resize them first — but a
20 MB camera file is still a 20 MB upload, so trim the really big ones.

**2. Add the project to `data/projects.json`**

Copy an existing block and change it. Only `id`, `title`, `category` and `media`
are required; everything else is optional and simply disappears if you leave it
out.

```json
{
  "id": "p2026-riverside",
  "title": "Riverside Residence — Permit Set",
  "category": "Permit Drawings",
  "buildingType": "Residential",
  "location": "Oregon, USA",
  "year": "2026",
  "software": ["Revit", "AutoCAD"],
  "tags": ["Residential", "Permit Set", "Framing"],
  "scope": [
    "Cover sheet and index",
    "Floor plans and elevations",
    "Foundation details"
  ],
  "description": "One or two sentences about the project and what you produced.",
  "image": "images/projects/riverside/01.jpg",
  "media": [
    { "type": "image", "src": "images/projects/riverside/01.jpg" },
    { "type": "image", "src": "images/projects/riverside/02.jpg" },
    { "type": "pdf",   "src": "files/riverside-set.pdf" }
  ]
}
```

- `id` — any unique text, no spaces.
- `category` — creates the filter chip automatically. Reuse an existing one to
  group projects together, or invent a new one and a new chip appears.
- `media` — the first image is the cover shown on the card.

**3. Rebuild and push**

```
npm run build        (or: node scripts/build.mjs)
```
then double-click `push.bat`.

If you do not have Node.js installed, skip the build and use owner mode instead
— see below. It does the same job in the browser.

---

## The easier way: owner mode

You do not have to touch JSON at all.

1. Open the website and click **Owner edit** at the bottom-right.
2. Enter your password.
3. Change anything: click text to edit it, add projects, add and reorder photos,
   edit services, tools and contact details.
4. Press **⤓ Save & Download** → you get `portfolio-update.zip`.
5. Right-click the zip → **Extract All** → extract it **into this folder**,
   saying yes when Windows asks to replace files.
6. Double-click `push.bat`.

The zip contains all five finished pages, the three data files and any photos
you added — already resized to WebP, at the right paths. Extracting it puts
every file exactly where it belongs.

Your edits auto-save in the browser as you go, so closing the tab loses nothing.
**Reset to file** throws the draft away and goes back to the published version.

---

## Folder structure

```
portfolio/
├── index.html            Home — hero, about, services, featured work
├── about.html            Experience, process, software
├── services.html         All eight services in detail
├── portfolio.html        Full grid with filters, search and project galleries
├── contact.html          Contact details and what to send
│
├── css/style.css         The whole design
├── js/
│   ├── app.js            Menu, reveal, filter, search, lightbox
│   ├── render.js         The markup for each section, shared with the build
│   ├── page.js           Assembles the pages, shared with the build
│   ├── editor.js         Owner mode (only downloaded when you click it)
│   └── zip.js            Builds the Save & Download archive
│
├── data/
│   ├── site.json         Name, headline, about text, stats, tools, contact, SEO
│   ├── services.json     The service cards
│   └── projects.json     The portfolio
│
├── images/               Full-size photos (WebP)
│   └── thumb/            Small versions used in the grid
│
├── scripts/
│   ├── build.mjs         Regenerates the HTML from the data files
│   └── optimize-images.mjs  Converts new PNG/JPG to WebP
│
├── push.bat              Publish to GitHub
├── PREVIEW.bat           Open the site from this folder, before publishing
└── README.md
```

### Which file do I edit?

| To change | Edit |
|---|---|
| A project, or add one | `data/projects.json` |
| A service | `data/services.json` |
| Headline, about text, stats, contact details | `data/site.json` |
| Colours, spacing, fonts | `css/style.css` |
| Page layout or a new section | `js/page.js` |
| The password | `data/site.json` → `editor.editKey` |

**Never edit the `.html` files by hand.** They are generated. Change the data
and rebuild, or use owner mode.

---

## Troubleshooting

**"Git is not installed"**
`push.bat` opens the download page. Install with default options and run it
again.

**Authentication failed / the login window closed**
Run `push.bat` again. To reset the saved login: Windows Search → *Credential
Manager* → *Windows Credentials* → remove the `git:https://github.com` entry,
then push again and sign in fresh.

**"This folder is already connected to a different project"**
The folder is a different repository. Move it aside and extract the portfolio
into a fresh folder.

**Push rejected / "failed to push some refs"**
Something changed on GitHub that you do not have locally. Run `push.bat` again —
it pulls before pushing, so the second run normally succeeds.

**GitHub Pages is not updating**
Wait a minute, then press **Ctrl+F5** to force a reload past the browser cache.
If it is still stale, check the **Actions** tab on GitHub for a failed run, and
**Settings → Pages** to confirm the source is branch `main`, folder `/ (root)`.

**Large image files**
Anything over about 5 MB makes pushes slow and eats the repository size limit.
Owner mode resizes photos before they are added; if you drop files in by hand,
resize them to around 1600 px on the long edge first.

**A project does not appear**
Check `data/projects.json` opens without an error — a missing comma or bracket
breaks the whole file. Paste it into <https://jsonlint.com> if in doubt. Then
confirm the image paths exist exactly as written, including capital letters.

---

## Notes and limitations

- **`index.html` is yours.** GitHub Actions will not overwrite a page you push.
  It only regenerates the HTML if `data/*.json` changed *without* matching
  pages, so the two can never disagree.
- **The password is public.** It sits in `data/site.json`, which anyone can
  read. It stops a visitor idly clicking into edit mode; it is not security.
  What actually protects the site is your GitHub login, which lives on your
  computer.
- **Locations and dates** are shown only where they were on the drawings. No
  client names or street addresses are published.
- **The original PNG images** (102 MB of them) are still in the repository
  history at commit `94dddbb`. Nothing was lost when they were converted.
- **Node.js** is only needed if you edit the JSON by hand and want to rebuild
  locally. Owner mode and `push.bat` do not need it.
