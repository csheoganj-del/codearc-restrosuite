# Cloudflare Pages (free) — correct settings

## Why the last build failed

Deploy command was:

```text
npx wrangler deploy
```

Wrangler tried to upload the **whole repo** as assets, including:

```text
node_modules/workerd/bin/workerd  (~122 MiB)
```

Cloudflare Workers asset limit is **25 MiB per file** → build failed.

## Fix (use these exact settings)

In Cloudflare Dashboard → **Workers & Pages** → your project → **Settings** → **Builds**:

| Setting | Value |
|--------|--------|
| **Framework preset** | None |
| **Build command** | `npm run pages:build` |
| **Build output directory** | `publish-static` |
| **Root directory** | `/` (empty) |
| **Deploy command** | **Leave empty** (delete `npx wrangler deploy`) |

### Environment variables (optional)

Not required for login if `config.js` public fallback is present.  
If you want `/api/*` later via Workers, set:

- (none required for static POS UI)

## What `npm run pages:build` does

Runs `scripts/build-pages.cjs` and copies only:

- HTML / CSS / JS app files  
- `assets/`, `src/`, `images/`  
- small files under `downloads/` (PDFs, APK, manifests)  

It **skips**:

- `node_modules`  
- Windows `.exe` installers  
- desktop/android build trees  

Typical output size: **~30–40 MB** of small files (no 100MB+ binaries).

## After save

Click **Retry deployment** (or push a new commit to `main`).

## Custom domain

**Custom domains** → add `restrosuite.codearc.co.in` → follow DNS instructions.

## Windows EXE downloads

Host installers on **GitHub Releases**, not Cloudflare Pages (same as Vercel hobby limit).
