# notifications/ — (reserved)

Placeholder for the server-side Notification Engine and channel dispatchers.

Nothing here yet — added in later sub-phases:

- **v1.11.1.3** — `telegram.js`: server-side Telegram send (moves the bot
  token off the browser; reproduces `js/telegram.js` behavior exactly).
- **v1.11.2+** — `engine.js`: unified event → channel fan-out (in-app, push,
  Telegram) with one recipient resolver.

See `docs/PUSH_NOTIFICATION_ARCHITECTURE.md` (Phase 3) for the design.
