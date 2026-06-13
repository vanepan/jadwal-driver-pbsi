# events/ — Event Foundation (v1.11.1.3)

Canonical, versioned event stream. **`/logs` is never touched** — `/events`
is a new, append-only, audit/replay-capable outbox.

| File | Role |
|---|---|
| `schema.js` | Canonical envelope (`id, type, version, timestamp, actor, entity, payload`), `ENVELOPE_VERSION`, legacy `/logs` action map, `validateEnvelope`, append-only `writeEvent`. |
| `publishEvent.js` | Callable — client → `/events`. Restricted to `CLIENT_PUBLISHABLE` (only `comment.added`); actor taken from the verified token. |
| `onAssignmentWrite.js` | Trigger on `/assignments/{id}` → `assignment.*` events (created/updated/started/completed/cancelled/deleted) from true state transitions. |
| `onRequestWrite.js` | Trigger on `/driver_requests/{id}` → `request.*` events (created/updated/approved/rejected). |
| `onEventWrite.js` | **VALIDATION-ONLY** subscriber: asserts envelope integrity + runs `resolveRecipients()` in shadow. No fan-out, no sending. |

Envelope field names (`version`/`timestamp`/`entity`/`payload`) are authoritative.
The older draft names (`v`/`ts`/`subject`/`metadata`) are retired.

Fan-out / engine consumption lands in **v1.11.2**.
