# scheduled/ — (reserved)

Placeholder for scheduled (cron) functions.

Nothing here yet — added in a later sub-phase:

- **v1.11.4** — `reminders.js`: H-1 / H-2 reminders on a Cloud Scheduler
  trigger. Replaces the current client-side `setInterval` reminders
  (`js/notification-service.js`), which only fire while a browser tab is
  open. Server scheduling makes them fire exactly once, globally.
