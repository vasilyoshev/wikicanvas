# WikiCanvas v1 — Follow-ups

WikiCanvas v1 is feature-complete: all 102 planned tasks done, `npm run verify`
green (lint 0 warnings, format, typecheck, 431 unit tests, coverage ratchet
~81.7% lines), 10 Playwright e2e green. The Supabase project is live + migrated
(security advisor clean) and the `wiki-proxy` edge function is deployed.

The final whole-branch review's blocking findings (the `updated_at` LWW-clock
trigger defect and the mixed-timestamp merge comparison) and all four
should-fix-soon items (open-merge query invalidation, push-flush on
tab-close/backgrounding, in-app sign-out, removal of the article-preview
scaffold) have been **fixed and verified**.

The items below are the deliberately-deferred follow-ups, none merge-blocking at
personal/portfolio scale. Listed roughly by priority.

## Before any native (iOS/Android) release

- **Native device smoke test.** Native compiles and typechecks, but the app has
  never run on a device or emulator. The Skia canvas (CanvasKit), the
  `react-native-webview` article host, gesture-handler pan/zoom/drag, and the
  native sync/AppState paths are all web-proven only. Run a real-device smoke
  test of: open a session, render an article window, click a link to spawn,
  pan/zoom/drag, fullscreen, sign in + sync. (Web is fully proven via e2e.)

## Before any high-traffic / public promotion

- **`wiki-proxy` rate limiting + edge cache.** The edge function is a public,
  unauthenticated relay (`verify_jwt=false`, by design for no-login use). It has
  no SSRF/data/secret exposure (lang validated, title/q encoded, upstream locked
  to Wikipedia REST, no Supabase data path), but no per-IP rate limit or
  persistent cache. At hobby scale this is fine; before promotion add an edge
  cache keyed on `(lang, mode, title|q, limit)` and a per-IP token bucket
  returning 429, to avoid free-tier egress burn and Wikimedia throttling the
  maintainer User-Agent.

## Correctness / robustness (low-likelihood, bounded)

- **Background-push ↔ open-merge race.** No per-session mutex/CAS between the
  merge's local read and `replaceBundle`; a local edit made during a
  multi-device-conflict-while-editing window can be lost (bounded to one edit, no
  cascade). Add a CAS on `updatedAt` in `applyMergeResult` (re-read local before
  replace; if local advanced, keep local + schedule push) or a per-session async
  mutex shared by mutations and `applyMergeResult`.
- **`flushPendingPushes` doesn't await in-flight pushes.** A push whose debounce
  timer already fired is untracked, so flush can report a clean drain while a
  push is mid round-trip during sign-out. Self-heals via the next sign-in LWW
  merge. Track in-flight push promises and await them in `flushPendingPushes`.

## Security hardening (defense-in-depth; currently neutralized)

- **Link scheme allowlist.** An untrusted in-article `href` flows to
  `Linking.openURL` with no scheme allowlist (`javascript:`/`data:`/`file:`/
  custom). Neutralized on web (sandboxed iframe, no `allow-same-origin`/popups)
  and gated on native by Wikipedia Parsoid sanitization. Add an
  `/^(https?|mailto):/i` allowlist at the sink (and ideally at the `messages.ts`
  boundary) as defense-in-depth.

## Cleanup / maintainability

- **Dead code:** `src/features/auth/run-google-sign-in.ts` (`runGoogleSignIn`) is
  unreferenced and encodes a native post-sign-in `router.replace` the live
  `runSyncSignIn` doesn't perform — delete, or fold any needed native nav into
  `runSyncSignIn`. `app/(auth)/sign-up.tsx` is unreachable in-app and duplicates
  the inline sign-in (the `(auth)` group itself is live — `auth-callback.tsx` is
  the OAuth redirect target) — delete it + its test, or give it a real entry.
- **`ArticleWindow.onClose`** is implemented + tested in the leaf but never wired
  on the canvas, and no single-node delete primitive exists (node-delete is
  deferred per spec §2). Either remove the prop/close-button, or finish the
  delete stack (LocalStore `deleteNode` → repo → `useDeleteNode` → sync
  propagation under session-level LWW).
- **Article cache key by canonical title.** `getArticle` keys the cache on the
  requested title, so redirects/aliases double-fetch and double-store (correct,
  just wasteful). Key on the canonical title returned by the proxy.
- **Classifier cross-consistency test.** `links.ts` `classifyLink` (parent) and
  `interceptor.ts` `__wcClassify` (injected sandbox string) are two
  hand-maintained copies of the link-classification logic with no test pinning
  them in sync — drift risk. Add a test asserting both agree on a shared fixture
  set (especially the `wikilink`/`article` spawn-or-not boundary).

## Known testing gaps (accepted)

- `SessionCard`, `SessionThumbnail`, `ZoomControls`, `CanvasBoard` `.tsx` have no
  jest render tests (Skia/CanvasKit can't render under jest-expo); they are
  covered by the Playwright e2e suite instead.

## Operational notes

- Set the `PUBLIC_APP_URL` env var on the deployed `wiki-proxy` edge function
  (its CORS allowlist) before serving the production web origin; localhost
  origins are already allowed for dev/e2e.
- `.env` (gitignored) holds the public Supabase URL + publishable key for project
  ref `lhxixheyjoxujewybhgw`.
