# notifications/ — Recipient Resolution Foundation (v1.11.1.3)

| File | Role |
|---|---|
| `recipients.js` | `resolveRecipients(event, users) → { users, telegram, push }`. Collapses the three divergent encodings (`notification-service.js` fan-out, `notifications.js#isVisibleToUser`, `comments.js#_canView`) into one server-side resolver. `loadUserDirectory()` reads `/users` via the Admin SDK. |

**Shadow only this release.** The resolver is exercised by
`events/onEventWrite.js` to validate parity; it is **not yet authoritative**
and drives no sending. `push[]` is always empty until v1.11.3.

The unified engine (`engine.js`, event → channel fan-out) that *consumes*
this resolver lands in **v1.11.2**.
