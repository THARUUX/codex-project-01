# /zeroz website clone

A locally hosted snapshot of [otsuka-air.jp](https://otsuka-air.jp/), including the original Japanese content, responsive layouts, photography, videos, WebGL scenes, scrolling animations, and page transitions.

## Run

Requires Node.js 22 or newer.

```sh
npm ci --cache /tmp/codex-npm-cache
npm run dev
```

The server listens on port **5173** and binds to all interfaces. Override these with `--host` and `--port`, or set `PORT`.

```sh
npm run dev -- --host 0.0.0.0 --port 3000
```

## Build and preview

```sh
npm run build
npm run preview
```

The build creates a complete static site in `dist/`. Deploy that directory to a static host that serves directory `index.html` files, JavaScript modules, WebAssembly, GLB files, and MP4 videos. No application backend is required.

## Included pages

- Home, with its photographic introduction and interactive 3D chapter scenes
- About
- Science & Technology
- Product (`/product/zeroz/`)
- Interview carousel and all 22 interview articles

Navigation between these 27 pages stays local. The online store and corporate/legal links lead to their original external destinations. Checkout, customer accounts, and corporate contact services are not part of this static website.

## Project structure

- `site/`: complete local site; edit page HTML here
- `site/_astro/`: original exported CSS and compiled animation modules
- `site/assets/`: local photos, videos, models, WebAssembly decoder, and fonts
- `scripts/serve.mjs`: dependency-free HTTP server with video range requests and clean directory routes
- `scripts/build.mjs`: reproducible static export
- `tests/`: browser interaction and asset integrity checks

The reference was captured on October 24, 2026. Site content and brand assets retain their original attribution. Production tracking scripts were removed. The hosted commercial webfonts were replaced with self-hosted Zen Kaku Gothic Antique (SIL Open Font License included in `site/assets/fonts/LICENSE.txt`) and locally available sans-serif fonts, so typography may differ slightly from the original. Normal operation makes no requests to the reference site or font services.

## Test

```sh
npm test
```

Tests use installed Chromium at `/usr/bin/chromium` when available. Otherwise, install Playwright's browser with `npx playwright install chromium`. Tests exercise the real WebGL runtime at a lower device pixel ratio to reduce software rendering costs, and verify page assets, video seeking, the introduction, scrolling, desktop transitions, interview navigation, and the mobile menu.

## Refresh the reference

The current snapshot is included as project files; network access is not needed to run or build it. To explicitly update it from the source:

```sh
python3 scripts/sync-reference.py --refresh
node scripts/prepare-fonts.mjs
npm run build
npm test
```

Without `--refresh`, the sync script reuses existing files and fetches missing dependencies. It uses standard HTTPS certificate verification. Updating the reference can overwrite local edits in `site/`; review your changes first.
