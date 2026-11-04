// Privacy Lock — synced across ALL of the user's devices via Supabase.
//
// How it works:
//  - The PIN itself NEVER leaves the device. Only a PBKDF2 hash (SHA-256,
//    120k iterations, per-user random salt) is stored in the `user_prefs`
//    table under key `privacy_lock`.
//  - Because prefs sync through Supabase, enabling the lock on ONE device
//    means EVERY other device signed into the same account requires the
//    SAME PIN before the app opens. Setting/clearing the PIN on any device
//    propagates to all devices automatically.
//  - Lock state (armed/unarmed) is kept per-device in localStorage, so every
//    device locks immediately when closed/backgrounded/reloaded (see App.tsx).

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Subscribe to real-time changes on the prefs table so a lock enabled/disabled
// on ONE device is reflected on every other device within seconds — even while
// those apps sit open in the background.
const PREFS_TABLE = 'user_prefs';
const LOCK_KEY = 'privacy_lock';

const REALTIME_CHANNEL = 'privacy_lock_sync';
let realtimeBound = false;

function bindRealtime() {
  if (realtimeBound) return;
  realtimeBound = true;
  try {
    supabase
      .channel(REALTIME_CHANNEL)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: PREFS_TABLE },
        () => {
          void refreshPrivacyLock();
        }
      )
      .subscribe();
  } catch {
    // Realtime unavailable (e.g. offline) — focus/refresh polling still works.
  }
}

// Per-device flags (never synced):
const LOCAL_ARMED_KEY = 'pt_privacy_pin_v1'; // stores local copy of hash while locked
const LOCK_UNTIL_KEY = 'pt_lock_until';      // armed-lock timestamp
const SESSION_UNLOCK_KEY = 'pt_unlocked_session'; // marks current tab as unlocked

/** The key App.tsx uses to mark this tab as unlocked for the session. */
export const PRIVACY_SESSION_UNLOCK_KEY = SESSION_UNLOCK_KEY;

export type PrivacyLockConfig = {
  enabled: boolean;
  salt: string | null;
  hash: string | null;
  updated_at: number;
  /** Owner display name — synced so every device shows whose data this is. */
  owner_name?: string | null;
};

const DISABLED: PrivacyLockConfig = { enabled: false, salt: null, hash: null, updated_at: 0, owner_name: null };

let cachedUserId: string | null = null;
let cachedCfg: PrivacyLockConfig = DISABLED;
const listeners = new Set<(cfg: PrivacyLockConfig) => void>();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomSaltHex(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return bytesToHex(a);
}

/** Derive the lock hash from a PIN + salt using PBKDF2-SHA256. */
export async function derivePinHash(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 120_000, hash: 'SHA-256' },
    baseKey,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Best available display name for the signed-in user (or local profile). */
export async function getOwnerName(): Promise<string | null> {
  // 1) Supabase auth metadata (full_name / name set at signup)
  try {
    const { data } = await supabase.auth.getSession();
    const meta = data?.session?.user?.user_metadata ?? {};
    const n = (meta.full_name || meta.name || meta.display_name || '') as string;
    if (n && n.trim()) return n.trim();
  } catch {
    /* offline */
  }
  // 2) Locally stored profile name (Settings / onboarding)
  const local = localStorage.getItem('pt_profile_name');
  if (local && local.trim()) return local.trim();
  return null;
}

/** Store a local profile name so it can appear on the lock screen. */
export function setLocalProfileName(name: string) {
  localStorage.setItem('pt_profile_name', name.trim());
}

function parseRemoteCfg(raw: any): PrivacyLockConfig | null {
  if (raw && typeof raw === 'object' && raw.enabled && raw.hash && raw.salt) {
    return {
      enabled: true,
      salt: String(raw.salt),
      hash: String(raw.hash),
      updated_at: Number(raw.updated_at) || 0,
      owner_name: raw.owner_name ? String(raw.owner_name) : null,
    };
  }
  return null;
}

async function fetchRemoteLock(userId: string): Promise<PrivacyLockConfig> {
  const { data, error } = await supabase
    .from(PREFS_TABLE)
    .select('prefs, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    // Query failed (offline / transient network hiccup). Do NOT treat that as
    // "no lock" — keep whatever we already know so the gate never silently
    // disappears. Fall back to the local copy when we have no prior knowledge.
    if (cachedCfg.enabled) return cachedCfg;
    return readLocalFallbackCfg() ?? DISABLED;
  }
  if (!data) {
    // Row genuinely doesn't exist. If a PIN is armed locally (e.g. offline
    // guest mode), keep honouring it instead of unlocking everything.
    return readLocalFallbackCfg() ?? DISABLED;
  }
  const prefs = (data.prefs ?? {}) as Record<string, any>;
  const remote = parseRemoteCfg(prefs[LOCK_KEY]);
  if (remote) return remote;
  // Remote row exists but has no active lock. Trust the remote state ONLY if
  // it was written after our local copy (i.e. it's a deliberate disable);
  // otherwise keep the local fallback so an offline-enabled PIN still gates.
  const local = readLocalFallbackCfg();
  if (local && local.updated_at >= (Number(data.updated_at ? new Date(data.updated_at).getTime() : 0))) {
    return local;
  }
  return DISABLED;
}

/** Sync the display name into the already-enabled lock config (all devices). */
export async function updateLockOwnerName(name: string): Promise<void> {
  const userId = cachedUserId ?? (await getCurrentUserId());
  if (!userId || !cachedCfg.enabled) return;
  const cfg: PrivacyLockConfig = { ...cachedCfg, owner_name: name.trim() || null, updated_at: Date.now() };
  await writeRemoteLock(userId, cfg);
}

async function writeRemoteLock(userId: string, cfg: PrivacyLockConfig): Promise<boolean> {
  let ok = false;
  try {
    const { data: existing } = await supabase
      .from(PREFS_TABLE)
      .select('prefs')
      .eq('user_id', userId)
      .maybeSingle();

    const prefs = { ...((existing?.prefs ?? {}) as Record<string, any>), [LOCK_KEY]: cfg };

    if (existing) {
      const { error } = await supabase
        .from(PREFS_TABLE)
        .update({ prefs, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      ok = !error;
    } else {
      const { error } = await supabase
        .from(PREFS_TABLE)
        .insert({ user_id: userId, prefs, updated_at: new Date().toISOString() });
      ok = !error;
    }
  } catch {
    ok = false;
  }

  // Keep the local cache / listeners in sync on this device too.
  cachedCfg = cfg;
  emit(cfg);
  return ok;
}

function emit(cfg: PrivacyLockConfig) {
  for (const l of listeners) l(cfg);
}

/** Force a re-read of the synced lock config (e.g. after login). */
export async function refreshPrivacyLock(): Promise<PrivacyLockConfig> {
  bindRealtime(); // ensure cross-device change notifications are active
  const userId = await getCurrentUserId();
  if (!userId) {
    cachedUserId = null;
    cachedCfg = DISABLED;
    emit(cachedCfg);
    return cachedCfg;
  }
  cachedUserId = userId;
  cachedCfg = await fetchRemoteLock(userId);
  emit(cachedCfg);
  return cachedCfg;
}

/**
 * Enable the privacy lock with the given PIN. Synced to every device on the
 * account. Falls back to a local-only lock if the database isn't reachable.
 */
export async function enablePrivacyLock(pin: string, ownerName?: string): Promise<{ ok: boolean; synced: boolean }> {
  const salt = randomSaltHex();
  const hash = await derivePinHash(pin, salt);
  const name = (ownerName && ownerName.trim()) || (await getOwnerName());
  const cfg: PrivacyLockConfig = { enabled: true, salt, hash, updated_at: Date.now(), owner_name: name };

  // Always keep a local copy so the gate works even offline / before auth.
  localStorage.setItem(LOCAL_ARMED_KEY, hash);
  localStorage.setItem('pt_privacy_local_salt', salt);
  if (name) setLocalProfileName(name);

  const userId = await getCurrentUserId();
  let synced = false;
  if (userId) {
    synced = await writeRemoteLock(userId, cfg);
  } else {
    cachedCfg = cfg;
    emit(cfg);
  }
  armLock(); // takes effect immediately on next open/background
  return { ok: true, synced };
}

/** Disable the privacy lock on ALL devices of this account. */
export async function disablePrivacyLock(): Promise<void> {
  clearLocalLockState();
  const userId = cachedUserId ?? (await getCurrentUserId());
  if (userId) {
    await writeRemoteLock(userId, { ...DISABLED, updated_at: Date.now() });
  } else {
    cachedCfg = DISABLED;
    emit(cachedCfg);
  }
}

/** Check a candidate PIN against the synced (or local) hash. */
export async function verifyPrivacyPin(pin: string): Promise<boolean> {
  // Prefer the synced config; fall back to the local copy when offline.
  const cfg = cachedCfg.enabled ? cachedCfg : readLocalFallbackCfg();
  if (!cfg?.enabled || !cfg.salt || !cfg.hash) return false;
  const hash = await derivePinHash(pin, cfg.salt);
  return hash === cfg.hash;
}

function readLocalFallbackCfg(): PrivacyLockConfig | null {
  const hash = localStorage.getItem(LOCAL_ARMED_KEY);
  const salt = localStorage.getItem('pt_privacy_local_salt');
  if (hash && salt) {
    return {
      enabled: true,
      salt,
      hash,
      updated_at: 0,
      owner_name: localStorage.getItem('pt_profile_name'),
    };
  }
  return null;
}

/** The name to show on the lock screen ("This data belongs to …"). */
export function getLockOwnerName(): string | null {
  return cachedCfg.owner_name || localStorage.getItem('pt_profile_name') || null;
}

/** True when a PIN is set on this account (any device) or locally. */
export function hasPrivacyPin(): boolean {
  return cachedCfg.enabled || !!readLocalFallbackCfg();
}

/** Subscribe to changes of the synced lock config. */
export function subscribePrivacyLock(fn: (cfg: PrivacyLockConfig) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React hook exposing the live, cross-device lock config. */
export function usePrivacyLock() {
  const [cfg, setCfg] = useState<PrivacyLockConfig>(cachedCfg);
  useEffect(() => {
    bindRealtime(); // start listening for cross-device changes immediately
    const unsub = subscribePrivacyLock(setCfg);
    // Refresh whenever the tab regains focus / becomes visible — picks up
    // changes made on other devices moments ago (also covers mobile Safari
    // where 'focus' may not fire but 'visibilitychange' does).
    const refresh = () => void refreshPrivacyLock();
    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    refresh();
    return () => {
      unsub();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return cfg;
}

// ---------- Per-device lock state (localStorage) ----------

export function armLock() {
  localStorage.setItem(LOCK_UNTIL_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
}

export function disarmLock() {
  localStorage.removeItem(LOCK_UNTIL_KEY);
}

export function clearLocalLockState() {
  localStorage.removeItem(LOCK_UNTIL_KEY);
  localStorage.removeItem(LOCAL_ARMED_KEY);
  localStorage.removeItem('pt_privacy_local_salt');
  sessionStorage.removeItem(SESSION_UNLOCK_KEY);
}

/**
 * Locked when a PIN exists AND either the lock is armed (app was closed /
 * backgrounded) OR this is a fresh session (reload / new tab / new device).
 */
export function isLocked(): boolean {
  if (!hasPrivacyPin()) return false;
  const until = Number(localStorage.getItem(LOCK_UNTIL_KEY));
  if (Number.isFinite(until) && until > Date.now()) return true;
  return !sessionStorage.getItem(SESSION_UNLOCK_KEY);
}

export function markSessionUnlocked() {
  disarmLock();
  sessionStorage.setItem(SESSION_UNLOCK_KEY, '1');
}

// ---------- Auto-lock timing (per-device preference) ----------

export function getLockTimeout(): 'immediate' | number {
  const raw = localStorage.getItem('pt_lock_timeout_min');
  if (raw === null) return 'immediate';
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return 'immediate';
  return v;
}

export function setLockTimeout(value: 'immediate' | number) {
  localStorage.setItem('pt_lock_timeout_min', value === 'immediate' ? '0' : String(value));
}
