# events/ — (reserved)

Placeholder for authoritative database-trigger functions.

Nothing here yet — added in later sub-phases:

- **v1.11.2+** — `onAssignmentWrite.js`, `onRequestWrite.js`: derive
  notification events from real state changes on `/assignments` and
  `/driver_requests` (rather than forgeable client-written `/logs`).

See `docs/BACKEND_FOUNDATION_ARCHITECTURE.md` (Phase 6) for the event schema.
