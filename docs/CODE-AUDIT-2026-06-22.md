# WikiCanvas — Final Code-Quality Audit

## 1. Executive Summary

WikiCanvas is a polished, feature-complete, and unusually well-tested portfolio app: local-first sync, a Skia/gesture canvas, a sandboxed Wikipedia reader, and a clean provider/repository architecture, all backed by 431 passing unit tests, a Playwright e2e suite, a coverage ratchet, and a live migrated Supabase backend. The codebase shows strong discipline — atomic SQLite transactions, LWW sync semantics, deliberate untrusted-HTML containment, and an honest, well-maintained `FOLLOWUPS.md` that already tracks several known gaps. The findings below are dominated by two clusters: (a) a set of canvas/data-flow bugs where node geometry is read from a never-refreshed React Query snapshot, which actually breaks the headline drag/resize interaction and churns spawn state, and (b) per-frame performance amplification (local IndexedDB writes, React re-renders, Skia path parsing) on the pan/drag hot path. There is also a real Android WebView sandbox-escape and a genuine "signed-in users create anonymous, list-invisible sessions" data-scoping bug. None are catastrophic for a single-user portfolio deployment, but the canvas-interaction and sync-correctness items are worth fixing before any wider use.

**Counts by adjusted severity:** Critical 1 · High 9 · Medium 14 · Low 26 · Info 1 — **51 findings** (after de-duplication). _Static code-review findings only; the live-runtime finding R1 below is additional._

---

## 1b. Live functional test (Playwright) — runtime findings

The app was built as a real web export (`expo export`, cache-cleared) pointed at the **live hosted Supabase backend** (project `lhxixheyjoxujewybhgw`, deployed `wiki-proxy`) and driven end-to-end in a real Chromium via Playwright. This exercises paths the static audit and the jest/e2e suites cannot.

**What works (verified live, anonymous user):**

| Flow                                                                                                  | Result     |
| ----------------------------------------------------------------------------------------------------- | ---------- |
| Sessions list / empty state / "Source code" (AGPL) link                                               | ✅         |
| New-session dialog → **live Wikipedia search** (real results)                                         | ✅         |
| Create session → navigate to canvas                                                                   | ✅         |
| Article window renders **real Wikipedia HTML** (Octopus) in sandboxed iframe                          | ✅         |
| Iframe sandbox = `allow-scripts` only (no `allow-same-origin`)                                        | ✅ (good)  |
| Internal-link spawn → connected node + edge record; canonical-title redirect (Cephalopoda→Cephalopod) | ✅ (logic) |
| Zoom in/out/reset/fit (100%→120%→fit)                                                                 | ✅         |
| Fullscreen reading view + **CC BY-SA license attribution** footer                                     | ✅         |
| Persistence: create → list shows "2 windows · edited just now"                                        | ✅         |
| Reopen session → both nodes + edge restored from IndexedDB                                            | ✅         |
| `+not-found` route → "Page not found" + Home link                                                     | ✅         |

### R1. CanvasKit (Skia WASM) never loads on web — the entire `<Canvas>` layer is dead: edges and session thumbnails never render

- **Severity:** High (core feature broken on the shipped platform) · **Category:** bug / build-config · **Found:** runtime only
- **Location:** `app/_layout.tsx` (no Skia web bootstrap anywhere in the codebase); manifests in `src/features/canvas/CanvasBoard.tsx:228` `<Canvas>` and `src/features/sessions/SessionThumbnail.tsx`.
- **What's wrong:** `@shopify/react-native-skia` on web requires CanvasKit to be loaded **before** any `<Canvas>` renders — via `WithSkiaWeb` or `await LoadSkiaWeb()`. A repo-wide search finds **neither** (only the `setup:skia-web` script that copies the `.wasm`, plus docs). At runtime `window.CanvasKit` is `undefined`, the page **never even requests `canvaskit.wasm`** (it is present and served `200`, just never loaded), and every Skia draw throws `ReferenceError: CanvasKit is not defined` / `Cannot read properties of undefined (reading 'PictureRecorder')` — the console accrues 20+ such errors during normal use.
- **Why it matters:** The Skia layer draws the **edges** between article windows — the product's defining "draw a map of an exploration" feature — and the **session thumbnails** on the home screen. Both silently fail to paint on web (the deployed platform). Article windows survive only because they are DOM/iframe `View`s, not Skia. Confirmed visually: two connected windows render with **no connecting line**; session cards show **blank thumbnails**.
- **Why the test suite is green anyway:** the e2e suite is structurally blind to this. Edges are asserted via **invisible 0×0 DOM overlay** `View`s (`CanvasBoard.tsx:240-248`, testID `canvas-edge`) added _specifically so Playwright can count edges_ — never the actual Skia paint. Thumbnails/`CanvasBoard` have **no jest render tests** ("Skia can't render under jest", per `FOLLOWUPS.md`). So neither layer's _rendering_ is covered anywhere. This is the single most important reason to add at least one real visual/screenshot assertion.
- **Fix:** Bootstrap CanvasKit on web before rendering the canvas — wrap the app entry in `WithSkiaWeb`, or `await LoadSkiaWeb({ locateFile: () => '/canvaskit.wasm' })` in a web-only entry/provider with a fallback while it loads. Then add a screenshot/visual e2e that asserts an edge actually paints.
- **Relationship to C1/H-cluster:** independent of the drag/snapshot bug — even with CanvasKit fixed, the canvas-ui findings (C1, H5–H9) remain.

### R2. (Low) Non-unique testIDs across nodes

`article-window-fullscreen` and `article-window-source` are emitted with the **same** testID on every node, so a multi-node page has duplicate testIDs (Playwright strict-mode resolves to N elements). Per-node ids elsewhere (`canvas-node-<id>`) do this correctly. Suffix these with the node id.

### R3. (Low) Drag-handle layer intercepts header action-button clicks

The `canvas-node-drag-<id>` overlay sits above the window header and intercepts pointer events over the fullscreen/source buttons (Playwright reports the drag div "intercepts pointer events"; the buttons are only reachable programmatically). Worth confirming a real user can click the header buttons without starting a drag; constrain the drag hit-area to the title bar gutter.

> Note: I could not independently runtime-confirm the **C1 drag/resize** bug because the same drag-handle layer (R3) obstructs a clean scripted drag; C1 is code-verified in the audit and corroborated by the deliberately-weak e2e drag assertion (`x > 100` after a 120 px drag).

---

## 2. Critical & High Findings

### C1. Node drag/resize accumulates per-frame deltas against a never-refreshed snapshot — move/resize is effectively broken

- **Severity:** Critical · **Category:** bug / react-dataflow
- **Location:** `src/features/canvas/CanvasBoard.tsx:195-220` (with `src/features/canvas/CanvasNodeView.tsx:75-92`, `src/features/sync/queries.ts:127-140`)
- **What's wrong:** Pan `onChange` delivers _incremental_ per-frame deltas (`changeX`), so correct accumulation requires `n.x`/`n.y` to advance every frame. But `handleDragMove`/`handleResize` read the node from `nodeById`, derived from the React Query bundle, and `useUpdateNodeGeometry` deliberately neither invalidates `sessionKeys.bundle` nor optimistically updates it. Node geometry lives _only_ in the query (unlike viewport, which is mirrored in the store), so the snapshot is frozen for the whole gesture. Every frame writes `startX + thisFrameDelta` instead of accumulating; the node never tracks the pointer and persists ~one frame's delta.
- **Why it matters:** Moving/resizing a window is the headline canvas interaction and it is non-functional — windows don't follow the cursor and almost all displacement is lost on commit. The e2e masks it: it drags 120px in 8 steps but only asserts `x > 100`, so a ~15px leftover passes (`canvas.e2e.test.ts:99-124`).
- **Fix:** Hold live drag/resize geometry in the canvas store during the gesture and render from it (committing to the repo on `onEnd`), **or** have `useUpdateNodeGeometry.onMutate` optimistically `setQueryData(sessionKeys.bundle(...))` so `nodeById` advances per frame. Either way, persist once on gesture end. (This finding and the separately-reported "stale base" item are the **same defect**.)
- **Tag:** [NEW]

### H1. `pushBundle` replaces remote children non-transactionally — a mid-sequence failure leaves a corrupt bundle that propagates loss across devices

- **Severity:** High · **Category:** sync-correctness
- **Location:** `src/features/sync/remote.ts:70-92`
- **What's wrong:** `pushBundle` issues five independent awaited calls with no transaction/RPC: upsert session (clock advances first), delete edges, delete nodes, upsert nodes, upsert edges. A failure after the first delete (network drop, 5xx, tab close) leaves the remote session present with a bumped clock but its children truncated. The next `fetchRemoteBundles` sees a "newer" remote, and `applyMergeResult`→`store.replaceBundle` overwrites the local copy with the truncated remote, wiping nodes/edges on the user's other devices. Errors are best-effort-swallowed by `runPush` (`orchestrator.ts:54-62`).
- **Why it matters:** Propagating data loss on a normal code path with no user-facing signal. (The window only opens on a failure _between_ the first delete and final upsert — not every save — but the blast radius is cross-device.)
- **Fix:** Make the remote replace atomic via a Postgres RPC (`client.rpc`) that commits/rolls back as a unit. Do not advance state or leave a half-deleted server on partial failure.
- **Tag:** [NEW] (related to but distinct from the tracked open-merge race, which is about a _local_ CAS, not remote atomicity)

### H2. IndexedDB `replaceBundle` is non-atomic despite a documented "atomic" contract — web sync download can corrupt the local bundle

- **Severity:** High · **Category:** sync-correctness
- **Location:** `src/lib/local-store/indexeddb-store.ts:139-146`
- **What's wrong:** Web `replaceBundle` runs `deleteNodes`→`deleteEdges`→`upsertSession`→per-node puts→per-edge puts as separate auto-committing idb transactions. A crash/tab-close/put-rejection between the child deletes and re-inserts leaves the session row present with truncated/empty children and no rollback. SQLite wraps the identical logic in `withTransactionAsync` (`sqlite-store.ts:190-200`); the interface JSDoc (`types.ts:39`) and test name (`indexeddb-store.test.ts:103`) both assert atomicity the web path lacks.
- **Why it matters:** `replaceBundle` is the wholesale-download path (`apply.ts:18`). Because nodes/edges have no independent `updated_at`, the corrupted bundle becomes the next LWW local state and can be pushed, propagating loss — on web, the proven primary platform. (The two separately-filed reports of this are the **same defect**.)
- **Fix:** Wrap the body in one `db.transaction([STORE_SESSIONS, STORE_NODES, STORE_EDGES], 'readwrite')` + `tx.done` so the browser rolls back on any failure.
- **Tag:** [NEW]

### H3. Signed-in users create anonymous (unsynced, list-invisible) sessions

- **Severity:** High · **Category:** sync-correctness
- **Location:** `src/features/sessions/queries.ts:63-79` (line 71)
- **What's wrong:** `useCreateSession` never reads the auth user; its `mutationFn` calls `createSession(null, ...)` unconditionally, so every new session is persisted with `user_id = null` even when signed in. The user-scoped `useSessionsList(user.id)` then **excludes** the new card on refetch (it vanishes after `onSuccess` invalidates `sessionKeys.all`), and background sync pushes a `null`-owner row that owner-scoped RLS rejects, so it never round-trips. Navigation works only because `useSessionBundle` fetches by id, masking the bug.
- **Why it matters:** The core "create a session while signed in" flow silently produces a session missing from the user's own list and never synced cross-device — the headline value for signed-in users.
- **Fix:** Make the hook owner-aware: `const { user } = useSession();` and pass `user?.id ?? null` into `createSession`. Add a hook test asserting the signed-in id is used.
- **Tag:** [NEW]

### H4. Native WebView navigation guard allows all top-frame navigations on Android (sandbox escape)

- **Severity:** High · **Category:** security
- **Location:** `src/features/wikipedia/ArticleHtml.native.tsx:34-42`
- **What's wrong:** `shouldStartLoad` allows a request when `isTopFrame && (url==='about:blank' || url==='about:srcdoc' || mainDocumentURL == null)`. `mainDocumentURL` is iOS-only — Android never populates it, so `mainDocumentURL == null` is always true and `isTopFrame` is hardcoded true on Android. The guard therefore returns true for **any** top-frame URL, including arbitrary `https://`. Untrusted article script doing `window.location = 'https://evil…'` (or `<meta refresh>`/form submit) navigates the WebView to live external content, defeating the documented containment and `originWhitelist={['about:*']}`.
- **Why it matters:** On Android the sandbox is bypassable, turning the reader into an in-app browser pointed at attacker-controlled content. iOS is unaffected.
- **Fix:** Gate strictly on scheme: allow only when `url.startsWith('about:')`; never allow non-`about:` URLs regardless of `mainDocumentURL`. Consider `setSupportMultipleWindows={false}` + `onOpenWindow` block.
- **Tag:** [NEW] (the tracked "link scheme allowlist" item covers `Linking.openURL`, a different sink)

### H5. Hydration effect's `reset()` on every bundle refetch wipes new-node highlight, z-order, and can clobber pan-to-reveal

- **Severity:** High · **Category:** react-correctness
- **Location:** `src/features/canvas/CanvasScreen.tsx:60-70`
- **What's wrong:** The hydrate effect's cleanup is `reset()` and it depends on `[bundle, …]`. `addNode`/`addEdge` invalidate `sessionKeys.bundle`, so every spawn yields a new `bundle` reference → `reset()` (zeroes viewport, `nodeOrder`, `selectedNodeId`, `newNodeIds`) → re-hydrate from persisted session. Because spawn flows call `bringToFront`/`markNew`/`onPanToReveal` synchronously _after_ the awaited mutation, the later refetch wipes the just-set highlight and z-order (deterministically), and re-applies the persisted viewport (racing pan-to-reveal, which doesn't invalidate the bundle). Also clears selection on any add. (The two reports of this — H5 and the "store-hydration reset" medium — overlap; consolidated here at High.)
- **Why it matters:** The signature link-spawn flow loses its new-node highlight and front z-order on every spawn and can snap the viewport back.
- **Fix:** Hydrate viewport/`nodeOrder` once per `sessionId` (ref/key guard), reconcile `nodeOrder` additively, and move `reset()` to `sessionId`-change/unmount rather than every `bundle` identity change.
- **Tag:** [NEW]

### H6. Viewport & node geometry write to IndexedDB on every pan/pinch/drag frame (no debounce)

- **Severity:** High · **Category:** performance
- **Location:** `src/features/canvas/CanvasBoard.tsx:62-99`
- **What's wrong:** `commitViewport` fires `updateViewport.mutate` every `onChange` frame; drag fires `updateNodeGeometry.mutate` every frame. Each viewport write does `requireSession` + `bumpSession` (read-modify-write); each geometry write additionally does `listNodes` (reads **all** nodes) + `upsertNode` + a second session write. No debounce exists despite the e2e comment claiming geometry is debounced. The remote push _is_ debounced 1500ms, but the local DB is not.
- **Why it matters:** ~60 IndexedDB transactions/sec during a gesture, each O(nodes) on drag, contending the single idb connection and the JS thread exactly when smoothness matters.
- **Fix:** Persist on `onEnd` and/or trailing-debounce (~150–300ms) while keeping the in-memory store update per frame; look up the single node directly instead of `listNodes`. (Same root cause as H7 below; fix together.)
- **Tag:** [NEW]

### H7. `updateNodeGeometry` writes the whole session to IndexedDB every gesture frame (O(nodes) read + 2 writes)

- **Severity:** High · **Category:** performance
- **Location:** `src/features/sessions/local-repository.ts:147-159`
- **What's wrong:** Per drag/resize frame: `getSession` + `listNodes` (all nodes) + `Array.find` + `upsertNode` + `bumpSession` (second session write) — 3–4 idb transactions on the single connection, plus `syncBus.notify`. (This is the repository-layer view of the same hot path as H6.)
- **Why it matters:** O(nodes) reads + 2 writes per frame starve the UI thread during the latency-sensitive interaction.
- **Fix:** Keep drag state in the store, persist on `onEnd`; pass the known node (`CanvasBoard` already has `nodeById`) instead of `listNodes`; drop the redundant second session write.
- **Tag:** [NEW]

### H8. Article windows (`CanvasNodeView`/`ArticleWindow`/`ArticleHtml`) re-render on every pan/pinch frame — none memoized

- **Severity:** High · **Category:** react-correctness / performance
- **Location:** `src/features/canvas/CanvasNodeView.tsx:41-167`
- **What's wrong:** `CanvasBoard` subscribes to viewport and passes a fresh viewport object plus per-node props to every `CanvasNodeView` each frame; none of `CanvasNodeView`/`ArticleWindow`/`ArticleHtml` are `React.memo`. The whole window subtree (header chrome, buttons, gesture detectors, iframe host) reconciles every frame for every window, including off-screen placeholders. Only `srcDoc` (memoized on `[html,lang]`) survives.
- **Why it matters:** The dominant wasted-render cost during the most common interaction; jank scales with window count.
- **Fix:** `React.memo` the window components and move the per-node screen transform off the React render path via a Reanimated `useAnimatedStyle` driven by a shared viewport value, so panning updates transforms on the UI thread.
- **Tag:** [NEW]

---

## 3. Medium Findings

| #   | Title                                                                                                                      | Location                                                                          | Fix                                                                                                             | Tag                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| M1  | `syncSessionOnOpen` downloads the user's entire remote dataset, then keeps one session                                     | `src/features/sync/orchestrator.ts:32-41` (+`remote.ts:18-54`)                    | Add `fetchRemoteBundle(userId, sessionId)` with `.eq('id', sessionId)` / `.in('session_id',[sessionId])`        | [NEW]                                                     |
| M2  | Auth/open-merge effects keyed on `user` object re-run full merge on every token refresh                                    | `use-sync.ts:85-98`, `CanvasScreen.tsx:126-135`                                   | Depend on `user?.id` (or gate `setSession` on id/token change)                                                  | [NEW]                                                     |
| M3  | Sessions list has no error state — load failures masked as "No sessions yet"                                               | `SessionsListScreen.tsx:32, 107-142`                                              | Destructure `isError/error/refetch`; render error+Retry before empty branch                                     | [NEW]                                                     |
| M4  | `createSession` rejection in `handlePick` is an unhandled rejection, no feedback (inconsistent with rename/delete)         | `SessionsListScreen.tsx:56-63`                                                    | try/catch in `handlePick`; keep modal open + inline error; guard navigation on success                          | [NEW]                                                     |
| M5  | Article fetch failures render an indistinguishable placeholder — no error UI or retry                                      | `CanvasScreen.tsx:73-87` (+`CanvasNodeView.tsx:139-156`)                          | Thread `isError/isLoading/refetch` into `CanvasNodeView`; render distinct error+retry                           | [NEW]                                                     |
| M6  | Link-click spawn & add-article flows swallow `getArticle` rejections                                                       | `use-link-spawn.ts:36-50`, `CanvasScreen.tsx:139-180`                             | Wrap `getArticle`+mutations in try/catch; surface toast/inline error + log                                      | [NEW]                                                     |
| M7  | Spawn de-dupe/placement read a stale node snapshot — concurrent clicks duplicate nodes / overlap windows                   | `use-link-spawn.ts:36-104` (no guard in `addNode`, `local-repository.ts:121-132`) | Read freshest nodes at mutation time; in-flight guard by `canonicalTitle+lang`; uniqueness guard in `addNode`   | [NEW]                                                     |
| M8  | Icon-only zoom controls have no accessible name                                                                            | `ZoomControls.tsx:21-32`                                                          | Add `accessibilityLabel` ("Zoom in/out", "Fit to content"); also label drag/resize handles                      | [NEW]                                                     |
| M9  | `CanvasEdgeView` rebuilds & reparses a Skia `Path` from an SVG string every frame                                          | `CanvasEdgeView.tsx:16-27`                                                        | `useMemo(() => Skia.Path.MakeFromSVGString(...), [source,target])`; better, drive via shared viewport value     | [NEW]                                                     |
| M10 | wiki-proxy `verify_jwt=false` not committed to `config.toml`; clean deploy defaults to JWT-required → 401s anonymous fetch | `supabase/config.toml:1`                                                          | Add `[functions.wiki-proxy]\nverify_jwt = false` so the no-auth contract is declarative                         | [NEW]                                                     |
| M11 | No CI pipeline despite Playwright/Supabase config written for one (`CI` branches are dead)                                 | `.github/workflows` (absent)                                                      | Add GitHub Actions running `npm ci && npm run verify` + `npm run test:e2e` (Node 20.19)                         | [NEW]                                                     |
| M12 | `babel-preset-expo ^56` pinned while Expo SDK is 54 — preset two majors ahead                                              | `package.json:91`                                                                 | Align via `npx expo install babel-preset-expo` (SDK-matched ~54.x), or upgrade the whole SDK                    | [NEW]                                                     |
| M13 | External in-article `href` reaches `Linking.openURL` with no scheme allowlist (native deep-link/scheme injection)          | `use-link-spawn.ts:38-41` (`interceptor.ts:42-62`, `messages.ts:36-37,62-63`)     | URL-parse + `http/https` allowlist before `openURL`; reject non-http(s) at the message boundary                 | **[ALREADY-TRACKED]** (FOLLOWUPS "Link scheme allowlist") |
| M14 | Every viewport pan schedules a full delete-and-reinsert of all child rows to Supabase                                      | `src/features/sync/remote.ts:70-92`                                               | Make `pushBundle` diff-aware: session-only upsert when only viewport changed; skip child replace when unchanged | [NEW]                                                     |

---

## 4. Low / Informational & Tech-Debt

**Sync correctness (bounded, low-likelihood):**

- Equal-ms `updatedAt` tie-break unconditionally prefers remote, can resurrect a local soft-delete — `merge.ts:37-43`. Prefer tombstone-wins + stable secondary tiebreak. **[NEW]**
- `scheduleBackgroundPush` captures an unused `userId`; queued push can fire post-sign-out and silently 401 — `orchestrator.ts:45-77`. Remove the field or guard the push by captured user. (Sign-out flush window overlaps the tracked `flushPendingPushes` item.) **[partially ALREADY-TRACKED]**
- `deleteSessionDeep` non-atomic on web — can orphan node/edge rows (never GC'd) — `indexeddb-store.ts:92-97`. Wrap in one cross-store transaction. **[NEW]**
- `adoptAnonymousSessions` mutates synced `user_id` without bumping the LWW clock, and the batch is non-transactional — `indexeddb-store.ts:157-164`, `sqlite-store.ts:239-246`. **[NEW]**
- `useAddEdge` bumps `updatedAt` but never invalidates `sessionKeys.all`, so edge-only spawns leave a stale "edited Xm ago" label — `queries.ts:158-171`. **[NEW]**

**Local-store robustness / tech-debt:**

- IndexedDB upgrade handler ignores `oldVersion`; bumping `DB_VERSION` will throw `ConstraintError` and brick existing web users (latent; version still 1) — `indexeddb-store.ts:42-54`. **[NEW]**
- `by_target`/`target_node_id` index declared in schema but never created on either store (dead-but-misleading) — `schema.ts:16`. **[NEW]**
- `sessionRowToDomain` re-parses timestamps with `new Date(...).toISOString()`, which throws on any malformed value; node/edge mappers don't normalize — a poison row breaks the whole read path — `row-mapping.ts:50-62`. **[NEW]**

**Wikipedia/sandbox:**

- Article cache keyed only on requested title — redirect targets re-fetch and store duplicate rows — `client.ts:66-121`. **[ALREADY-TRACKED]** (FOLLOWUPS "Article cache key by canonical title")
- `external` messages opened via `Linking.openURL` with no scheme allowlist (parent-side defense-in-depth) — `use-link-spawn.ts:38-41`. **[ALREADY-TRACKED]** (same as M13)
- `buildSrcDoc` injects via `String.replace` replacement strings — latent `$`-special-pattern corruption hazard — `sandbox-html.ts:63-68`. Use a replacer function. **[NEW]**

**Canvas UX/tech-debt:**

- "New" node emerald highlight never cleared — `clearNew` is dead code (callers only in tests); highlight is wiped only accidentally via `reset()` — `use-canvas-store.ts:13-14, 72-78`. (Three filed reports of this are the **same defect**.) **[NEW]**
- New-session search hardcoded to English regardless of pasted-URL language — `NewSessionSearch.tsx:12, 32-52`. **[NEW]**
- `computeContentBounds` computed every render only to satisfy `void` — dead per-frame O(nodes) work — `CanvasBoard.tsx:188-191`. **[NEW]**
- Drag/resize `Gesture` objects rebuilt every render (no `useMemo`), unlike `CanvasBoard`'s memoized gestures — `CanvasNodeView.tsx:69-96`. (Two reports; same defect.) **[NEW]**
- `CanvasScreen` passes a fresh inline `onMessage` closure each render, churning `ArticleHtml`'s message-listener effect — `CanvasScreen.tsx:214-217`. Wrap in `useCallback`. **[NEW]**
- `AddArticleSearch` fires an un-debounced network search per keystroke; sibling `NewSessionSearch` does it right (250ms + length≥2) — `AddArticleSearch.tsx:30-43`. (Two reports; same defect.) **[NEW]**

**Auth/tech-debt:**

- Dead code `run-google-sign-in.ts` — a second, divergent sign-in implementation — `src/features/auth/run-google-sign-in.ts:1-34`. **[ALREADY-TRACKED]**
- Unreachable `app/(auth)/sign-up.tsx` duplicates the inline sign-in, reached only by its own test — `1-31`. **[ALREADY-TRACKED]**
- Auth-callback "Retry" button doesn't retry — it `router.replace('/(app)')` (dismiss) — `auth-callback-screen.tsx:39-48`. **[NEW]**
- `completeAuthRedirect` ignores the bare OAuth `error` param (e.g. `access_denied`), surfacing a generic "missing parameters" message — `callback.ts:63-81`. **[NEW]**

**Infra/shared tech-debt:**

- Tint tokens (`act/be/think/aqua/iris/ink/clay/mist`) reference CSS vars defined nowhere; only `primary` works — `design-tokens.ts:1-25`. **[NEW]**
- `I18nProvider` language-switching machinery + entire `bg` locale unreachable (no switcher); `hydrated` field dead — `i18n-provider.tsx:29-81`. **[NEW]**
- `AppErrorBoundary` nested inside `AppProviders`, so a provider render crash is uncaught — `app/_layout.tsx:20-37`. **[NEW]**
- Env validation only logs (no zod schema, no fail-fast, runs in a mount effect) — `src/lib/env.ts:20-38`. **[NEW]**
- `theme-store.setPreference` is an unwired writer; unguarded async `hydrate` can clobber a future user choice — `theme-store.ts:18-30`. **[NEW]**
- `n+1` IndexedDB reads in `listSessions` (one `listNodes` per session) on the home screen — `local-repository.ts:30-46`. Read all nodes once + group in memory. **[NEW]**
- `jest.integration.config.js` orphaned — no script, no `test/integration` dir, no CI — `1-13`. **[NEW]**
- `npm start` hard-fails on fresh clone: `--env-file=.env.local` (gitignored, no example) — `package.json:10`. Add `.env.local.example` + `--env-file-if-exists`. **[NEW]**
- `scripts/lib/ports.js` dead scaffolding (header references non-existent files; `SELFTEND_*` env prefix from another project) — `1-59`. **[NEW]**
- wiki-proxy CORS hardcodes localhost origins into prod and silently disables prod CORS when `PUBLIC_APP_URL` unset — `supabase/functions/wiki-proxy/index.ts:12-29`. **[ALREADY-TRACKED]** (FOLLOWUPS operational note)

**Informational:**

- `SessionProvider` context value not memoized (unlike `I18nProvider`) — currently harmless, brittle against future parent re-renders — `session-provider.tsx:66-73`. **[NEW]**

---

## 5. Themes & Recommendations (priority order)

1. **Fix the canvas data-flow root cause (C1, H5, H6/H7, H8, plus M7 and the "new highlight" items).** Node geometry being read from a never-refreshed React Query snapshot is the single highest-leverage area: it breaks drag/resize outright (C1), and the same "render from query, mutate without optimistic update / re-hydrate on every refetch" pattern drives the highlight/z-order wipe (H5), per-frame DB write amplification (H6/H7), and the unmemoized re-render storm (H8). Move live canvas state (geometry, viewport already there, selection, new-highlight) into the Zustand store as the render source, persist on gesture end, and hydrate the store once per `sessionId`. This one architectural change resolves a cluster of Critical/High items at once.

2. **Make the sync replace paths atomic (H1, H2; related M14, deleteSessionDeep).** Wrap web `replaceBundle`/`deleteSessionDeep` in single multi-store idb transactions to match SQLite, and replace `pushBundle`'s five-call wholesale teardown with a transactional RPC (and/or make it diff-aware). These remove the propagating-data-loss failure modes — the only findings that can corrupt data across devices.

3. **Fix the signed-in session-scoping bug (H3) and add user-facing error states (M3–M6).** Make `useCreateSession` owner-aware so signed-in creation actually works and syncs, and surface load/fetch/mutation failures (sessions list, article windows, link-spawn) instead of masking them as empty/placeholder/silent no-ops — important for trust in a local-first app.

4. **Close the Android sandbox escape (H4) and land the tracked native scheme allowlist (M13).** Gate `shouldStartLoad` strictly on the `about:` scheme and add the `http(s)`-only allowlist before `Linking.openURL`. Both are small, well-scoped security hardening on the untrusted-HTML boundary.

5. **Make the backend/build reproducible (M10, M11, M12).** Commit `verify_jwt=false` to `config.toml`, add a CI workflow running `verify` + `e2e` (which would also have caught the config gap), and realign `babel-preset-expo` with the Expo SDK. This converts "works on the maintainer's machine" into a guaranteed clean-checkout state.

6. **Sweep the deferred-but-cheap cleanup (Low/tech-debt).** Prioritize the IndexedDB upgrade-handler migration path (latent bricking), the timestamp-parse poison-row hazard, and removing the dead/divergent code already in FOLLOWUPS (`run-google-sign-in.ts`, `sign-up.tsx`, `ports.js`, orphaned integration config). These are low-risk, reduce reader confusion, and shrink the surface that future changes can trip over.
