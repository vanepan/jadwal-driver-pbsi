Telegram Integration Notes

- Frontend never stores or exposes the Telegram bot token.
- Provide a server-side relay at `/api/telegram` that accepts POST { chatId, message } and forwards to Telegram Bot API using a secure token.
- Example serverless suggestions: Vercel Serverless Function, Firebase Cloud Function, Express endpoint.

Chat ID Help

- User flow: Open bot -> /start -> /myid -> copy Chat ID -> paste into PBSI app

Migration notes

- Users with legacy `telegramChatId` are migrated to `telegramChatIds.primary` on first update.
- New driver accounts store up to 3 chat IDs in `telegramChatIds`.
