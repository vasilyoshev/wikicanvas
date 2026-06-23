# Production Go-Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the in-repo configuration, a privacy-policy page, and a single ordered manual runbook that take WikiCanvas to production — Supabase + Google SSO + Netlify web (full prod) + Android on the Play internal-testing track.

**Architecture:** This is config + docs only; the auth code is already correct. Tasks edit `netlify.toml`, `public/_headers`, `eas.json`, add `public/privacy/index.html`, and author `docs/GO-LIVE.md` (the runbook the owner executes). The only automated test added is a guard test pinning the non-obvious CSP tokens that, if dropped, silently break the app. All console/legal/payment steps live in the runbook for the owner.

**Tech Stack:** Expo (expo-router) + React Native Web, Netlify (static host), Supabase (Auth + edge functions), EAS (Android build/submit), Jest.

**Spec:** `docs/superpowers/specs/2026-06-23-production-go-live-design.md` (read it first; this plan implements §4 and §5).

## Global Constraints

- **Node:** `>=20.19.0` (matches `package.json` engines + `netlify.toml`).
- **Branch:** all work on `production-go-live` (already created; spec already committed there).
- **Assumed web origin:** `https://wikicanvas.netlify.app` — used as OAuth redirect origin, Supabase Site URL, `wiki-proxy` CORS origin, and privacy-policy host. If the Netlify site name `wikicanvas` is unavailable, every occurrence must change together.
- **Supabase project ref:** `lhxixheyjoxujewybhgw`; URL `https://lhxixheyjoxujewybhgw.supabase.co`.
- **Supabase publishable key (public by design):** `sb_publishable_A9IkL0vZ6_7IMXaOzOiahw_gr_UWfsr`.
- **Android package:** `org.vasilyoshev.wikicanvas`. **Play track:** `internal`.
- **All `EXPO_PUBLIC_*` values are public client values** (RLS-protected) — safe to commit and to ship in the web bundle. Never mark an `EXPO_PUBLIC_*` var "secret" in EAS (it would be empty in the build).
- **CSP ships report-only first.** The verified `script-src` MUST keep `'unsafe-eval'` (Metro web chunk loader) and `'unsafe-inline'` (sandboxed `srcdoc` article iframe inherits the page CSP); `connect-src` MUST include `wss://…supabase.co`. Do not "tidy" these away.
- **Commits:** conventional-commit messages; one commit per task; end each commit body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Verify gate:** `npm run verify` (lint + format:check + typecheck + test:coverage + coverage:ratchet) must pass before each commit, except where a task notes a heavier build smoke.

---

## File Structure

| File                        | Action | Responsibility                                                                     |
| --------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `netlify.toml`              | Modify | Add the three public `EXPO_PUBLIC_*` build vars to `[build.environment]`.          |
| `public/_headers`           | Modify | Keep wasm `Content-Type`; add `/*` security headers + report-only CSP.             |
| `test/headers.test.ts`      | Create | Guard test: pin the fragile CSP tokens + the wasm rule.                            |
| `eas.json`                  | Modify | Submit track `alpha`→`internal`; add `environment` to the `preview` build profile. |
| `public/privacy/index.html` | Create | Static privacy policy served at `/privacy`.                                        |
| `docs/GO-LIVE.md`           | Create | The ordered manual runbook + env matrix + "what only you can do".                  |
| `README.md`                 | Modify | Add a "Production" section linking the runbook.                                    |
| `.env.local.example`        | Modify | Note `EXPO_PUBLIC_EAS_PROJECT_ID` (native builds only).                            |

---

## Task 1: Netlify production build env

**Files:**

- Modify: `netlify.toml`

**Interfaces:**

- Consumes: nothing.
- Produces: the production web build reads `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_PUBLIC_APP_URL` from the Netlify build environment (Metro inlines `EXPO_PUBLIC_*` at build time).

- [ ] **Step 1: Edit `netlify.toml`** — replace the file's contents with:

```toml
[build]
  command = "npm run export:web"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20.19.0"
  EXPO_PUBLIC_SUPABASE_URL = "https://lhxixheyjoxujewybhgw.supabase.co"
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_A9IkL0vZ6_7IMXaOzOiahw_gr_UWfsr"
  EXPO_PUBLIC_PUBLIC_APP_URL = "https://wikicanvas.netlify.app"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- [ ] **Step 2: Validate the TOML parses**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('netlify.toml','utf8');if(!/EXPO_PUBLIC_PUBLIC_APP_URL = \"https:\/\/wikicanvas.netlify.app\"/.test(s))throw new Error('missing app url');if(!/from = \"\/\*\"/.test(s))throw new Error('redirect lost');console.log('netlify.toml OK')"`
Expected: prints `netlify.toml OK` (and confirms the SPA redirect was not dropped).

- [ ] **Step 3: Confirm the rest of the build is unaffected**

Run: `npm run verify`
Expected: PASS (this change does not touch TS/lint/test surface).

- [ ] **Step 4: Commit**

```bash
git add netlify.toml
git commit -m "chore(web): add production Supabase + app-URL env to netlify.toml"
```

---

## Task 2: Security headers + report-only CSP (with guard test)

**Files:**

- Create: `test/headers.test.ts`
- Modify: `public/_headers`

**Interfaces:**

- Consumes: nothing.
- Produces: every Netlify response carries the security headers + report-only CSP; `public/_headers` is copied verbatim into `dist/` by `expo export`.

- [ ] **Step 1: Write the failing guard test** — create `test/headers.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

// Pins the non-obvious header rules that are easy to "tidy" away but break the
// app when removed. See docs/superpowers/specs/2026-06-23-production-go-live-design.md §2.
const headers = readFileSync(join(process.cwd(), "public", "_headers"), "utf8");

describe("public/_headers", () => {
  it("preserves the wasm Content-Type rule (CanvasKit needs application/wasm)", () => {
    expect(headers).toMatch(/\/canvaskit\.wasm/);
    expect(headers).toMatch(/Content-Type:\s*application\/wasm/);
  });

  it("ships the CSP as report-only first", () => {
    expect(headers).toMatch(/Content-Security-Policy-Report-Only:/);
  });

  it("keeps the script-src tokens the app actually needs", () => {
    // Metro's web async-chunk loader runs eval(); the srcdoc article iframe
    // inherits this CSP and injects inline scripts. Both tokens are required.
    expect(headers).toMatch(/'unsafe-eval'/);
    expect(headers).toMatch(/'unsafe-inline'/);
    expect(headers).toMatch(/'wasm-unsafe-eval'/);
  });

  it("allows the Supabase websocket origin in connect-src", () => {
    expect(headers).toMatch(/connect-src[^;]*wss:\/\/lhxixheyjoxujewybhgw\.supabase\.co/);
  });

  it("allows the realtime worker and blocks framing", () => {
    expect(headers).toMatch(/worker-src[^;]*blob:/);
    expect(headers).toMatch(/frame-ancestors 'none'/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest test/headers.test.ts`
Expected: FAIL — current `public/_headers` has only the wasm rule, so the CSP/script-src/connect-src assertions fail.

- [ ] **Step 3: Update `public/_headers`** — replace the file's contents with (CSP value must stay on one physical line):

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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest test/headers.test.ts`
Expected: PASS (all five assertions).

- [ ] **Step 5: Build smoke — confirm `_headers` ships and the app still builds**

Run: `npm run export:web`
Then: `node -e "require('fs').accessSync('dist/_headers');const s=require('fs').readFileSync('dist/_headers','utf8');if(!/Report-Only/.test(s))throw new Error('CSP not exported');console.log('dist/_headers OK')"`
Expected: export completes; prints `dist/_headers OK` (proves Expo copied `public/_headers` into `dist/`).

- [ ] **Step 6: Run the full gate**

Run: `npm run verify`
Expected: PASS (the new `test/headers.test.ts` runs under jest; coverage ratchet unaffected — it adds no `src/**` lines).

- [ ] **Step 7: Commit**

```bash
git add public/_headers test/headers.test.ts
git commit -m "feat(web): add security headers + report-only CSP for Netlify"
```

---

## Task 3: EAS submit track → internal + preview environment

**Files:**

- Modify: `eas.json`

**Interfaces:**

- Consumes: nothing.
- Produces: `eas submit -p android --profile production` targets the **internal** testing track; the `preview` build profile resolves its `EXPO_PUBLIC_*` from the EAS `preview` environment.

- [ ] **Step 1: Edit `eas.json`** — replace the file's contents with:

```json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "environment": "development"
    },
    "preview": {
      "distribution": "internal",
      "environment": "preview"
    },
    "production": {
      "autoIncrement": true,
      "environment": "production",
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "track": "internal",
        "releaseStatus": "draft"
      }
    }
  }
}
```

> `releaseStatus` stays `"draft"` so an automated `eas submit` uploads without releasing; the runbook (Task 5, Part G) explains flipping to `"completed"` once you want builds to reach internal testers.

- [ ] **Step 2: Validate JSON + the track value**

Run: `node -e "const j=require('./eas.json');if(j.submit.production.android.track!=='internal')throw new Error('track');if(j.build.preview.environment!=='preview')throw new Error('preview env');console.log('eas.json OK')"`
Expected: prints `eas.json OK`.

- [ ] **Step 3: Run the gate (prettier formats `eas.json`)**

Run: `npm run verify`
Expected: PASS (`format:check` confirms `eas.json` is prettier-clean).

- [ ] **Step 4: Commit**

```bash
git add eas.json
git commit -m "chore(eas): target Play internal track + add preview build environment"
```

---

## Task 4: Privacy policy page

**Files:**

- Create: `public/privacy/index.html`

**Interfaces:**

- Consumes: nothing.
- Produces: a static page served at `https://wikicanvas.netlify.app/privacy` (Netlify serves the real file ahead of the SPA catch-all). Referenced by the Google consent screen and Play's privacy-policy field.

- [ ] **Step 1: Create `public/privacy/index.html`** with this exact content:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="all" />
    <title>WikiCanvas — Privacy Policy</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        max-width: 46rem;
        margin: 0 auto;
        padding: 2.5rem 1.25rem 4rem;
        font:
          16px/1.6 system-ui,
          -apple-system,
          Segoe UI,
          Roboto,
          sans-serif;
      }
      h1 {
        font-size: 1.75rem;
      }
      h2 {
        margin-top: 2rem;
        font-size: 1.2rem;
      }
      a {
        color: #7c3aed;
      }
      .muted {
        opacity: 0.7;
        font-size: 0.9rem;
      }
      code {
        font-family: ui-monospace, monospace;
      }
    </style>
  </head>
  <body>
    <h1>WikiCanvas Privacy Policy</h1>
    <p class="muted">Last updated: 23 June 2026</p>

    <p>
      WikiCanvas is an infinite canvas for exploring Wikipedia articles. It is
      <strong>local-first</strong>: it works fully without an account, and your canvases are stored
      on your own device. This policy explains the limited data involved when you choose to sign in
      or read articles.
    </p>

    <h2>Data stored on your device</h2>
    <p>
      Your sessions (article maps, window positions, and viewport) are stored locally in your
      browser (IndexedDB) or on your device (SQLite). This data never leaves your device unless you
      sign in to sync.
    </p>

    <h2>Data we store when you sign in (optional)</h2>
    <p>
      Signing in with Google is optional and only enables cross-device sync. When you sign in we
      store, in our Supabase database, your account identifier and email address (from Google) and
      the contents of your synced sessions. Access is restricted by row-level security so that only
      your account can read or write your data.
    </p>

    <h2>Wikipedia content</h2>
    <p>
      Article and search requests are relayed to Wikipedia through our proxy so the app can run
      without per-user Wikipedia accounts. Your IP address reaches our proxy and Wikipedia as part
      of a normal web request. We do not log or build a profile of your reading.
    </p>

    <h2>What we do not do</h2>
    <p>No advertising. No third-party analytics or tracking. No sale of personal data.</p>

    <h2>Third parties</h2>
    <ul>
      <li>Google — sign-in (authentication).</li>
      <li>Supabase — database, authentication, and the Wikipedia proxy.</li>
      <li>Wikipedia / Wikimedia — article content.</li>
      <li>Netlify — web hosting.</li>
    </ul>

    <h2>Retention &amp; deletion</h2>
    <p>
      Signing out clears the local session on that device. To delete your synced account data, email
      us at the address below and we will remove it.
    </p>

    <h2>Children</h2>
    <p>WikiCanvas is not directed at children under 13.</p>

    <h2>Contact</h2>
    <p>
      Questions or deletion requests:
      <a href="mailto:vasil.yoshev@gmail.com">vasil.yoshev@gmail.com</a>.
    </p>

    <h2>Source code</h2>
    <p>
      WikiCanvas is open source (AGPL-3.0):
      <a href="https://github.com/vasilyoshev/wikicanvas">github.com/vasilyoshev/wikicanvas</a>.
    </p>
  </body>
</html>
```

- [ ] **Step 2: Confirm it is served by the build**

Run: `npm run export:web`
Then: `node -e "require('fs').accessSync('dist/privacy/index.html');console.log('privacy page exported')"`
Expected: prints `privacy page exported` (Expo copied `public/privacy/` into `dist/`).

> Note: prettier formats HTML; if `format:check` flags it, run `npm run format` and re-stage. The block above is already prettier-shaped.

- [ ] **Step 3: Run the gate**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add public/privacy/index.html
git commit -m "feat(web): add privacy policy page served at /privacy"
```

---

## Task 5: The GO-LIVE runbook

**Files:**

- Create: `docs/GO-LIVE.md`

**Interfaces:**

- Consumes: every value defined in this plan's Global Constraints.
- Produces: the ordered manual runbook the owner executes; the deliverable the user asked for.

- [ ] **Step 1: Create `docs/GO-LIVE.md`** with this exact content:

````markdown
# WikiCanvas — Go-Live Runbook

Ordered steps to take WikiCanvas to production. Tags: **[you]** = a console/legal/payment
step only the account owner can do; **[me]** = already done in-repo (listed so you can verify).
Do the parts in order — later parts depend on earlier ones. Assumed web origin throughout:
**`https://wikicanvas.netlify.app`** (if you claim a different Netlify name, substitute it
everywhere).

Canonical values live in the spec: `docs/superpowers/specs/2026-06-23-production-go-live-design.md` §6.

---

## Part 0 — Prerequisites

- [ ] **[you]** A Google account (for Google Cloud + Play).
- [ ] **[you]** A GitHub account with this repo pushed (for Netlify auto-deploy).
- [ ] **[you]** Node `>=20.19.0` and the CLIs: `npm i -g eas-cli` and (optional) `npm i -g supabase`.
- [ ] **[you]** Decide the Play **account type** before registering — it cannot be changed later:
  - **Personal:** simplest; but a personal account created after 2023-11-13 must run a _closed_
    test with ≥12 testers for ≥14 continuous days before it can request **production**. Internal
    testing (our target now) is unaffected.
  - **Organization:** exempt from that rule, but needs a free D-U-N-S number (request early).

## Part A — Supabase finalize (project `lhxixheyjoxujewybhgw`)

- [ ] **[me, verify]** Migrations applied and security advisor clean. Confirm with:
      `supabase migration list --linked` (or the dashboard → Advisors).
- [ ] **[you]** Set the `wiki-proxy` CORS origin secret (no redeploy needed — the next invocation
      picks it up):
  - Dashboard: **Edge Functions → Secrets** → add `PUBLIC_APP_URL = https://wikicanvas.netlify.app`.
  - Or CLI: `supabase secrets set PUBLIC_APP_URL=https://wikicanvas.netlify.app --project-ref lhxixheyjoxujewybhgw`
  - `verify:` `supabase secrets list --project-ref lhxixheyjoxujewybhgw` shows `PUBLIC_APP_URL`.
- [ ] **[you, later/optional]** Before the _next_ schema change, reconcile the migration ledger
      (`supabase migration repair …`) so `db push --linked` is predictable. Not needed for go-live.

## Part B — Google OAuth client (Google Cloud Console)

- [ ] **[you]** Create/select a Cloud project at <https://console.cloud.google.com/auth/overview>.
- [ ] **[you]** Configure the consent screen (Google Auth Platform):
  - **Branding:** App name `WikiCanvas`; support email `vasil.yoshev@gmail.com`; developer contact `vasil.yoshev@gmail.com`.
  - **Audience:** User type **External**. (For our scopes you may stay in _Testing_ or _Publish_ — no Google verification is required.)
  - **Data Access → Add scopes:** `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
- [ ] **[you]** Create credentials → **OAuth client ID → Web application** (name e.g. `WikiCanvas Web (Supabase)`):
  - **Authorized JavaScript origins:** `https://wikicanvas.netlify.app` and `http://localhost:8081`.
  - **Authorized redirect URIs:** `https://lhxixheyjoxujewybhgw.supabase.co/auth/v1/callback`
    — **the Supabase callback, NOT the app URL.** (This single Web client covers web _and_ native;
    no Android client / SHA-1 needed.)
  - Copy the **Client ID** and **Client secret**.

## Part C — Wire Supabase Auth

- [ ] **[you]** Dashboard → **Authentication → Providers → Google**: enable, paste the Client ID
      and Client secret, Save. Leave **Authorized Client IDs** empty and **Skip nonce check** off
      (those are only for native ID-token sign-in, which this app does not use).
  - URL: <https://supabase.com/dashboard/project/lhxixheyjoxujewybhgw/auth/providers?provider=Google>
- [ ] **[you]** Dashboard → **Authentication → URL Configuration**:
  - **Site URL:** `https://wikicanvas.netlify.app`
  - **Redirect URLs** (Add URL for each): `https://wikicanvas.netlify.app/auth-callback`,
    `wikicanvas://auth-callback`, `http://localhost:8081/auth-callback`, and (dev only) `exp://**`.
  - URL: <https://supabase.com/dashboard/project/lhxixheyjoxujewybhgw/auth/url-configuration>

## Part D — Web deploy (Netlify)

- [ ] **[you]** App → **Add new site → Import an existing project → GitHub**, authorize the Netlify
      GitHub App for this repo, pick the repo. Netlify reads `netlify.toml` (build `npm run export:web`,
      publish `dist`, branch `master`). Deploy.
- [ ] **[you]** **Site configuration → General → Change site name** → `wikicanvas` (must be globally
      unique; if taken, pick another and update every value above). URL becomes `https://wikicanvas.netlify.app`.
- [ ] **[me]** Production env (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
      `EXPO_PUBLIC_PUBLIC_APP_URL`) is committed in `netlify.toml`; security headers + report-only CSP
      in `public/_headers`. Nothing to set in the Netlify UI.
- [ ] `verify:` `curl -I "https://wikicanvas.netlify.app/auth-callback?code=test"` returns 200
      (SPA served, query preserved) and shows the security headers; `curl -I https://wikicanvas.netlify.app/privacy`
      returns the privacy page.

## Part E — Verify web sign-in

- [ ] **[you]** Open `https://wikicanvas.netlify.app`, sign in with Google end-to-end, confirm you
      land back signed-in and a session syncs. If you get `redirect_uri_mismatch`, the Google client's
      redirect URI is wrong (must be the Supabase `/auth/v1/callback`). If Supabase rejects the
      redirect, the app callback is missing from the Supabase **Redirect URLs** allowlist.

## Part F — CSP promotion (follow-up, after Part E)

- [ ] **[you/me]** With the site live under report-only, exercise every surface (canvas thumbnails,
      open an article, click an in-article link, toggle theme, search, sign in, idle) and watch DevTools
      for `Refused to…` messages. When clean, change `Content-Security-Policy-Report-Only` →
      `Content-Security-Policy` in `public/_headers`, redeploy, and re-test under enforcement.

## Part G — Android internal testing

- [ ] **[you]** `eas login` (Expo account `vasil.yoshev`).
- [ ] **[you]** `eas init` → copy the printed **projectId** (a UUID). Because `app.config.ts` is a
      dynamic config, EAS will NOT write it for you.
- [ ] **[you]** Create EAS env vars (note `--visibility plaintext`; repeat the four for `--environment
preview` too, since the preview profile now maps to that environment):

  ```bash
  eas env:create --name EXPO_PUBLIC_EAS_PROJECT_ID --value <PROJECT_ID_UUID> --environment production --visibility plaintext
  eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://lhxixheyjoxujewybhgw.supabase.co --environment production --visibility plaintext
  eas env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_A9IkL0vZ6_7IMXaOzOiahw_gr_UWfsr --environment production --visibility plaintext
  eas env:create --name EXPO_PUBLIC_PUBLIC_APP_URL --value https://wikicanvas.netlify.app --environment production --visibility plaintext
  ```

  `verify:` `eas env:list --environment production` shows all four.

- [ ] **[you]** Build the AAB: `eas build -p android --profile production` (first build prompts to
      generate the upload keystore — accept; EAS stores it). Download the `.aab`.
- [ ] **[you]** Register the Play developer account (US$25, identity verification) and **Create app**
      (`WikiCanvas`, App, Free). Accept the declarations.
- [ ] **[you]** **Upload the first AAB MANUALLY**: Play Console → **Testing → Internal testing →
      Create new release**, upload the `.aab` (the Play API cannot create the first release; this also
      enrolls you in Play App Signing — accept the Google-managed default).
- [ ] **[you]** Set the **Privacy policy** URL `https://wikicanvas.netlify.app/privacy`
      (Policy → App content). Recommended now, and required before any later promotion: complete
      **App access** (declare the Google sign-in; provide a test account for reviewers),
      **Data safety**, **Content rating**, **Target audience**, **Ads**.
- [ ] **[you]** Add internal testers: **Internal testing → Testers** → create an email list (≤100
      Gmail/Workspace addresses; Google Groups are not supported on internal). Copy the opt-in link.
- [ ] **[you]** **Roll out** the release to internal testing, open the opt-in link on an Android
      device, install, and run the device smoke test from `docs/superpowers/FOLLOWUPS.md` (open a
      session, render an article, spawn via link, pan/zoom/drag, fullscreen, sign in + sync).
- [ ] **[you, for later releases]** Set up a Google Cloud **service account** (enable the _Google
      Play Android Developer API_, create a JSON key), invite it in Play Console → **Users and
      permissions** with _Release apps to testing tracks_, then add the key to EAS (`eas credentials -p
android`) or `eas.json`. Flip `eas.json` `releaseStatus` to `"completed"` and use
      `eas submit -p android --profile production --latest` for every subsequent internal release.

---

## Environment variable matrix

| Variable                                | Local (`.env.local` / `.env`) | Netlify (`netlify.toml`) | EAS (`production` + `preview`) | Kind                |
| --------------------------------------- | ----------------------------- | ------------------------ | ------------------------------ | ------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`              | ✅                            | ✅                       | ✅                             | public              |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  | ✅                            | ✅                       | ✅                             | public              |
| `EXPO_PUBLIC_PUBLIC_APP_URL`            | optional (dev)                | ✅                       | ✅                             | public              |
| `EXPO_PUBLIC_EAS_PROJECT_ID`            | —                             | —                        | ✅ (native builds)             | public (UUID)       |
| `PUBLIC_APP_URL` (Supabase edge secret) | —                             | —                        | — (set in Supabase)            | secret-ish (origin) |

---

## What only you can do (summary)

1. **Google Cloud:** create project, consent screen, **Web** OAuth client → copy Client ID/secret.
2. **Supabase dashboard:** enable Google provider (paste ID/secret), set Site URL + redirect
   allowlist, set the `PUBLIC_APP_URL` edge secret.
3. **Netlify:** create the site from GitHub, claim the `wikicanvas` subdomain.
4. **Web sign-in:** the end-to-end Google login smoke test.
5. **Play Console:** register (US$25), create the app, upload the **first AAB manually**, fill App
   content, add testers, roll out to internal, smoke-test on a device; later set up the service
   account for automated `eas submit`.
````

- [ ] **Step 2: Run the gate (prettier formats markdown)**

Run: `npm run verify`
Expected: PASS (`format:check` confirms `docs/GO-LIVE.md` is prettier-clean; run `npm run format` and re-stage if not).

- [ ] **Step 3: Commit**

```bash
git add docs/GO-LIVE.md
git commit -m "docs: add production go-live runbook"
```

---

## Task 6: README + env-example doc touch-ups

**Files:**

- Modify: `README.md`
- Modify: `.env.local.example`

**Interfaces:**

- Consumes: `docs/GO-LIVE.md` (linked).
- Produces: discoverability of the runbook + documentation of the native-only env var.

- [ ] **Step 1: Add a "Production" section to `README.md`** — insert this block immediately before the `## License & source` section:

```markdown
## Production / Go-Live

Taking WikiCanvas to production (Supabase + Google SSO + Netlify web + Android
on the Play internal-testing track) is documented as an ordered runbook in
[`docs/GO-LIVE.md`](docs/GO-LIVE.md). The design rationale and verified
external-console steps are in
[`docs/superpowers/specs/2026-06-23-production-go-live-design.md`](docs/superpowers/specs/2026-06-23-production-go-live-design.md).

The production web app is built by Netlify (`npm run export:web` → `dist/`) with
security headers + a Content-Security-Policy in `public/_headers`. Android builds
ship via EAS (`eas build` / `eas submit`).
```

- [ ] **Step 2: Document the native env var in `.env.local.example`** — append:

```
# Native (EAS) builds only — the EAS project UUID from `eas init`. Read into
# app.config.ts extra.eas.projectId. Not needed for web/local dev.
# EXPO_PUBLIC_EAS_PROJECT_ID=00000000-0000-0000-0000-000000000000
```

- [ ] **Step 3: Run the gate**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md .env.local.example
git commit -m "docs: link the go-live runbook + document EAS_PROJECT_ID env"
```

---

## Final verification (whole-plan gate)

- [ ] **Run the full local gate:** `npm run verify` → PASS.
- [ ] **Build smoke:** `npm run export:web` succeeds; `dist/_headers` and `dist/privacy/index.html` exist.
- [ ] **(Optional) e2e:** `npm run test:e2e` → the stubbed-`wiki-proxy` Playwright suite stays green (proves the CSP/header changes did not regress rendering).
- [ ] **Confirm the branch is clean** and all six task commits are present on `production-go-live`:
      `git log --oneline master..production-go-live`.
- [ ] **Hand off** the `production-go-live` branch (open a PR or merge per the project's flow) and
      follow `docs/GO-LIVE.md` for the manual steps.

```

```
