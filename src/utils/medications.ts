import { todayKey } from './dailyLog';

/**
 * Module 4 — Medication & supplement reminder system.
 * Remeds are stored locally (privacy-first) and fire browser notifications
 * when due; taken/missed status is tracked per day.
 */

export type MedSchedule = 'daily' | 'every-day' | 'weekly' | 'period-only';

export interface Medication {
  id: string;
  name: string;
  dosage: string; // e.g. "1 pill", "400 mg"
  time: string; // "HH:mm"
  emoji: string;
  enabled: boolean;
  createdAt: string;
}

export interface MedStatus {
  takenAt: string | null; // ISO datetime when marked taken
  missedMarked: boolean;
}

const LS_MEDS_KEY = 'pt_medications_v1';
const LS_STATUS_KEY = 'pt_med_status_v1'; // `${medId}:${yyyy-MM-dd}` -> MedStatus

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `med-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function loadMedications(): Medication[] {
  try {
    return JSON.parse(localStorage.getItem(LS_MEDS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveMedications(meds: Medication[]): void {
  localStorage.setItem(LS_MEDS_KEY, JSON.stringify(meds));
}

export function addMedication(input: Omit<Medication, 'id' | 'createdAt'>): Medication[] {
  const meds = loadMedications();
  meds.push({ ...input, id: uid(), createdAt: new Date().toISOString() });
  saveMedications(meds);
  return meds;
}

export function updateMedication(id: string, patch: Partial<Medication>): Medication[] {
  const meds = loadMedications().map((m) => (m.id === id ? { ...m, ...patch } : m));
  saveMedications(meds);
  return meds;
}

export function deleteMedication(id: string): Medication[] {
  const meds = loadMedications().filter((m) => m.id !== id);
  saveMedications(meds);
  return meds;
}

// ---------- Taken / missed status ----------

function statusKey(medId: string, dayKey: string): string {
  return `${medId}:${dayKey}`;
}

function loadStatusAll(): Record<string, MedStatus> {
  try {
    return JSON.parse(localStorage.getItem(LS_STATUS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function getMedStatus(medId: string, dayKey: string = todayKey()): MedStatus | null {
  return loadStatusAll()[statusKey(medId, dayKey)] || null;
}

export function markMedTaken(medId: string, dayKey: string = todayKey()): void {
  const all = loadStatusAll();
  all[statusKey(medId, dayKey)] = { takenAt: new Date().toISOString(), missedMarked: false };
  localStorage.setItem(LS_STATUS_KEY, JSON.stringify(all));
}

export function markMedMissed(medId: string, dayKey: string = todayKey()): void {
  const all = loadStatusAll();
  all[statusKey(medId, dayKey)] = { takenAt: null, missedMarked: true };
  localStorage.setItem(LS_STATUS_KEY, JSON.stringify(all));
}

export function clearMedStatus(medId: string, dayKey: string = todayKey()): void {
  const all = loadStatusAll();
  delete all[statusKey(medId, dayKey)];
  localStorage.setItem(LS_STATUS_KEY, JSON.stringify(all));
}

/** Adherence rate over the last N days (taken / scheduled). */
export function adherenceRate(medId: string, days = 14): { taken: number; scheduled: number; pct: number } {
  const all = loadStatusAll();
  let taken = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (all[statusKey(medId, key)]?.takenAt) taken++;
  }
  return { taken, scheduled: days, pct: Math.round((taken / days) * 100) };
}

// ---------- Reminder scheduler (local notifications) ----------

const FIRED_KEY = 'pt_med_fired_v1'; // medId:dayKey -> true (avoid double-fire)

function firedMap(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Check all enabled medications against the current time and fire a local
 * notification once per med per day when its time has passed. Call on an
 * interval (e.g. every minute) while the app is open.
 */
export function runMedReminderCheck(notify: (title: string, body: string) => void): void {
  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dayK = todayKey();
  const fired = firedMap();
  let changed = false;

  for (const med of loadMedications()) {
    if (!med.enabled) continue;
    const key = statusKey(med.id, dayK);
    if (fired[key]) continue;
    if (hhmm >= med.time) {
      const status = getMedStatus(med.id, dayK);
      if (!status?.takenAt) {
        notify(`${med.emoji} ${med.name}`, `Time to take ${med.dosage}. Open the app to mark it taken.`);
        fired[key] = true;
        changed = true;
      }
    }
  }
  if (changed) localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
}

/** Prune fired-marker map so it doesn't grow forever. */
export function pruneFiredMarkers(): void {
  const dayK = todayKey();
  const fired = firedMap();
  const next: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(fired)) if (k.endsWith(dayK)) next[k] = v;
  localStorage.setItem(FIRED_KEY, JSON.stringify(next));
}
