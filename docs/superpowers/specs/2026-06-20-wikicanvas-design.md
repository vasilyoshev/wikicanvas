# WikiCanvas — design spec

Date: 2026-06-20
Status: Approved design, pending implementation plan
Author: Vasil Yoshev (with Claude)

## 1. Product

WikiCanvas is an infinite, pannable/zoomable canvas where each node is a live,
scrollable window showing a real Wikipedia article. A user starts a _session_
from one article. Clicking an internal link _inside_ a window spawns a new
connected window for the target article and draws an edge from source → target
(parent → child). Over a session this builds a visual map of an exploration
path — think tldraw/Miro, but the cards are real Wikipedia content. A sessions
list lets the user reopen saved explorations.

The app is built on top of the existing Selftend repo, reused purely for its
infrastructure (Expo + expo-router, React Native Web, NativeWind, Supabase,
Google auth, EAS, Netlify, Jest/Playwright). None of Selftend's self-help
domain code is part of WikiCanvas.

## 2. Goals and non-goals

### v1 scope (build only this)

1. Sessions list: create / open / rename / delete. Each session stores its
   canvas (nodes + edges + positions/sizes + viewport).
2. Canvas screen: infinite pan/zoom board.
3. Article windows (nodes): fetch and render a Wikipedia article's HTML;
   scrollable inside the window; header with title; fullscreen toggle that
   expands one window to fill the viewport and back.
4. Link-spawning: intercept internal article-link clicks inside a window; fetch
   the target, create a new node near the source, draw an edge source → target.
   Non-article links (External, File:, Special:, edit, citations) never spawn —
   they open out to the browser or no-op.
5. Persistence: local-first. Everything works with no login via local storage
   (IndexedDB on web, SQLite on native). On Google sign-in, sync local sessions
   to Supabase and merge back across devices.
6. Attribution: every window credits Wikipedia and links to the source; the
   CC BY-SA license is named in the fullscreen reading view. (See §7.)

### Out of scope for v1

Notes, reading queue, topic suggestions, auto-capture of real browsing,
minimaps, collaboration/sharing. Also deferred: deleting an individual window
(node) — the session is the unit of deletion in v1; edges cascade with their
nodes/session at the schema level so integrity holds when node-delete lands
later.

## 3. Key decisions (with rationale)

| Decision            | Choice                                                                                                                      | Rationale                                                                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repo strategy       | Fresh git repo at `C:\Users\vasil\Projects\WikiCanvas`, **porting Selftend's infrastructure only** (never copy domain code) | Cleaner than copy-then-strip; nothing to delete; Selftend stays an untouched reference.                                                                                                                                                                                        |
| Backend             | **New Supabase project**                                                                                                    | Only WikiCanvas tables; simplest RLS; clean migration history from v1; nothing to ignore.                                                                                                                                                                                      |
| App name            | **WikiCanvas**                                                                                                              | Slug `wikicanvas`, scheme `wikicanvas`, bundle `org.vasilyoshev.wikicanvas`.                                                                                                                                                                                                   |
| Canvas tech         | **Unified React Native canvas** (`react-native-skia` + `react-native-gesture-handler` + `react-native-reanimated`)          | One implementation runs on web (Skia via CanvasKit/WASM) and native; no throwaway web-only renderer. React Flow was rejected because it is web/DOM-only and would force a second native renderer.                                                                              |
| Wikipedia fetch     | **Supabase Edge Function proxy** (`wiki-proxy`, Deno)                                                                       | Browsers cannot set a `User-Agent` (Wikimedia requires one) and CORS on the API is not guaranteed, so direct client fetch is both non-compliant and fragile. The proxy sets the UA, normalizes CORS, and centralizes caching. Co-located with the backend; reusable by native. |
| HTML endpoint       | MediaWiki REST API `GET https://{lang}.wikipedia.org/w/rest.php/v1/page/{title}/with_html`                                  | Current recommended path; the legacy REST API and the Core REST API are both flagged for deprecation (Core: "gradual deprecation starting July 2026"). `with_html` returns the canonical title + license metadata alongside the body.                                          |
| HTML isolation      | Sandboxed `<iframe srcdoc sandbox="allow-scripts">` on web; `react-native-webview` on native                                | Null-origin iframe cannot reach the app/cookies/storage, yet still runs our injected interceptor — strong isolation _and_ link interception in one mechanism. Shadow DOM scopes CSS but leaks and does not sandbox scripts.                                                    |
| Auth                | **Optional.** Sessions list + canvas are public routes; sign-in only enables sync                                           | The product is local-first/no-login. (Selftend gated all routes behind auth + email-verify + consent + onboarding; that gate is removed.)                                                                                                                                      |
| Field encryption    | **Dropped**                                                                                                                 | Selftend encrypts at rest because it stores health data. WikiCanvas data is public article titles + canvas coordinates — non-sensitive. Standard RLS suffices.                                                                                                                 |
| Sync conflict model | **Session-level last-write-wins** by `updated_at`                                                                           | A session (with its nodes/edges) is the atomic unit; simple, fully unit-testable, fine for single-user multi-device.                                                                                                                                                           |
| Native scope in v1  | **Full cross-platform** via the unified canvas                                                                              | User chose cross-platform now; the unified Skia canvas makes it one codebase. Develop web-first, then enable/tune native.                                                                                                                                                      |

## 4. Architecture

### Layers (top to bottom)

- **Screens** (`app/`): thin expo-router route files — sessions list, canvas.
- **Canvas** (`src/features/canvas`): Skia board, node/edge rendering,
  gesture-driven pan/zoom, viewport state, node virtualization.
- **Feature modules** (`src/features/{wikipedia,sessions,sync}`): pure logic +
  repos.
- **Storage**: `LocalStore` (IndexedDB on web / SQLite on native) — source of
  truth; **Supabase** — remote mirror.
- **External**: Wikipedia, reached only through the `wiki-proxy` Edge Function.

### Platform split points (only two)

1. `ArticleHtml` — `ArticleHtml.tsx` (iframe) vs `ArticleHtml.native.tsx`
   (`react-native-webview`); Metro picks per platform.
2. `LocalStore` adapter — IndexedDB vs SQLite.

Everything else (canvas, window chrome, all logic, sync) is shared code.
`'use dom'` / Expo DOM Components were rejected for the HTML host: still
experimental with production-render bugs and per-instance WebView overhead.

### Link-spawn data flow

Click inside window → injected interceptor classifies the link →
`postMessage({type, lang, title, text})` to the canvas → handler resolves the
title → `wikipedia.getArticle()` (cache → proxy) → create node + edge in
`LocalStore` **immediately** (UI never blocks) → Skia renders the new window +
edge → (if signed in) debounced background sync pushes the change.

## 5. Repo and scaffolding plan

### Ported (infrastructure)

Supabase client (`src/lib/supabase.ts`), env (`src/lib/env.ts`), secure-store
adapter, providers (session, app-providers, i18n), `(auth)/*` +
`src/features/auth` (Google sign-in), app-shell chrome + `react-native-reusables`
primitives, theming (`global.css`, `tailwind.config.js`, `lib/theme.ts`,
color-scheme), build config (`app.config.ts`, `metro`/`babel`, `tsconfig`,
`netlify.toml`, `eas.json`, jest + playwright configs, coverage-ratchet script,
husky/eslint/prettier), and i18n scaffolding (keep `common`/`auth`/`errors`/
`navigation` namespaces; drop domain namespaces).

### Left behind (domain — never ported)

`app/(app)/modules`, `app/(app)/tools`, `src/features/{cbt,act,meditation,mood,
journal,gratitude,...}`, domain i18n/assets, all domain migrations.

### Structural changes

- **Auth optional**: remove the `ProtectedLayout` gate; sessions list + canvas
  are public; sign-in is an optional "enable sync" action reusing `(auth)`.
- **Drop field-level encryption** machinery entirely.
- **Branding + license**: rename across `app.config.ts`
  (name/slug/scheme/bundle), placeholder icon/splash/favicon, rewritten
  README/docs. Keep **AGPL-3.0** (derivative of an AGPL work) and satisfy the
  network-source clause with an in-app "Source code" link. Reset
  `coverage/baseline.json` to the new, smaller codebase.

### New structure

`src/features/{wikipedia,sessions,sync,canvas}`,
`supabase/functions/wiki-proxy/`, fresh `supabase/migrations/` from v1,
`app/(app)/index.tsx` → sessions list, `app/(app)/canvas/[sessionId].tsx` →
canvas.

## 6. Data model

### Supabase tables

RLS on all: `FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK
(auth.uid() = user_id)`. One timestamped migration matching the repo convention
(`YYYYMMDDHHMMSS_initial_wikicanvas.sql`).

- **session**: `id` uuid pk, `user_id` uuid null, `title` text,
  `viewport_x` real, `viewport_y` real, `viewport_zoom` real,
  `created_at` timestamptz, `updated_at` timestamptz, `deleted_at` timestamptz null.
- **node**: `id` uuid pk, `session_id` uuid fk → session (on delete cascade),
  `article_title` text, `lang` text, `x` real, `y` real, `width` real,
  `height` real, `parent_node_id` uuid null (null = root), `created_at` timestamptz.
- **edge**: `id` uuid pk, `session_id` uuid fk → session (on delete cascade),
  `source_node_id` uuid fk → node (on delete cascade), `target_node_id` uuid
  fk → node (on delete cascade), `clicked_link_text` text null,
  `created_at` timestamptz.

`deleted_at` on session is a soft-delete tombstone so deletes propagate across
devices under LWW instead of being resurrected by an older remote copy.

**`updated_at` is the LWW clock.** Any mutation of a session's nodes or edges
(spawn, drag, resize, edge add, soft-delete) bumps the parent
`session.updated_at`. Nodes/edges have no independent `updated_at` because the
session is the atomic sync unit (§9).

### Local store

A `LocalStore` interface with the **exact same row shape** so sync is a straight
upsert (no transform). Web → IndexedDB (via the small `idb` wrapper); native →
`expo-sqlite`. Collections/tables: `sessions`, `nodes`, `edges`,
`article_cache`. Anonymous data stored with `user_id = null`.

### Article cache

`article_cache` keyed by `lang:title`: `{ html, canonicalTitle, fetchedAt,
etag }`. 24h TTL with ETag revalidation. An in-memory in-flight `Map` de-dupes
concurrent requests for the same title.

## 7. Wikipedia integration

### Endpoint

`GET https://{lang}.wikipedia.org/w/rest.php/v1/page/{title}/with_html` → JSON
`{ title (canonical), key, html (Parsoid), license, ... }`. Chosen over bare
`/html` because canonical title + license arrive in one call (needed for
attribution + de-dupe).

### `wiki-proxy` Edge Function (Deno)

`GET /wiki-proxy?lang=en&title=…` plus a `search` mode. Responsibilities:

- Sets compliant `User-Agent` and `Api-User-Agent`:
  `WikiCanvas/1.0 (https://github.com/vasilyoshev/wikicanvas; vasil.yoshev@gmail.com)`.
- Forwards `ETag`/`If-None-Match` for 304 revalidation; passes through
  200/304/404; adds a short edge-cache header.
- Permissive CORS for our origins only; validates inputs (`lang` matches
  `^[a-z-]{2,12}$`, title length cap) to prevent SSRF/abuse.
- Politeness via client-side in-flight de-dupe + `article_cache` (rarely
  re-hits a cached title).

### Isolation + interception

- **Web**: `<iframe srcdoc sandbox="allow-scripts">` (no `allow-same-origin`).
  Injected into `srcdoc`: a `<base href="https://{lang}.wikipedia.org/">`, a
  width-constraining readable stylesheet, and the interceptor script.
- **Native**: `react-native-webview` with the same injected stylesheet +
  interceptor; `onMessage` ↔ `window.ReactNativeWebView.postMessage`.
- **Interceptor (identical logic both platforms)**: captures `a[href]` clicks,
  `preventDefault`, classifies the link, and posts up:
  article → `{type:'wikilink', lang, title, text}`;
  external → `{type:'external', href}` (parent opens new tab / `Linking.openURL`);
  in-page `#fragment` → scroll inside the frame, no spawn. Parent verifies the
  message source is that node's frame.
- **Tradeoff**: null-origin isolation is the strongest option and keeps
  interception working; Wikipedia's own JS widgets (collapsible infoboxes) are
  inert — acceptable for a read view; minimal CSS renders collapsibles expanded.

### Link classification & title resolution — `src/features/wikipedia/links.ts`

Pure module, **heavily unit-tested** (required tests).

- **Spawns an article node only if** the href resolves to a same-wiki
  `/wiki/{Title}` in the **main namespace** — excluding `File:`/`Special:`/
  `Help:`/`Talk:`/`Category:`/`Wikipedia:`/`Portal:`/`Template:`/`User:`/
  `Media:` (+ aliases), `action=edit`, `redlink=1`, interwiki/other-project,
  other-language, and bare `#fragment`.
- Returns a discriminated union: `{kind:'article', lang, title}` |
  `{kind:'external', href}` | `{kind:'ignore'}`.
- Normalizes: percent-decode, `_`→space, strip `#fragment`, handle Parsoid's
  `./` prefix; the API response's canonical `title` is the final authority.
- **De-dupe within a session**: if a node for the canonical title already
  exists, draw a new edge to it instead of spawning a duplicate.
- **v1 stays same-language within a session** (the `lang` column exists so
  cross-language is a clean future addition; interlanguage links do not spawn).

### Starting a session

`searchTitles(q)` → `/w/rest.php/v1/search/title?q=…&limit=10` through the proxy
for search-as-you-type; also accepts a pasted Wikipedia URL/title.

## 8. UI

### Article window (node)

- **Header chrome (always visible)**: Wikipedia mark · title · fullscreen
  toggle (`ti-maximize`) · close. The Wikipedia mark is tappable to the source.
- **Body**: rendered article HTML, scrollable inside the window.
- **Attribution**:
  - _Canvas card_: the tiny Wikipedia mark in the header (tappable to source) is
    the whole attribution on the card — no footer bar.
  - _Fullscreen_: a normal end-of-content footer names the license —
    `Content from Wikipedia, licensed CC BY-SA 4.0 · View original`.
  - Rationale: CC BY-SA requires attribution "in any reasonable manner based on
    the medium"; the card carries a source mark/link that travels with the
    content, and the full license is named in the reading view. (A persistent
    footer was considered and rejected as unnecessary visual weight; zero
    attribution on the card was rejected as non-compliant because the card
    displays the full article, not a thumbnail.)

### Canvas

- Pan: drag empty canvas. Zoom: scroll/pinch + `−/100%/+`, bounded min/max,
  plus fit-to-content.
- **Spawn placement**: new window to the right of its source, nudged down only
  as needed to avoid overlap; viewport gently **pans** (never auto-zooms) to
  bring it into view, with a brief "new" highlight.
- **Manipulation**: drag to rearrange, corner-resize, click to select +
  bring-to-front; positions/sizes persist to `node.x/y/width/height`.
- **Edges**: curved parent→child arrows; a window's edges highlight on
  hover/select.
- **Add article** (top bar): opens search-as-you-type to drop a new root window
  within the session.
- **Node virtualization**: only windows within (or near) the viewport mount
  their iframe/WebView; off-screen windows render as lightweight placeholders.

### Sessions list (home)

- Header: "Your sessions" + an optional **Sign in to sync** button.
- Grid of session cards: mini canvas-preview thumbnail, title, `N windows ·
edited …`, and a `⋯` menu (open / rename / delete).
- A **New session** card launches article search to pick a starting point.
- Empty/anonymous state works fully without login.

## 9. Sync — `src/features/sync`

- **Anonymous**: everything in `LocalStore` with `user_id = null`; nothing
  leaves the device.
- **On Google sign-in** (reuses `(auth)` flow):
  1. **Adopt** local anon sessions → stamp with the known `user_id`.
  2. **Upload** local sessions (+nodes+edges); **pull** remote sessions.
  3. **Merge — session-level LWW**: local-only → upload; remote-only →
     download; on both → newer `updated_at` wins wholesale (its nodes/edges
     replace the other's).
- **Ongoing (signed in)**: writes hit `LocalStore` instantly; a debounced
  background push upserts changed sessions; pull + merge on session open and on
  sign-in.
- **Deletes**: `session.deleted_at` soft-delete propagates via LWW.
- **`sync/merge.ts` is pure and fully unit-tested**: local-only, remote-only,
  local-newer, remote-newer, equal-timestamp tie-break (converge on remote),
  deleted-on-one-side.

## 10. Testing & build

- **Ratchet coverage from pure `.ts`**: `wikipedia/links.ts`, cache/de-dupe
  logic, `sync/merge.ts`, store↔row mapping, viewport math helpers. Keeps
  `npm run verify` (lint + format:check + typecheck + test:coverage +
  coverage:ratchet) green.
- **Canvas + screens (`.tsx`)**: Playwright e2e (web), not ratcheted — create a
  session, render a window from a **mocked `wiki-proxy` fixture** (CI never hits
  Wikipedia), click a link, assert a new window + edge.
- **Edge function**: unit-test the pure parts (input validation, URL building).
- **Native**: typecheck/build stays green; device-only behavior not in CI unit
  tests.
- Reset `coverage/baseline.json` after the initial scaffold.

## 11. Incremental build sequence

Each step ends by running typecheck/lint/tests and reporting status.

1. **Scaffold + rename** — port infra, omit domain, rebrand, make auth optional,
   green `verify`.
2. **Data model** — new Supabase project + migration; `LocalStore`
   (IndexedDB/SQLite) + types + repo; mapping tests.
3. **One static window** — `wiki-proxy` + wikipedia client (fetch/cache/de-dupe)
   - `links.ts` (+ full tests); render a single article window (iframe/WebView)
     with attribution. No canvas yet.
4. **Canvas** — Skia + gestures + reanimated: pan/zoom, viewport persistence,
   multiple windows, drag/resize. Web first, then verify native.
5. **Link-spawning + edges** — interceptor + postMessage both platforms, spawn
   placement, de-dupe, edges.
6. **Sessions list** — create/open/rename/delete, thumbnails, persistence.
7. **Auth-gated sync** — sign-in adoption + `merge.ts` (+ tests) + background
   push/pull.

## 12. Assumptions to confirm

- **User-Agent contact**: `vasil.yoshev@gmail.com` + repo URL
  `https://github.com/vasilyoshev/wikicanvas` (placeholder — adjust if the repo
  lands elsewhere).
- Bundle org `org.vasilyoshev.*` carried over from Selftend.

## 13. References (verified 2026-06-20)

- Wikimedia API deprecation (Core REST gradual deprecation from July 2026):
  https://wikitech.wikimedia.org/wiki/API_Portal/Deprecation
- MediaWiki REST API changelog: https://www.mediawiki.org/wiki/API:REST_API/Changelog
- CORS / cross-site requests: https://www.mediawiki.org/wiki/API:Cross-site_requests
- Expo DOM Components (rejected for HTML host): https://docs.expo.dev/guides/dom-components/
- react-native-skia web support: https://shopify.github.io/react-native-skia/docs/getting-started/web/
