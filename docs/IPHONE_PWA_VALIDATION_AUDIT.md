# iPhone PWA Validation Audit — v1.11.3 Pilot

**Date:** 2026-06-14
**Scope:** Production iPhone testing of the v1.11.3 push/notification rollout.
**Type:** Read-only audit. No fixes implemented.
**Running version:** `1.11.3.1` (version.json)

---

## Executive summary

The headline feature of v1.11.3 — Web Push opt-in — is **non-functional on every
device**, not just iPhone. The published VAPID public key in `js/config.js` is
**corrupted: the 87-character key is concatenated three times** (261 chars). The
browser's `pushManager.subscribe()` rejects it, the opt-in throws, and no
`/push_subscriptions` record is ever written. This is a hard blocker for the
push half of the pilot.

Four secondary issues compound the experience: a permanent soft-ask suppression
(no second chance to enable push), a Telegram test that fails silently behind a
count toast, an iOS clipboard-read limitation, and a mobile navigation trap that
strands admins in the Administration workspace.

| # | Issue | Severity | Blocks v1.11.3 pilot? |
|---|-------|----------|-----------------------|
| 1 | Push activation fails (malformed VAPID key) | **CRITICAL** | **Yes — blocks push validation entirely** |
| 2 | `push_subscriptions` never created | **CRITICAL** | **Yes — same root cause as #1** |
| 6 | Dashboard nav blocked after Admin Panel (mobile) | **HIGH** | Yes — admins get trapped; not push-specific but ships in this build |
| 3 | Telegram test reports "sukses 0, gagal 1" | **HIGH** | Likely — Telegram is the primary live channel; needs the hidden error to confirm |
| 5 | Push banner suppression becomes permanent | **MEDIUM** | Compounds #1 — no retry path |
| 4 | Clipboard paste fails on iPhone | **LOW** | No — manual paste works |

---

## Is the app running as a Safari tab or an installed PWA?

**Evidence points to an installed (standalone) PWA.**

The reported activation error is the catch-all toast
`"Gagal mengaktifkan notifikasi. Coba lagi."` from
[push.js:165](../js/push.js#L165). To reach that line the flow must first pass
the iOS install gate at [push.js:135-138](../js/push.js#L135-L138):

```js
if (pwa.isIOSSafari && !pwa.isInstalled) {
  showIOSInstallModal();   // ← a Safari TAB would stop here
  return false;
}
```

A Safari tab (not installed) would have shown the **"Add to Home Screen"
install modal**, not the failure toast. Because the user saw the failure toast,
`pwa.isInstalled` was `true` — i.e. the app was launched from the Home Screen in
standalone mode (`display-mode: standalone` or `navigator.standalone === true`,
[pwa.js:106-109](../js/pwa.js#L106-L109)). iOS only exposes Web Push to installed
PWAs on iOS 16.4+, so this is also the only configuration in which the rest of
the flow could run. **Conclusion: installed PWA.**

---

## Issue 1 & 2 — Push activation fails / no `push_subscriptions` created

### Root cause: corrupted VAPID public key

[config.js:17](../js/config.js#L17) defines:

```js
export const VAPID_PUBLIC_KEY = 'BKUPcWYRZesX5DG_2nbiBw_…oXduZLI' /* ×3 */;
```

A valid VAPID public key is a P-256 uncompressed point: **65 bytes → 87
base64url characters**. The published value is **261 characters — the same
87-char key repeated exactly three times** (verified: `single + single + single
=== published`). Decoded it is ~195 bytes, which is not a valid EC point.

### Exact failing code path

[push.js:151-167](../js/push.js#L151-L167):

```js
const reg = await navigator.serviceWorker.ready;
let sub = await reg.pushManager.getSubscription();
if (!sub) {
  sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),  // ← invalid key
  });
}
await _register(sub);                                  // ← never reached
showToast('Notifikasi aktif di perangkat ini.');
...
} catch (err) {
  console.warn('[push] enable failed:', err);
  showToast('Gagal mengaktifkan notifikasi. Coba lagi.');  // ← what the user sees
  return false;
}
```

`urlBase64ToUint8Array` ([push.js:111-118](../js/push.js#L111-L118)) happily
decodes the over-long string into a ~195-byte array. `pushManager.subscribe()`
then validates it and **throws** (`DOMException` / `InvalidAccessError`: the
applicationServerKey is not a valid P-256 point). The throw lands in the catch,
producing the exact observed toast.

### Why `push_subscriptions` is not created

The server write path is **sound and simply never reached**:

- `subscribe()` throws → `_register()` ([push.js:170](../js/push.js#L170)) is
  never called → `callRegisterPushSubscription`
  ([firebase.js:208](../js/firebase.js#L208)) never fires.
- The Cloud Function `registerPushSubscription`
  ([functions/src/push/callables.js:49](../functions/src/push/callables.js#L49))
  is the only writer into `/push_subscriptions` and validates the payload
  correctly; it is never invoked.

So the empty node is a **downstream symptom of the VAPID corruption**, not an
independent bug. There is nothing to fix server-side.

> **Note on git history:** the recent commits
> `fix(v1.11.3): publish VAPID public key…` and
> `chore(v1.11.3.1): cache-bust VAPID rollout` indicate an attempt to ship the
> key. The cache-bust did not help because the *value itself* is malformed — a
> fresh fetch still delivers the tripled string.

### Minimal fix

Replace [config.js:17](../js/config.js#L17) with the **single** 87-char public
key that matches the `PUSH_VAPID_PUBLIC_KEY` / private-key secret bound to the
Cloud Functions. Confirm `VAPID_PUBLIC_KEY.length === 87` and that it decodes to
65 bytes. No code change is required — only the constant value. Re-bump the
version to cache-bust.

---

## Issue 3 — Telegram test reports "sukses 0, gagal 1"

### Code path

The test button calls `handleSendTestTelegram`
([admin.js:654-680](../js/admin.js#L654-L680)) → `sendNotification(user, …)`
([telegram.js:88](../js/telegram.js#L88)) → `sendTelegramMessage`
([telegram.js:31](../js/telegram.js#L31)), which posts **directly from the
browser** to `https://api.telegram.org/bot<token>/sendMessage` (the legacy live
path; `window.TELEGRAM_API_BASE_URL` is unset).

`"sukses 0, gagal 1"` means the flow **did run** and produced an array with
exactly **one** chat ID whose send failed
([admin.js:673-675](../js/admin.js#L673-L675)). It is therefore **not** the
"notifications disabled" skip and **not** the "no chat ID" throw — there is one
configured chat ID and the single send to it failed.

### Diagnostic gap (the real blocker to diagnosis)

The actual Telegram/network error is swallowed: `sendNotification` catches it,
pushes `{ ok:false, error }`, and `console.error`s it
([telegram.js:110-113](../js/telegram.js#L110-L113)), but the toast only shows
**counts** — the operator never sees *why*. On an iPhone PWA there is no console,
so the cause is invisible in the field.

### Ranked candidate causes (cannot be confirmed without the hidden error)

1. **Bot token not loaded on this device.** The token is set only if settings
   were loaded: `if (_telegramSettings?.botToken) setTelegramBotToken(...)`
   ([app.js:6849](../js/app.js#L6849)). If the test fires before settings hydrate
   (or the `/settings/telegram/botToken` value is absent in this environment),
   `getBotToken()` ([telegram.js:24](../js/telegram.js#L24)) returns empty and
   `sendTelegramMessage` throws *"Telegram Bot Token belum dikonfigurasi"*
   ([telegram.js:51-56](../js/telegram.js#L51-L56)) → counted as `gagal 1`.
2. **Bot has never been started by that chat.** A Chat ID can be "connected"
   (e.g. via the new `/myid` webhook flow) yet the bot still cannot initiate —
   Telegram returns `403 Forbidden: bot can't initiate conversation` or
   `400 Bad Request: chat not found`. This is the classic "valid ID, send still
   fails" case.
3. **Markdown parse rejection.** The call sends `parse_mode: 'Markdown'`
   ([telegram.js:59](../js/telegram.js#L59)); the test message is a plain date
   string so this is unlikely, but any stray `_ * [ ]` would 400.

This failure is **not iPhone-specific** — it is the same browser-direct path used
on every platform. The iPhone simply exposes it because there is no console to
read the swallowed error.

### Minimal fix

Surface the real reason: when `errCount > 0`, append
`results.find(r => !r.ok)?.error` to the toast (or log it to the in-app activity
log, which `handleSendTestTelegram` already writes at
[admin.js:676](../js/admin.js#L676)). Then re-test to confirm which of the three
causes applies. No behavioural change to the send path is needed to *diagnose*.

---

## Issue 4 — Clipboard paste fails on iPhone

### Code path

`handlePasteChatId` ([admin.js:475-498](../js/admin.js#L475-L498)) calls
`navigator.clipboard.readText()` from a custom "Paste" button.

### Root cause

iOS WebKit gates **programmatic clipboard *reads*** far more aggressively than
writes. `readText()` from an arbitrary button frequently rejects with
`NotAllowedError` — Safari expects clipboard reads to go through the *native
paste affordance* (the system "Paste" callout), not a synthetic button. The
rejection lands in the catch and shows
`"Gagal paste dari clipboard. Paste manual dengan Ctrl+V"`
([admin.js:493-497](../js/admin.js#L493-L497)).

Note the fallback message also says "Ctrl+V", which is meaningless on iPhone
(no physical Ctrl key; the gesture is long-press → Paste).

### Severity & fix

**Low.** The input field accepts a normal long-press → Paste, so the workflow is
not blocked — only the convenience button is. Minimal fix: on iOS, hide the
custom Paste button (or change copy to "tahan lalu Paste") and rely on the native
paste menu. No functional regression.

---

## Issue 5 — Push banner suppression becomes permanent

### Root cause: a one-shot 7-day TTL on the only entry point

The soft-ask banner is the **sole way to reach `enablePush()`** — confirmed by
search: `enablePush` is referenced only inside the banner's "Aktifkan" handler
([push.js:229-233](../js/push.js#L229-L233)); there is **no Settings toggle**
wired to it anywhere in `js/`.

`_recordSoftAsk()` writes a 7-day suppression timestamp
([push.js:99-107](../js/push.js#L99-L107)) and it fires on **both** branches:

- **Dismiss (×):** [push.js:225-228](../js/push.js#L225-L228) records, then hides.
- **Aktifkan (even on failure):** [push.js:229-233](../js/push.js#L229-L233)
  records *before* awaiting `enablePush()`.

`initPush()` only re-shows the banner when `!_softAsked()`
([push.js:281-283](../js/push.js#L281-L283)). So after a **single** interaction —
dismiss *or* a failed enable attempt — the banner is suppressed for 7 days, with
no alternative trigger. Within a pilot window this reads as "never appears
again."

This interacts viciously with Issue 1: the user taps "Aktifkan" → suppression is
recorded → `enablePush()` throws on the bad VAPID key → banner gone for 7 days
with push still off and no way to retry. (On a non-installed iOS tab the same tap
records suppression and merely opens the install modal — the prompt is consumed
without ever enabling push.)

### Severity & fix

**Medium** (high in combination with #1). Minimal fixes, any of:

- Add a **Settings/profile toggle** that calls `enablePush()` directly, giving a
  permanent retry path independent of the TTL banner.
- Do **not** call `_recordSoftAsk()` when the attempt *fails* — only on explicit
  dismiss or on success (move the record into the `if (ok)` branch).

---

## Issue 6 — Dashboard navigation blocked after opening Admin Panel

### Root cause: bottom-nav Dashboard never restores the workspace

Workspaces are mutually-exclusive surfaces toggled by `setWorkspace()`
([app.js:1616-1643](../js/app.js#L1616-L1643)), which sets
`timelineSurface.style.display = 'none'` whenever the workspace is not
`'dashboard'`.

Opening **Admin Panel** on mobile (`#btnUserMgmt`) calls
`setRailModule('administration')` ([app.js:706](../js/app.js#L706)), which runs
`setWorkspace('administration')` ([app.js:617-619](../js/app.js#L617-L619)) —
hiding the timeline and showing the admin workspace.

The mobile **Dashboard** button (`#bottomNavDashboard`,
[app.js:6786-6791](../js/app.js#L6786-L6791)) does:

```js
setBottomNavActive('bottomNavDashboard');
setCurrentDate(getCurrentDate());
renderViews();                       // renders INTO the hidden timeline surface
if (isDriver()) renderDriverDashboard();
```

It **never calls `setWorkspace('dashboard')` or `setRailModule('driverops')`.**
So `currentWorkspace` stays `'administration'`, `#v2TimelineSurface` stays
`display:none`, and `renderViews()` paints into an invisible container — the
button appears dead.

### Why the user gets trapped

The desktop "Driver Operations" switch lives on the **v2 rail**
([app.js:700](../js/app.js#L700)), but the rail is **hidden below 768px** (per the
comment at [app.js:703-705](../js/app.js#L703-L705): *"The rail is hidden at
<768px, so this is the only mobile entry point"*). On a phone there is therefore
**no visible control that calls `setRailModule('driverops')`**, and the bottom-nav
Dashboard button doesn't restore the workspace — leaving a full app reload as the
only escape.

### Severity & fix

**High** (usability trap for the admin role on mobile). Minimal fix: make the
bottom-nav Dashboard handler restore the workspace, e.g. call
`setRailModule('driverops')` (which already runs `setWorkspace('dashboard')` +
`renderViews()` + `renderDriverDashboard()`, [app.js:620-624](../js/app.js#L620-L624)),
or at minimum prepend `setWorkspace('dashboard')` before `renderViews()`.

---

## Severity ranking (consolidated)

1. **CRITICAL — Issue 1 / 2:** Corrupted VAPID key. Push opt-in cannot succeed on
   any device; no subscriptions are ever stored.
2. **HIGH — Issue 6:** Mobile admins are trapped in the Administration workspace
   with no working route back to the dashboard.
3. **HIGH — Issue 3:** Telegram test fails for the single configured chat; the
   real cause is hidden behind a count toast. Telegram is the primary live
   notification channel.
4. **MEDIUM — Issue 5:** One dismiss/failed-tap permanently suppresses the only
   push opt-in entry point; no retry path.
5. **LOW — Issue 4:** iOS clipboard read denied for the custom Paste button;
   native long-press paste still works.

---

## Does anything block the v1.11.3 pilot?

**Yes.**

- **Push validation is fully blocked** by the VAPID corruption (Issues 1 & 2).
  The pilot cannot validate the push feature at all until the single correct
  87-character key is published. This is the gating fix.
- **Issue 6** blocks basic admin usability on mobile and ships in this build —
  should be fixed before pilot regardless of push.
- **Issue 3** likely blocks notification-delivery validation (Telegram is the
  live channel); it must at minimum be made diagnosable (surface the error)
  before the pilot can confirm notifications work end-to-end.
- **Issues 4 and 5** do not block the pilot on their own, but Issue 5 should ship
  with the VAPID fix so testers actually get a chance to opt in.

### Recommended fix order (minimal, lowest-risk first)

1. **Issue 1/2** — correct `VAPID_PUBLIC_KEY` to the single 87-char value; bump
   version. *(constant-only change)*
2. **Issue 6** — restore the workspace in the bottom-nav Dashboard handler.
3. **Issue 5** — only record soft-ask suppression on dismiss/success (and/or add
   a Settings push toggle as a permanent retry path).
4. **Issue 3** — surface `results[*].error` in the test toast/log, then re-test.
5. **Issue 4** — hide the custom Paste button on iOS / fix the "Ctrl+V" copy.

---

*Audit complete. No code was modified.*
