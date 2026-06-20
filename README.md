# WikiCanvas

An infinite, pannable/zoomable canvas where each node is a live, scrollable
Wikipedia article. Click an internal link inside a window to spawn a connected
window for the target article and draw an edge from source to target — building
a visual map of an exploration. Sessions can be reopened from a list.

Built on Expo (expo-router) + React Native Web, NativeWind, Supabase (sync +
Wikipedia proxy), and a unified `react-native-skia` canvas that runs on web and
native from one codebase.

## Status

Local-first. Everything works with no login (IndexedDB on web, SQLite on
native). Google sign-in is optional and only enables cross-device sync.

## Requirements

- Node `>=20.19.0`
- npm

## Setup

```bash
npm install
npm run setup:skia-web   # writes public/canvaskit.wasm (needed for the web canvas)
cp .env.local.example .env.local   # then fill in EXPO_PUBLIC_SUPABASE_* (optional; sync only)
npm run web
```

## Scripts

- `npm run web` — Expo web dev server
- `npm run export:web` — static web build to `dist/` (runs `setup:skia-web` first)
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` / `npm run format:check`
- `npm test` / `npm run test:coverage`
- `npm run coverage:ratchet` — fail the build if coverage drops below the floor
- `npm run test:e2e` — Playwright against a built static export
- `npm run verify` — lint + format:check + typecheck + test:coverage + coverage:ratchet

## Environment Variables

Copy `.env.local.example` to `.env.local` (for local dev) or `.env` and fill in the values below.
Sync features are disabled when these are absent.

| Variable                               | Description                       |
| -------------------------------------- | --------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`             | Supabase project URL              |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable API key |

## Deployment (web / Netlify)

Netlify runs `npm run export:web` and publishes `dist/`. `export:web` runs
`setup:skia-web` first so `public/canvaskit.wasm` is bundled — the web Skia
canvas needs it.

## License & source

WikiCanvas is licensed under the **GNU AGPL-3.0** (see `LICENSE`). It is a
derivative of an AGPL-licensed project. Per the AGPL's network-use clause, the
running app exposes a **Source code** link to this repository:
<https://github.com/vasilyoshev/wikicanvas>.

Wikipedia article content is © its authors and licensed **CC BY-SA 4.0**; each
article window credits Wikipedia and links to the source, and the fullscreen
reading view names the license.
