'use strict';

/* ============================================================
   Cloud Functions entry point — Sarpras Operations backend.

   v1.11.1.3 Server Telegram + Event Foundation.

   Exports:
     • health        — deployment smoke test (active, side-effect free)
     • verifyPin      — ACTIVE custom-auth entry (login)

     ── Event Foundation (shadow) ──
     • publishEvent       — callable: client → /events (comment.added)
     • onAssignmentWrite  — /assignments trigger → assignment.* events
     • onRequestWrite     — /driver_requests trigger → request.* events
     • onEventWrite       — VALIDATION-ONLY subscriber (no fan-out)

     ── Server Telegram Foundation (dormant/shadow) ──
     • telegramProxy  — HTTP { chatId, message } ingress, Secret Manager
                        token, retry + delivery tracking. NOT wired to the
                        client (browser Telegram remains primary).

   No production cutover. /logs is untouched. Browser Telegram is the
   live notification path. Engine fan-out, push, and reminders are later
   releases (v1.11.2 / .3 / .4 / .5).
   ============================================================ */

const { health } = require('./src/health');
const { verifyPin } = require('./src/auth/verifyPin');
const { createUserCredential, resetUserCredential, changeMyCredential } = require('./src/auth/credentialCallables');

const { publishEvent } = require('./src/events/publishEvent');
const { onAssignmentWrite } = require('./src/events/onAssignmentWrite');
const { onRequestWrite } = require('./src/events/onRequestWrite');
const { onEngineeringAssignmentWrite } = require('./src/events/onEngineeringAssignmentWrite');
const { onEventWrite } = require('./src/events/onEventWrite');

const { telegramProxy } = require('./src/telegram/proxyEndpoint');
const { telegramWebhook } = require('./src/telegram/webhookEndpoint');

const { registerPushSubscription, unregisterPushSubscription } = require('./src/push/callables');

const { onAssignmentReminderSync } = require('./src/reminders/onAssignmentReminderSync');
const { reminderTick } = require('./src/reminders/tick');

const { exportAnalyticsReport } = require('./src/exports/analytics');

const { backupTick } = require('./src/maintenance/backupTick');
const { acquireReimbursementNumber } = require('./src/reimbursement/counter');

const { onUserWrite } = require('./src/users/onUserWrite');
const { notifyAdminsOfNewRequest } = require('./src/notifications/notifyAdminsOfNewRequest');

const { generateCompletion } = require('./src/intelligence/generateCompletion');
const { intelligenceConversation } = require('./src/intelligence/intelligenceConversation');
const { intelligenceNorDraft } = require('./src/intelligence/intelligenceNorDraft');
const { intelligenceNorRegistry } = require('./src/intelligence/intelligenceNorRegistry');
const { intelligenceNorGeneration } = require('./src/intelligence/intelligenceNorGeneration');

exports.health = health;
exports.verifyPin = verifyPin;

/* Credential Service callables (v1.30.6.2, Emergency Credential Security
   Patch) — the only write path into /users/{username}.pin / .pinHash.
   createUserCredential/resetUserCredential are admin-only; changeMyCredential
   is self-service, scoped to the caller's own uid. See
   src/auth/credentialService.js for the shared logic and
   docs/CREDENTIAL_SECURITY_PATCH_v1.30.6.2.md for the full design. */
exports.createUserCredential = createUserCredential;
exports.resetUserCredential = resetUserCredential;
exports.changeMyCredential = changeMyCredential;

exports.publishEvent = publishEvent;
exports.onAssignmentWrite = onAssignmentWrite;
exports.onRequestWrite = onRequestWrite;

/* Engineering Operations (v1.20.4) — /engineering/assignments trigger →
   engineering.* events. Rides the existing /events → onEventWrite → engine
   pipeline (in-app + Web Push). No parallel notification system. */
exports.onEngineeringAssignmentWrite = onEngineeringAssignmentWrite;

exports.onEventWrite = onEventWrite;

exports.telegramProxy = telegramProxy;

/* Telegram inbound webhook (/start, /myid). Set Telegram's setWebhook to
   this function's URL with secret_token = TELEGRAM_WEBHOOK_SECRET. This is
   the endpoint Telegram POSTs updates to — NOT telegramProxy (outbound). */
exports.telegramWebhook = telegramWebhook;

/* Push Subscription Registry (v1.11.3) — server-only write path into
   /push_subscriptions. Subscription send lives inside onEventWrite via
   the dispatcher; these only register/unregister devices. */
exports.registerPushSubscription = registerPushSubscription;
exports.unregisterPushSubscription = unregisterPushSubscription;

/* Reminder Engine (v1.11.4) — backend-only, dormant until REMINDER_FLAGS.enabled.
   onAssignmentReminderSync maintains the /reminders timer queue on /assignments
   writes; reminderTick (Cloud Scheduler, every 5 min, Asia/Jakarta) mints
   assignment.reminder events that ride the EXISTING engine→dispatcher pipeline.
   No parallel delivery path. */
exports.onAssignmentReminderSync = onAssignmentReminderSync;
exports.reminderTick = reminderTick;

/* Analytics Export (v1.12.0, Phase A) — server-side PDF render of the
   approved Analytics Export design via headless Chrome (Puppeteer). The
   browser DocumentEngine 'puppeteer' backend calls this; the approved
   HTML/CSS prototype is rendered verbatim so design ≡ output. Phase A
   ships the 'poc' foundation template only. See
   Analytics Export/IMPLEMENTATION_ARCHITECTURE.md §7. */
exports.exportAnalyticsReport = exportAnalyticsReport;

/* RTDB Security Hardening Program, Phase 3 (v1.30.6.6) — moves /backups
   and /reimbursement_counters off client RTDB access entirely, the same
   "Client -> Cloud Function -> Admin SDK -> RTDB, .write: false" pattern
   already used by the Credential Service and push subscriptions.
   backupTick replaces the old client-side, localStorage-guarded
   once-a-day opportunistic backup with a real Cloud Scheduler job.
   acquireReimbursementNumber replaces a client-side runTransaction()
   with a server-side atomic increment. */
exports.backupTick = backupTick;
exports.acquireReimbursementNumber = acquireReimbursementNumber;

/* RTDB Security Hardening Program, Phase 6 (v1.30.6.10) — the /users ->
   /userProfiles split. onUserWrite mirrors the safe display subset into
   the new broadly-readable node; notifyAdminsOfNewRequest replaces the
   one client-side consumer that needed broad admin-record read access
   (Telegram fan-out) with a server-side equivalent, closing that gap
   before it could reopen the exposure this split exists to close. */
exports.onUserWrite = onUserWrite;
exports.notifyAdminsOfNewRequest = notifyAdminsOfNewRequest;

/* V2 Sarpras Intelligence — the Phase 1 OpenAI server boundary, now wired
   (Phase 2A). HTTPS callable v2, region asia-southeast1, OPENAI_API_KEY bound
   from Secret Manager (functions/src/config/secrets.js). Server-side it keeps
   every Phase 1 guarantee: admin-only authorization (serverPermissions.js),
   the /feature_flags/intelligence gate (default OFF → a typed DISABLED result,
   never a thrown error), ModelCompletionRequest envelope + maxPromptChars
   validation, generic provider-error mapping, and no retry. The browser calls
   it via js/firebase.js#callGenerateCompletion and never receives the key.

   INERT as shipped: OPENAI_API_KEY is not set, the feature flag is OFF, and no
   deploy has run. A `firebase deploy --only functions` requires the secret to
   exist first (`firebase functions:secrets:set OPENAI_API_KEY`). See
   docs/V2_SARPRAS_INTELLIGENCE_PHASE_1.md §3 and §13. */
exports.generateCompletion = generateCompletion;

/* V2 Sarpras Intelligence — Phase 2C server-owned conversation state. HTTPS
   callable v2, region asia-southeast1, NO secrets. Thin persistence boundary
   for /intelligence_conversations/{convId}: authenticates, authorizes
   (admin pilot, same gate as generateCompletion), derives the owner ONLY
   from request.auth.uid (never a client-supplied actorId), and reads/writes
   via the Admin SDK (RTDB rule ".write": false — this is the sole writer).
   op ∈ create | get | append. Cross-owner get/append → FORBIDDEN.

   STAGED: wired here but NOT deployed. The /intelligence_conversations RTDB
   rule (database.rules.json, staged since Phase 1) must be deployed alongside
   it. See docs/V2_SARPRAS_INTELLIGENCE_PHASE_2C.md. */
exports.intelligenceConversation = intelligenceConversation;

/* V2 Sarpras Intelligence — Phase 4 server-owned NOR draft & review. HTTPS
   callable v2, region asia-southeast1, NO secrets. Sibling of
   intelligenceConversation: same admin-role authorization (Phase 3C), owner
   is ALWAYS request.auth.uid, reads/writes /intelligence_nor_drafts/{draftId}
   via the Admin SDK (RTDB rule ".write": false). op ∈ create | get | update
   | list. Cross-owner get/update → FORBIDDEN. numbering.publishedNumber is
   forced null — this callable never publishes, numbers, approves, or mutates
   the NOR Registry / organizational knowledge. */
exports.intelligenceNorDraft = intelligenceNorDraft;

/* V2 Sarpras Intelligence — Phase 5 canonical NOR Registry & HUMAN
   publication. HTTPS callable v2, region asia-southeast1, NO secrets. Same
   effective-admin authorization as every other Intelligence callable (Phase
   3C: role === 'admin' || adminEquivalent). Actor is ALWAYS request.auth.uid;
   cross-owner access → FORBIDDEN envelope. Reads/writes
   /intelligence_nor_registry/{norId} via the Admin SDK (RTDB rule
   ".write": false). op ∈ register | get | list | sync | approve | publish |
   history. `register` / `sync` re-read the linked /intelligence_nor_drafts
   record server-side — the client injects no NOR content. Lifecycle
   in_review → approved → published is human-gated with optimistic
   concurrency; `publish` reserves ONE official sequence atomically +
   idempotently (/intelligence_nor_registry_counters, root deny-by-default,
   precedent functions/src/reimbursement/counter.js) and a published record
   is immutable. Never touches V1 Petty Cash / generateNor() / V1 NOR data /
   the feature flag / organizational knowledge. */
exports.intelligenceNorRegistry = intelligenceNorRegistry;

/* V2 Sarpras Intelligence — Phase 6A server-authoritative activation of the
   Phase 6 Certified Retrieval → NOR Generation boundary. HTTPS callable v2,
   region asia-southeast1, NO secrets. Same effective-admin authorization as
   every other Intelligence callable. READ-ONLY: gathers the approved Style
   Guide + Visual Template records (organization-wide) from their stores,
   composes the Phase 5.x.7 certified retrieval context, then runs the
   Phase 6 deterministic gate + style/visual projection. Returns ONE
   `intelligence-generation-context@1`. The client controls ONLY
   `documentType` (validated) — it CANNOT claim certification, authority
   state, approval metadata, a rule/template id, or scope; every such field
   is ignored server-side. Never generates NOR text, never assembles or
   persists a draft, never touches the NOR Registry / numbering /
   publication / Petty Cash / V1. See
   docs/V2_SARPRAS_INTELLIGENCE_PHASE_6A_SERVER_AUTHORITATIVE_ACTIVATION.md.

   The companion hardening — intelligenceNorDraft's `create` now verifies
   (never blindly persists) a submitted provenance.generationContext against
   these SAME canonical stores before writing (generationContextVerifier.js)
   — ships in this same phase without a separate export. */
exports.intelligenceNorGeneration = intelligenceNorGeneration;
