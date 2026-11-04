import { supabase } from '../lib/supabase';

/** Cycle goals & habit tracker, tied to cycle phases. Stored in user_prefs. */

export type HabitId = 'water' | 'sleep' | 'exercise' | 'vitamins' | 'meditation' | 'tracking';

export const HABITS: { id: HabitId; emoji: string; label: string; phaseTip?: string }[] = [
  { id: 'water', emoji: '💧', label: 'Hydration', phaseTip: 'Luteal: drink more water to ease bloating' },
  { id: 'sleep', emoji: '😴', label: '8h Sleep', phaseTip: 'Menstrual: prioritize rest' },
  { id: 'exercise', emoji: '🏃‍♀️', label: 'Movement', phaseTip: 'Follicular: best time for intense workouts' },
  { id: 'vitamins', emoji: '💊', label: 'Vitamins / Iron', phaseTip: 'Menstrual: iron-rich foods & supplements' },
  { id: 'meditation', emoji: '🧘‍♀️', label: 'Mindfulness', phaseTip: 'PMS/Luteal: helps mood swings' },
  { id: 'tracking', emoji: '📝', label: 'Logged my day', phaseTip: 'Keep the streak — better predictions!' },
];

export interface HabitDayRecord {
  dateKey: string; // yyyy-MM-dd
  habits: Partial<Record<HabitId, boolean>>;
}

const PREF_KEY = 'habit_log_v1';

type PrefRow = { prefs: Record<string, any> };

async function readPrefs(userId: string): Promise<Record<string, any>> {
  const { data, error } = await supabase
    .from('user_prefs')
    .select('prefs')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return {};
  return ((data as PrefRow).prefs || {}) as Record<string, any>;
}

async function writePrefs(userId: string, prefs: Record<string, any>): Promise<void> {
  const { error } = await supabase
    .from('user_prefs')
    .upsert({ user_id: userId, prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** Load habit records (falls back to localStorage when table not provisioned). */
export async function loadHabitLog(userId: string | null): Promise<Record<string, HabitDayRecord>> {
  if (!userId) return localLoad();
  try {
    const prefs = await readPrefs(userId);
    const remote = (prefs[PREF_KEY] || {}) as Record<string, HabitDayRecord>;
    // merge with local so nothing is lost during migration
    const merged = { ...localLoad(), ...remote };
    localSave(merged);
    return merged;
  } catch {
    return localLoad();
  }
}

export async function toggleHabit(userId: string | null, dateKey: string, habit: HabitId): Promise<Record<string, HabitDayRecord>> {
  const log = await loadHabitLog(userId);
  const day = log[dateKey] || { dateKey, habits: {} };
  day.habits[habit] = !day.habits[habit];
  log[dateKey] = day;
  localSave(log);
  if (userId) {
    try {
      const prefs = await readPrefs(userId);
      prefs[PREF_KEY] = log;
      await writePrefs(userId, prefs);
    } catch {
      /* will retry next toggle; local copy is source of truth meanwhile */
    }
  }
  return log;
}

/** Current consecutive-day streak (any habit completed counts as a day). */
export function computeStreak(log: Record<string, HabitDayRecord>, todayKey: string): number {
  let streak = 0;
  const d = new Date(todayKey);
  // allow "today" to be incomplete without breaking streak — start counting from yesterday if today empty
  const hasAny = (key: string) => {
    const rec = log[key];
    return !!rec && Object.values(rec.habits).some(Boolean);
  };
  let cursor = d;
  if (!hasAny(fmt(cursor))) cursor = addDaysD(cursor, -1);
  while (hasAny(fmt(cursor))) {
    streak++;
    cursor = addDaysD(cursor, -1);
  }
  return streak;
}

function addDaysD(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---- localStorage fallback helpers ----
const LS_KEY = 'pt_habit_log_local';

function localLoad(): Record<string, HabitDayRecord> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}

function localSave(log: Record<string, HabitDayRecord>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(log));
  } catch {
    /* storage full — ignore */
  }
}
