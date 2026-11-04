import { supabase } from '../lib/supabase';

export type LogType = 'daily' | 'intercourse' | 'exercise' | 'medication';

export interface DailyLog {
  id: string;
  log_date: string; // yyyy-MM-dd
  log_type: LogType;
  flow: string | null;
  symptoms: string[] | null;
  moods: string[] | null;
  pain_intensity: string | null;
  discharge: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Extra columns we add on top of daily_logs (kept nullable for older rows). */
export interface DailyLogExtras {
  pain_level: number | null; // 1-10 severity slider
  flow_details: string[] | null; // e.g. ['Clots']
  lifestyle: LifestyleData | null; // Module 2: sleep / water / exercise / diet / stress
}

export type ExerciseType = 'None' | 'Yoga' | 'Cardio' | 'Strength' | 'Walking' | 'Rest day';

export const EXERCISE_TYPES: ExerciseType[] = ['None', 'Yoga', 'Cardio', 'Strength', 'Walking', 'Rest day'];

export const DIET_TAGS = ['High sugar', 'Caffeine heavy', 'Salty', 'Balanced', 'Comfort food', 'Alcohol'] as const;

/** Lifestyle & habit data logged per day (correlated with cycle phase later). */
export interface LifestyleData {
  sleepHours: number | null;
  sleepQuality: number | null; // 1-5 stars
  waterLiters: number | null;
  exerciseType: ExerciseType | null;
  dietNotes: string[] | null;
  stressLevel: number | null; // 1-10
}

export type DailyLogFull = DailyLog & Partial<DailyLogExtras>;

export function emptyLifestyle(): LifestyleData {
  return { sleepHours: null, sleepQuality: null, waterLiters: null, exerciseType: null, dietNotes: null, stressLevel: null };
}

export function hasLifestyle(l: LifestyleData | null | undefined): boolean {
  if (!l) return false;
  return l.sleepHours != null || l.sleepQuality != null || l.waterLiters != null || !!l.exerciseType || !!(l.dietNotes && l.dietNotes.length) || l.stressLevel != null;
}

// ---------- localStorage mirror (offline-first + extras that may not be migrated yet) ----------

const LS_LOGS_KEY = 'pt_daily_logs_local_v1';

function lsLoadAll(): Record<string, DailyLogFull[]> {
  try {
    return JSON.parse(localStorage.getItem(LS_LOGS_KEY) || '{}');
  } catch {
    return {};
  }
}

function lsSaveDay(dayKey: string, logs: DailyLogFull[]) {
  try {
    const all = lsLoadAll();
    all[dayKey] = logs;
    localStorage.setItem(LS_LOGS_KEY, JSON.stringify(all));
  } catch {
    /* storage full — ignore */
  }
}

function lsGetDay(dayKey: string): DailyLogFull[] {
  return lsLoadAll()[dayKey] || [];
}

function lsUpsert(log: DailyLogFull): void {
  const day = lsGetDay(log.log_date).filter((l) => l.id !== log.id);
  day.push(log);
  lsSaveDay(log.log_date, day);
}

function lsDelete(id: string): boolean {
  const all = lsLoadAll();
  let removed = false;
  for (const [k, logs] of Object.entries(all)) {
    const next = logs.filter((l) => {
      if (l.id === id) {
        removed = true;
        return false;
      }
      return true;
    });
    if (removed) all[k] = next;
  }
  if (removed) localStorage.setItem(LS_LOGS_KEY, JSON.stringify(all));
  return removed;
}

/** Merge remote rows with local mirror so extra fields (pain_level, lifestyle…) survive. */
function mergeWithLocal(remote: DailyLog[], dayKey: string): DailyLogFull[] {
  const local = lsGetDay(dayKey);
  const byId = new Map<string, DailyLogFull>();
  for (const l of local) byId.set(l.id, l);
  const out: DailyLogFull[] = remote.map((r) => ({ ...(byId.get(r.id) || {}), ...r }));
  // include local-only rows (created while offline / before migration)
  for (const l of local) {
    if (!remote.some((r) => r.id === l.id)) out.push(l);
  }
  return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function toDayKey(dateISO: string): string {
  return dateISO.slice(0, 10);
}

export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Fetch all logs for a given UTC-offset-free local day key */
export async function fetchLogsForDay(dayKey: string): Promise<DailyLogFull[]> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('log_date', dayKey)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return mergeWithLocal((data || []) as DailyLog[], dayKey);
}

/** Create or update the "daily" check-in log for a day (one per day) */
export async function saveDailyCheckIn(
  dayKey: string,
  fields: Partial<Pick<DailyLog, 'flow' | 'symptoms' | 'moods' | 'pain_intensity' | 'discharge' | 'notes'>> &
    Partial<Pick<DailyLogExtras, 'pain_level' | 'flow_details'>>,
  existingId?: string | null
): Promise<DailyLogFull> {
  const now = new Date().toISOString();
  const id = existingId || cryptoId();
  // Base payload uses the migrated columns; extras ride along in the local mirror.
  const remotePayload: Record<string, any> = {
    log_date: dayKey,
    log_type: 'daily',
    updated_at: now,
    ...fields,
  };
  // Strip unknown extras before talking to Supabase (safe pre-migration).
  const painLevel = fields.pain_level ?? null;
  const flowDetails = fields.flow_details ?? null;
  delete remotePayload.pain_level;
  delete remotePayload.flow_details;

  let saved: DailyLog;
  if (existingId) {
    const { data, error } = await supabase
      .from('daily_logs')
      .update({ ...remotePayload, pain_level: painLevel, flow_details: flowDetails })
      .eq('id', existingId)
      .select()
      .single();
    if (error) throw error;
    saved = data as DailyLog;
  } else {
    const { data, error } = await supabase
      .from('daily_logs')
      .insert({ ...remotePayload, id, created_at: now })
      .select()
      .single();
    if (error) throw error;
    saved = data as DailyLog;
  }

  const full: DailyLogFull = { ...saved, pain_level: painLevel, flow_details: flowDetails };
  lsUpsert(full);
  return full;
}

/** Update only the lifestyle JSON column of the daily check-in (Module 2). */
export async function saveLifestyle(
  dayKey: string,
  lifestyle: LifestyleData,
  existingId?: string | null
): Promise<void> {
  // Always keep the local mirror up to date first (works without migration).
  const day = lsGetDay(dayKey);
  const daily = day.find((l) => l.log_type === 'daily');
  if (daily) daily.lifestyle = lifestyle;
  lsUpsert(
    daily || {
      id: cryptoId(),
      log_date: dayKey,
      log_type: 'daily',
      flow: null,
      symptoms: null,
      moods: null,
      pain_intensity: null,
      discharge: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      lifestyle,
    }
  );
  if (!existingId) return; // no remote row yet — will be created on next check-in save
  try {
    const { error } = await supabase.from('daily_logs').update({ lifestyle, updated_at: new Date().toISOString() }).eq('id', existingId);
    if (error) throw error;
  } catch {
    /* column not migrated yet — local mirror keeps the data */
  }
}

function cryptoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Add an event-type log (intercourse / exercise / medication) for a day */
export async function addEventLog(
  dayKey: string,
  type: Exclude<LogType, 'daily'>,
  notes: string | null
): Promise<DailyLog> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('daily_logs')
    .insert({
      log_date: dayKey,
      log_type: type,
      notes,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  lsUpsert(data as DailyLog);
  return data as DailyLog;
}

export async function deleteLog(id: string): Promise<void> {
  const { error } = await supabase.from('daily_logs').delete().eq('id', id);
  lsDelete(id);
  if (error) throw error;
}

// ---------- Cycle phase helpers (for "what to expect" content) ----------

export interface PhaseInfo {
  phase: 'menstrual' | 'follicular' | 'fertile' | 'ovulation' | 'luteal';
  label: string;
  emoji: string;
  description: string;
}

/**
 * Determine where "today" falls within the predicted cycle using the last
 * period start and average cycle length / period duration.
 */
export function getCyclePhase(
  todayK: string,
  lastPeriodStartISO: string | null,
  avgCycleLength: number,
  avgPeriodDuration: number
): PhaseInfo | null {
  if (!lastPeriodStartISO) return null;
  const start = new Date(lastPeriodStartISO.slice(0, 10));
  const today = new Date(todayK);
  const dayOfCycle = Math.floor((today.getTime() - start.getTime()) / 86400000);
  if (dayOfCycle < 0) return null;

  const clampedCycle = Math.max(21, Math.min(45, avgCycleLength || 28));
  const pd = Math.max(2, Math.min(10, avgPeriodDuration || 5));
  const ovulationDay = clampedCycle - 14;
  const fertileStart = ovulationDay - 5;

  let phase: PhaseInfo['phase'];
  if (dayOfCycle < pd) phase = 'menstrual';
  else if (dayOfCycle < fertileStart) phase = 'follicular';
  else if (dayOfCycle < ovulationDay) phase = 'fertile';
  else if (dayOfCycle <= ovulationDay + 1) phase = 'ovulation';
  else phase = 'luteal';

  const map: Record<PhaseInfo['phase'], Omit<PhaseInfo, 'phase'>> = {
    menstrual: {
      label: 'Menstrual phase',
      emoji: '🌧️',
      description: 'Your period window. Energy may be low — rest, hydrate and eat iron-rich foods.',
    },
    follicular: {
      label: 'Follicular phase',
      emoji: '🌱',
      description: 'Estrogen is rising. Great time for new workouts, creative work and social plans.',
    },
    fertile: {
      label: 'Fertile window',
      emoji: '💗',
      description: 'Conception chances are increasing. Cervical mucus may become clearer and stretchier.',
    },
    ovulation: {
      label: 'Ovulation',
      emoji: '🥚',
      description: 'Most fertile days. You may feel a boost in energy and libido around now.',
    },
    luteal: {
      label: 'Luteal phase',
      emoji: '🌙',
      description: 'Progesterone rises. PMS symptoms like bloating or mood shifts may appear — go easy on yourself.',
    },
  };

  return { phase, ...map[phase] };
}

/** Fetch all logs in an inclusive date range (yyyy-MM-dd keys). */
export async function fetchLogsForRange(startKey: string, endKey: string): Promise<DailyLog[]> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .gte('log_date', startKey)
    .lte('log_date', endKey)
    .order('log_date', { ascending: true });
  if (error) throw error;
  const remote = (data || []) as DailyLog[];
  // Merge the local mirror so lifestyle / pain_level extras are available for analytics.
  const all = lsLoadAll();
  const byId = new Map<string, DailyLogFull>();
  for (const [k, logs] of Object.entries(all)) {
    if (k >= startKey && k <= endKey) for (const l of logs) byId.set(l.id, l);
  }
  const out: DailyLogFull[] = remote.map((r) => ({ ...(byId.get(r.id) || {}), ...r }));
  for (const [id, l] of byId) {
    if (!remote.some((r) => r.id === id)) out.push(l);
  }
  return out.sort((a, b) => a.log_date.localeCompare(b.log_date));
}
