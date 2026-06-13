# Backend Deployment Guide (v1.11.1.1)

How to set up, run, deploy, and roll back the backend scaffold introduced in
**v1.11.1.1 — Backend Scaffold Foundation**.

> **This release is dormant.** Hosting, rules, and Functions are wired into a
> deploy pipeline but the running app is unchanged. Login, assignments,
> notifications, analytics, and the PWA all behave exactly as before.

---

## 1. Prerequisites

- **Node.js 20** (matches the Functions runtime).
- **Firebase CLI**: `npm install -g firebase-tools`
- Authenticate: `firebase login`
- Confirm the project alias (already committed in `.firebaserc`):
  ```bash
  firebase use            # should resolve to: schedule-driver-pbsi
  ```

> Cloud Functions (2nd gen) require the project to be on the **Blaze** plan.
> Hosting and Database rules work on Spark. You can deploy Hosting/rules
> without enabling Functions billing.

---

## 2. Local setup

```bash
# from repo root
cd functions
npm install
```

This installs `firebase-admin` and `firebase-functions` locally (ignored by
git via `functions/.gitignore`).

---

## 3. Emulator usage

Run the backend locally without touching production:

```bash
# from repo root
firebase emulators:start
```

Ports (from `firebase.json`):

| Emulator | Port | URL |
|---|---|---|
| Emulator UI | 4000 | http://localhost:4000 |
| Hosting | 5000 | http://localhost:5000 |
| Functions | 5001 | — |
| Realtime Database | 9000 | — |

**Smoke-test `health` locally** (URL pattern for the functions emulator):

```bash
curl "http://localhost:5001/schedule-driver-pbsi/asia-southeast1/health"
# → {"status":"ok","service":"sarpras-operations","version":"1.11.1.1","timestamp":"..."}
```

Functions only:

```bash
firebase emulators:start --only functions
```

---

## 4. Deploy

Each target deploys independently — deploy only what you intend to.

### 4a. Hosting (static app)

```bash
firebase deploy --only hosting
```

Serves the existing static app from the repo root. The `ignore` list in
`firebase.json` excludes `node_modules/`, `functions/`, `docs/`, `scripts/`,
`Analytics-V2/`, markdown, and dev files. Cache headers keep
`service-worker.js` / `version.json` / `manifest.json` fresh so the existing
PWA update model continues to work.

> Only run this if you intend to serve the app from Firebase Hosting. If the
> app is currently hosted elsewhere, adding `firebase.json` changes nothing
> until you actually run a Hosting deploy and point DNS at it.

### 4b. Database rules

```bash
firebase deploy --only database
```

Deploys `database.rules.json`. In v1.11.1.1 this is the **permissive baseline
(`.read/.write: true`)** — identical in effect to current production. It does
**not** tighten anything. Owner/role rules land in v1.11.1.2 after the
custom-auth cutover.

### 4c. Functions

```bash
firebase deploy --only functions
```

Deploys `health` and the dormant `verifyPin`. Verify after deploy:

```bash
curl "https://asia-southeast1-schedule-driver-pbsi.cloudfunctions.net/health"
firebase functions:log
```

---

## 5. Secret Manager (preparation only)

No secret is required to deploy v1.11.1.1 — `secrets.js` declares
`TELEGRAM_BOT_TOKEN` but no function binds it yet. When v1.11.1.3 migrates
Telegram server-side, set it once:

```bash
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
# paste the bot token when prompted
```

Until then, Telegram keeps sending from the browser using
`/settings/telegram/botToken` — unchanged.

---

## 6. Rollback procedures

| Target | Rollback |
|---|---|
| **Hosting** | `firebase hosting:rollback` (reverts to the previous release instantly), or redeploy the prior commit. |
| **Database rules** | Republish the previous rules: restore the old file and `firebase deploy --only database`. Rules are versioned in the Firebase console (Realtime Database → Rules → history) and can be reverted there in seconds. Because the v1.11.1.1 baseline is open, there is nothing to roll back behavior-wise. |
| **Functions** | Delete the dormant functions if needed: `firebase functions:delete health verifyPin`. They have no callers, so removing them cannot affect the app. |

**Fastest "undo everything" for this phase:** the scaffold is inert. Not
running any `firebase deploy` leaves production exactly as it is today; the
committed files only take effect when explicitly deployed.

---

## 7. What is intentionally NOT done in v1.11.1.1

- ❌ No login/auth cutover (`verifyPin` is dormant; `js/auth.js` unchanged).
- ❌ No security-rule tightening (baseline stays open).
- ❌ No Telegram migration (still browser-side).
- ❌ No notification/event/scheduled functions.
- ❌ No frontend `APP_VERSION` bump (no PWA update banner).

Next: **v1.11.1.2 — Identity + rules cutover** (custom auth, write-through
session cache, staged rule enforcement). See
[`BACKEND_FOUNDATION_ARCHITECTURE.md`](BACKEND_FOUNDATION_ARCHITECTURE.md).
