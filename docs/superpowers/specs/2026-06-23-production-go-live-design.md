# WikiCanvas — Production Go-Live Design

- **Date:** 2026-06-23
- **Status:** Approved design (pre-implementation)
- **Scope:** Take WikiCanvas to production: finalize the live Supabase project, enable Google SSO, deploy the web app to Netlify (full production), and ship Android to the Google Play **internal testing** track. Produce a single ordered runbook for the steps only the owner can perform.
- **Companion plan:** to be written via `writing-plans` after this spec is approved.

---

## 1. Context & current state

WikiCanvas is an Expo (`expo-router`) + React Native Web app with a Supabase backend. Most of the production scaffolding already exists; this effort is a **go-live runbook**, not new feature work.

Already in place (verified):

- **Supabase project** `wikicanvas` (ref `lhxixheyjoxujewybhgw`, eu-central-1) — `ACTIVE_HEALTHY`, Postgres 17.6. Security advisor **clean** (0 lints). RLS + policies present.
- **`wiki-proxy` edge function** — deployed (v2, `ACTIVE`, `verify_jwt=false`). CORS allowlist = `[PUBLIC_APP_URL, http://localhost:8081, http://localhost:8099]`.
- **Google sign-in** — already coded: `supabase.auth.signInWithOAuth({ provider: "google", … })`, `flowType: "pkce"`, `detectSessionInUrl: false`. Web uses `redirectTo = <PUBLIC_APP_URL>/auth-callback`; native opens the Supabase `/authorize` URL in `expo-web-browser` and returns to the deep link `wikicanvas://auth-callback`. **No** native Google Sign-In SDK / `signInWithIdToken` anywhere.
- **`netlify.toml`** — builds `npm run export:web` → `dist/`, Node 20.19.0, SPA rewrite `/* → /index.html 200`.
- **`public/_headers`** — currently only `/canvaskit.wasm → Content-Type: application/wasm`.
- **`eas.json`** — production profile builds an Android **app-bundle (AAB)**, `autoIncrement`, `appVersionSource: remote`; submit profile currently targets track `"alpha"`, `releaseStatus "draft"`.
- **`app.config.ts`** — dynamic config; reads `EXPO_PUBLIC_EAS_PROJECT_ID` into `extra.eas.projectId`; throws for `preview`/`production` EAS builds if `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are missing.
- **CI** — `.github/workflows/ci.yml` runs verify + Playwright e2e on push/PR.

### Decisions (from brainstorming)

1. **Android scope:** web → full production; Android → Google Play **internal testing** track (not public production) so we get a real installable build for the device smoke test that `FOLLOWUPS.md` flags as outstanding.
2. **Web host/domain:** Netlify; assumed origin **`https://wikicanvas.netlify.app`** (subdomain claimed at site creation). Every occurrence is flagged so a later custom-domain swap is mechanical.
3. **Prod Supabase interaction:** the agent may inspect/verify via MCP freely; any prod-mutating MCP call is shown and confirmed first.
4. **CI/CD depth:** Netlify↔GitHub auto-deploy for web (push to `master` + PR previews); Android stays manual `eas build` / `eas submit`.

### Non-goals

- iOS / App Store (deferred).
- Public Play production rollout (deferred until after the device smoke test).
- `wiki-proxy` rate-limiting/edge-cache and other `FOLLOWUPS.md` hardening (tracked separately; not go-live blockers).
- New product features.

---

## 2. Verified facts that shape the design

These were confirmed by a background verification pass (6 research agents + 3 adversarial verifiers) against official docs and, for auth/CSP, the actual repo + exported bundle. Uncertainties are carried into §8.

- **One Google OAuth client is enough (CONFIRMED).** A single **Web application** OAuth client whose _only_ Authorized redirect URI is the Supabase callback `https://lhxixheyjoxujewybhgw.supabase.co/auth/v1/callback` serves **both** web and native, because both routes go through Supabase's hosted callback. **No Android OAuth client and no SHA-1 fingerprint** are required (those are only for the native Google Sign-In SDK path, which this app does not use). The app's own callbacks (`https://wikicanvas.netlify.app/auth-callback`, `wikicanvas://auth-callback`) belong in **Supabase's** redirect allowlist, _not_ in Google.
- **Supabase edge-function secret needs no redeploy (CONFIRMED).** Setting `PUBLIC_APP_URL` (dashboard or `supabase secrets set … --project-ref`) is picked up by the next `wiki-proxy` invocation via `Deno.env.get`; a redeploy is only needed for code changes. (Corrects an earlier assumption that a redeploy was required.)
- **CSP correction (the important one).** The naïve `script-src 'self' 'wasm-unsafe-eval'` **breaks the app**. Verified against the exported bundle + `ArticleHtml.tsx`/`sandbox-html.ts`, `script-src` must also include:
  - `'unsafe-eval'` — Metro's web async-bundle loader runs `eval(body)` to load the split chunk the app actually ships.
  - `'unsafe-inline'` — the article reader is `<iframe srcDoc sandbox="allow-scripts">`; a `srcdoc` document **inherits and enforces the parent page's CSP** (CSP3), so the inline interceptor/theme scripts inside every article are silently blocked without it (app shell still loads → easy to miss).
  - `connect-src` must include **`wss://`** for Supabase (Realtime) defensively, not just `https://`.
- **Play internal track is low-friction (CONFIRMED, with one hard gotcha).** App-content declarations (Data safety, Content rating, Target audience) are **not hard blockers** for an internal-only release; an internal app can roll out "not fully configured." **But the very first AAB MUST be uploaded manually** in the Play Console web UI — the Play Publishing API (and thus `eas submit`) cannot create the first release. After that one manual upload, `eas submit` works for every later internal release. A **privacy policy** is needed in practice because the app collects account data via Google sign-in.
- **EAS + dynamic config.** Because `app.config.ts` is dynamic, `eas init` will **not** auto-write `extra.eas.projectId`; the app already reads `EXPO_PUBLIC_EAS_PROJECT_ID`, so that UUID is set as an **EAS environment variable** (not hardcoded). The three `EXPO_PUBLIC_*` build vars must exist in the EAS **production** (and likely **preview**) environments, at `plaintext` visibility (marking an `EXPO_PUBLIC_*` var "secret" makes it empty in the bundle).
- **Migration-ledger drift (pre-existing, non-blocking).** Prod records 3 migrations (`…_initial_wikicanvas`, `…_owns_session_security_invoker`, `…_drop_session_updated_at_trigger`) with **different version timestamps** than the repo's 2 files, and `owns_session_security_invoker` is folded inline into the local initial file rather than existing as its own file. **Schema is functionally correct and advisor-clean, and go-live needs no new migration** (Google auth uses built-in `auth.users`). The ledger should be reconciled (`supabase migration repair`) before the _next_ schema change so `db push --linked` stays predictable — documented, not done here.

---

## 3. Architecture: six workstreams

Each row maps to a section of the runbook. **[me]** = automatable + verifiable in-repo / via MCP; **[you]** = console/legal/payment steps only the owner can do.

| #   | Workstream                | [me]                                                                                                        | [you]                                                                                            |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Supabase prod finalize    | MCP-verify migrations + advisor; document reconcile + secret/provider steps                                 | Set `PUBLIC_APP_URL` secret; enable Google provider; set Site URL + redirect allowlist           |
| 2   | Google SSO                | Confirm app/env wiring emits the allowlisted callback; pin every exact value                                | Create Cloud project, consent screen, **Web** OAuth client; paste client ID/secret into Supabase |
| 3   | Web / Netlify             | `netlify.toml` prod env; `public/_headers` security headers + CSP (report-only first); verify build renders | Create site, claim `wikicanvas` subdomain, connect GitHub repo                                   |
| 4   | Android / Play (internal) | `eas.json` track→`internal` + preview env; document `eas` commands; privacy page                            | Play account; create app; first **manual** AAB; service account; roll out to internal            |
| 5   | Cross-cutting             | Privacy policy page at `/privacy`; env-matrix doc; README "Production" section                              | Confirm privacy wording                                                                          |
| 6   | GO-LIVE runbook           | Author `docs/GO-LIVE.md` (ordered, tagged, exact values, per-step verify)                                   | Execute it                                                                                       |

---

## 4. In-repo changes (the [me] deliverables)

All are config/docs — no application logic changes (auth is already correct).

### 4.1 `netlify.toml`

Keep `[build]` and `[[redirects]]`. Add the three **public** `EXPO_PUBLIC_*` values to `[build.environment]` (publishable key is public-by-design / RLS-protected; committing gives reproducible builds). Headers live in `public/_headers` (§4.2), not here.

```toml
[build.environment]
  NODE_VERSION = "20.19.0"
  EXPO_PUBLIC_SUPABASE_URL = "https://lhxixheyjoxujewybhgw.supabase.co"
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "<sb_publishable_… value>"
  EXPO_PUBLIC_PUBLIC_APP_URL = "https://wikicanvas.netlify.app"
```

> Trade-off: `netlify.toml` values override the Netlify UI for the same key, so per-context overrides (e.g. a Deploy-Preview-specific `PUBLIC_APP_URL`) would require moving that one key to the UI. Acceptable for a single production origin now.

### 4.2 `public/_headers`

Keep the existing `/canvaskit.wasm` `Content-Type` rule (CanvasKit needs `application/wasm`). Add a `/*` block with security headers and the **verified** CSP, shipped as **`Content-Security-Policy-Report-Only` first**:

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy-Report-Only: default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://lhxixheyjoxujewybhgw.supabase.co wss://lhxixheyjoxujewybhgw.supabase.co; worker-src 'self' blob:; child-src 'self' blob:; frame-src 'self' blob: data:; manifest-src 'self'; frame-ancestors 'none'; form-action 'self'

/canvaskit.wasm
  Content-Type: application/wasm
```

Promotion to enforcing (`Content-Security-Policy:` — same value) is a **follow-up** after the report-only policy is clean against real use, including a re-test under enforcement.

> Why `'unsafe-inline'`/`'unsafe-eval'` are unavoidable today: the untrusted Wikipedia HTML runs in a **null-origin sandboxed iframe** (no `allow-same-origin`, no access to app storage/cookies), and the app shell loads its JS from an external same-origin file — so the residual XSS risk is bounded. A nonce/hash approach is impractical because the `srcdoc` scripts are regenerated per article/theme. Documented as an accepted trade-off.

### 4.3 `eas.json`

- `submit.production.android.track`: `"alpha"` → **`"internal"`**.
- `submit.production.android.releaseStatus`: keep `"draft"` for the first automated submit, then `"completed"` to actually reach internal testers (runbook calls this out).
- Add `"environment": "preview"` to the `preview` build profile so its `EXPO_PUBLIC_*` resolve from the EAS `preview` environment (the profile currently has no explicit environment).

### 4.4 Privacy policy — `public/privacy/index.html`

A static page served at **`/privacy`** (robust: no dependency on the SPA/canvas loading; Netlify serves the real file ahead of the SPA catch-all). Covers: local-first storage (IndexedDB/SQLite); optional Google sign-in storing email + Google account id in Supabase under RLS; the Wikipedia proxy (article title/search + IP → Wikipedia via the edge function); **no ads/tracking/analytics**; AGPL source link; contact `vasil.yoshev@gmail.com`; data-deletion path (sign out clears local; account-data deletion on request). This URL feeds both the Google consent screen and Play's privacy-policy field.

### 4.5 Docs

- **`docs/GO-LIVE.md`** — the runbook (§5).
- **Env-matrix doc** (in `docs/GO-LIVE.md` or a sibling) — every variable × where set (local `.env.local` / Netlify `[build.environment]` / EAS `production` + `preview`) × public-or-secret, including `EXPO_PUBLIC_EAS_PROJECT_ID`.
- **`README.md`** — add a "Production" section linking the runbook.
- **`.env.local.example`** — note `EXPO_PUBLIC_EAS_PROJECT_ID` (native builds only).

---

## 5. The GO-LIVE runbook (`docs/GO-LIVE.md`)

One ordered, copy-pasteable checklist. Every step tagged **[me]** / **[you]**, with exact values and a `verify:` line. Ordering resolves dependencies:

1. **Supabase finalize** [me-verify/you]: confirm migrations + advisor (MCP); set `PUBLIC_APP_URL` secret; enable Google provider (after §2 produces the client); set Site URL + redirect allowlist.
2. **Google SSO** [you]: Cloud project → consent screen (External, scopes `openid`/`email`/`profile`) → **Web** OAuth client (origins + the Supabase redirect URI) → paste client ID/secret into Supabase.
3. **Web deploy** [you+me]: create Netlify site → claim `wikicanvas` subdomain → connect GitHub repo (auto-deploy). `verify:` `curl -I https://wikicanvas.netlify.app/auth-callback?code=test` returns the SPA + security headers.
4. **Smoke-test web sign-in** [you]: open the site, sign in with Google end-to-end, confirm a session syncs.
5. **CSP promotion** [me, follow-up]: once report-only is clean, flip to enforcing + re-test.
6. **Android internal** [you+me]: `eas init` → set EAS env vars → `eas build -p android --profile production` → **manual first AAB upload** in Play Console → complete privacy policy + (for promotion-readiness) App content → service account → `eas submit` for later builds → roll out to internal → install on device → run the `FOLLOWUPS.md` native smoke test.

The runbook ends with a consolidated **"What only you can do"** list (the deliverable requested): the Google Cloud, Netlify, Play Console, and secret-paste steps, each with its exact values.

---

## 6. Canonical exact values (single source of truth)

| Purpose                                              | Value                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supabase project ref                                 | `lhxixheyjoxujewybhgw`                                                                                                                           |
| Supabase URL                                         | `https://lhxixheyjoxujewybhgw.supabase.co`                                                                                                       |
| Google **Web** client — Authorized JavaScript origin | `https://wikicanvas.netlify.app` (+ `http://localhost:8081` for dev)                                                                             |
| Google **Web** client — Authorized redirect URI      | `https://lhxixheyjoxujewybhgw.supabase.co/auth/v1/callback`                                                                                      |
| Google scopes                                        | `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`                                                                                 |
| Supabase Site URL                                    | `https://wikicanvas.netlify.app`                                                                                                                 |
| Supabase redirect allowlist                          | `https://wikicanvas.netlify.app/auth-callback`, `wikicanvas://auth-callback`, `http://localhost:8081/auth-callback`, `exp://**` (dev only)       |
| Edge function secret                                 | `PUBLIC_APP_URL=https://wikicanvas.netlify.app`                                                                                                  |
| Netlify site name                                    | `wikicanvas` → `https://wikicanvas.netlify.app`                                                                                                  |
| Production branch / build / publish                  | `master` / `npm run export:web` / `dist`                                                                                                         |
| EAS env (production + preview)                       | `EXPO_PUBLIC_EAS_PROJECT_ID`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_PUBLIC_APP_URL` (all `plaintext`) |
| Play track                                           | `internal`                                                                                                                                       |
| Android package                                      | `org.vasilyoshev.wikicanvas`                                                                                                                     |
| Privacy policy URL                                   | `https://wikicanvas.netlify.app/privacy`                                                                                                         |

---

## 7. Verification plan

- **In-repo (local, [me]):** after each config change run `npm run verify` (lint/format/typecheck/tests/coverage). Build the production export and confirm the app renders via the stubbed-`wiki-proxy` Playwright path (per project memory). Statically validate `public/_headers` and `netlify.toml` syntax.
- **CSP caveat (honest):** a plain local static server does **not** apply Netlify `_headers`, so CSP header _emission_ and browser behavior are validated **on Netlify** — which is exactly why it ships **report-only first**. Local verify proves no functional regression; report-only on the deployed site proves the policy before enforcement.
- **Post-deploy ([you], in runbook):** `curl -I` for headers; full Google sign-in round-trip on web; DevTools console clean of CSP violations across all surfaces (Skia canvas, article iframe, link-spawn, theme toggle, search, sign-in, idle) before promoting CSP to enforcing.
- **Android ([you]):** install the internal build on a device and run the `FOLLOWUPS.md` native smoke test (open session, render article, spawn via link, pan/zoom/drag, fullscreen, sign in + sync).

---

## 8. Risks & open items (carried from verification)

- **Netlify subdomain availability:** `wikicanvas` must be globally unique on `*.netlify.app`; if taken, pick another name and update every value in §6.
- **Play account type:** a **Personal** account created after 2023-11-13 needs 12 testers × 14 continuous days of _closed_ testing before it can request **production** access (does not block internal). An **Organization** account is exempt but needs a free D-U-N-S number (request early). Account type can't be changed later — decide at registration. Internal-testing-now is unaffected either way.
- **First AAB is manual** in Play Console (API can't create the first release). Plan the first upload by hand, then automate via `eas submit`.
- **App access for Google sign-in (promotion only):** when later promoting beyond internal, declare "functionality restricted" and provide a test account / login path, because Google reviewers can't drive interactive Google OAuth. Not needed for internal (no review).
- **CSP `'unsafe-eval'` may be droppable later:** disabling Expo web async chunks (`asyncRoutes` off / `EXPO_NO_METRO_LAZY=1`) could let `script-src` drop to `'wasm-unsafe-eval' 'unsafe-inline'`. Unverified against a fresh export; treat as a later optimization, not a prerequisite.
- **Preview EAS environment mapping** (`eas.json` preview profile) is unconfirmed in current EAS; adding `"environment": "preview"` + replicating vars there is the safe fix.
- **Migration-ledger drift** (§2) — reconcile before the next schema change.
- **Console label drift:** exact button/field wording in Google Cloud, Supabase, Netlify, and Play consoles may differ slightly from the runbook; the structural steps and values are what matter.

---

## 9. Terminal step

After this spec is approved, create the implementation plan via the `writing-plans` skill. Implementation produces the §4 in-repo changes and the §5 runbook; the [you] steps are executed by the owner against the runbook.
