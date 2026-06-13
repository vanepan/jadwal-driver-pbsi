# telegram/ — Server Telegram Foundation (v1.11.1.3)

Moves Telegram send off the browser. **Dormant/shadow this release** —
`window.TELEGRAM_API_BASE_URL` stays unset and browser Telegram remains
the primary, live path. No cutover, no removal of the existing bot-token flow.

| File | Role |
|---|---|
| `sendMessage.js` | Core send to `api.telegram.org` (urlencoded + `parse_mode=Markdown`), reproducing `js/telegram.js` on the wire. Token supplied from Secret Manager. Returns a structured result (no throw on Telegram errors). |
| `retry.js` | `sendWithRetry()` — exponential backoff, honors `429 retry_after`, classifies terminal errors (`400 chat not found`, `403 blocked`) so stale chat IDs can be flagged. |
| `deliveryLog.js` | `recordDelivery()` → append `/telegram_deliveries/{id}` + emit a `notification.sent` event. Closes the audit loop. |
| `proxyEndpoint.js` | HTTP `{ chatId, message }` ingress matching `telegram.js` proxy mode — the one-line cutover lever. Requires a Firebase ID token (not an open relay) and binds `TELEGRAM_BOT_TOKEN`. **Not wired to the client.** |

Set the secret before deploy:

```
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
```

Engine routing through this sender (and the actual cutover) lands in **v1.11.2**.
