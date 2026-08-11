'use strict';

/* ============================================================
   USER-PROFILES-STORE.JS — RTDB Security Hardening Program, Phase 6
   (v1.30.6.10)

   Read-only client for /userProfiles/{username}: {username, displayName,
   role, active, archived, archivedAt} — the minimal, broadly-readable
   mirror functions/src/users/onUserWrite.js keeps in sync from /users.
   Never credentials, never telegramChatIds, never notificationsEnabled,
   never timestamps.

   This is the store every consumer that only needs to RESOLVE a name/role
   for display purposes should use going forward — Engineering personnel,
   Gudang's Bidang roster, the notification bell's display-name resolver,
   and app.js's post-action driver-identity stamping. Admin screens and
   the self-profile modal keep reading js/users.js's full /users store
   (already admin-gated or self-scoped) — they legitimately need the
   private fields this store never carries.

   Mirrors js/users.js's LOAD/SUB state-machine convention exactly (a
   permission-denied read never poisons the cache).
   ============================================================ */

import { subscribeNode, readNode, isFirebaseConfigured } from './firebase.js';

const PROFILES_PATH = 'userProfiles';

const LOAD = { UNLOADED: 'UNLOADED', LOADING: 'LOADING', LOADED: 'LOADED' };
const SUB = { IDLE: 'IDLE', SUBSCRIBING: 'SUBSCRIBING', SUBSCRIBED: 'SUBSCRIBED' };

let profiles = [];
let loadState = LOAD.UNLOADED;
let subState = SUB.IDLE;
let unsubscribe = null;

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
}

function mapFirebaseProfiles(value) {
  const raw = value || {};
  // id === username, matching js/users.js#mapFirebaseUsers()'s shape exactly
  // so a consumer switched over from that store sees no field difference.
  return Object.keys(raw).map((key) => ({ id: key, username: key, ...raw[key] }));
}

function refreshCache(next) {
  profiles = next;
  loadState = LOAD.LOADED;
}

/** Idempotent, re-entrant — safe to call on every session boot. */
export async function initUserProfilesStore() {
  if (!isFirebaseConfigured()) { refreshCache([]); return; }
  if (subState !== SUB.IDLE) return;
  subState = SUB.SUBSCRIBING;
  if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
  unsubscribe = subscribeNode(
    PROFILES_PATH,
    (snapshot) => {
      refreshCache(mapFirebaseProfiles(snapshot.val()));
      subState = SUB.SUBSCRIBED;
    },
    {
      onDenied: () => { subState = SUB.IDLE; loadState = LOAD.UNLOADED; },
      onError: () => { subState = SUB.IDLE; loadState = LOAD.UNLOADED; },
    }
  );
}

export function resetUserProfilesStore() {
  if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
  subState = SUB.IDLE;
  loadState = LOAD.UNLOADED;
  profiles = [];
}

export async function getUserProfiles() {
  if (loadState === LOAD.LOADED) return profiles;
  const res = await readNode(PROFILES_PATH);
  if (res.status === 'ok') refreshCache(mapFirebaseProfiles(res.value));
  return profiles;
}

export function getUserProfileList() {
  return profiles;
}

export function getUserProfileByUsername(username) {
  if (!username) return null;
  const normalized = normalizeUsername(username);
  return profiles.find((p) => normalizeUsername(p.username) === normalized) || null;
}
