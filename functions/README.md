# Sarpras Operations — Cloud Functions

Backend for the Sarpras Operations PWA. Introduced in **v1.11.1.1** as a
**dormant scaffold**: it is deployable and testable but is **not wired into
the live application**. The frontend behaves exactly as before.

## Structure

```
functions/
├─ index.js                 # exports: health, verifyPin
├─ package.json             # Node 20, firebase-admin + firebase-functions
├─ README.md
└─ src/
   ├─ config/
   │  ├─ constants.js       # SERVICE_NAME, SERVICE_VERSION, REGION
   │  └─ secrets.js         # TELEGRAM_BOT_TOKEN declaration (not bound yet)
   ├─ health.js             # health() — deployment smoke test (active)
   ├─ auth/
   │  └─ verifyPin.js       # verifyPin() — DORMANT skeleton (not in login)
   ├─ notifications/        # (reserved) engine + channel dispatchers
   ├─ events/               # (reserved) DB-trigger functions
   └─ scheduled/            # (reserved) cron functions (reminders)
```

## Functions in this release

| Function | Type | State | Purpose |
|---|---|---|---|
| `health` | HTTPS `onRequest` | **Active** | Returns `{ status, service, version, timestamp }`. Side-effect free. Proves the deploy pipeline. |
| `verifyPin` | Callable `onCall` | **Dormant** | Validates `{ username, pin }` shape and logs the attempt. Performs no DB read, no PIN check, mints no token. Not called by the app. |

- **Region:** `asia-southeast1` (matches the RTDB region).
- **Runtime:** Node 20, 2nd-gen functions.
- The frontend version (`js/config.js` → `APP_VERSION`) is intentionally
  **unchanged** so this release triggers no PWA update banner.

## Quick start

```bash
cd functions
npm install
firebase emulators:start --only functions   # local
firebase deploy --only functions             # deploy
```

See [`docs/BACKEND_DEPLOYMENT.md`](../docs/BACKEND_DEPLOYMENT.md) for full
setup, emulator usage, deploy, and rollback procedures.
