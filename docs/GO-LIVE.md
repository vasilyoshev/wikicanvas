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
