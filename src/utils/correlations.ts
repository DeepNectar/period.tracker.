import { PeriodEntry } from '../lib/supabase';
import { DailyLog, DailyLogFull, LifestyleData, getCyclePhase } from './dailyLog';
import { calculateCycleStats } from './dates';
import { differenceInCalendarDays, parseISO, format } from 'date-fns';

/**
 * Symptom ↔ phase correlation engine.
 * Analyzes daily logs against cycle phases and surfaces patterns like
 * "Cramps appear in the luteal phase in 80% of your cycles".
 */

export interface SymptomPattern {
  symptom: string;
  totalOccurrences: number;
  byPhase: Record<string, number>; // phase -> count
  dominantPhase: string;
  dominance: number; // 0..1 share of occurrences in dominant phase
  avgCycleDay: number; // average day-of-cycle it appears
  insight: string;
}

function dayOfCycle(entryStartISO: string, logDateKey: string): number | null {
  const diff = differenceInCalendarDays(parseISO(logDateKey), parseISO(entryStartISO));
  return diff >= 0 ? diff + 1 : null;
}

/** Find the most recent period start on or before a given day. */
function lastStartBefore(entries: PeriodEntry[], dayKey: string): PeriodEntry | null {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
  );
  let found: PeriodEntry | null = null;
  for (const e of sorted) {
    if (format(parseISO(e.start_datetime), 'yyyy-MM-dd') <= dayKey) found = e;
    else break;
  }
  return found;
}

export function analyzeSymptomCorrelations(
  entries: PeriodEntry[],
  logs: Array<Pick<DailyLog, 'log_date' | 'symptoms'>>
): SymptomPattern[] {
  if (entries.length === 0 || logs.length === 0) return [];
  const stats = calculateCycleStats(entries);

  const acc: Record<string, { phases: Record<string, number>; days: number[] }> = {};

  for (const log of logs) {
    const symptoms = log.symptoms || [];
    if (symptoms.length === 0) continue;
    const start = lastStartBefore(entries, log.log_date);
    if (!start) continue;
    const doc = dayOfCycle(start.start_datetime, log.log_date);
    if (doc === null) continue;
    const phaseInfo = getCyclePhase(
      log.log_date,
      start.start_datetime,
      stats.avgCycleLength,
      stats.avgPeriodDuration
    );
    if (!phaseInfo) continue;
    // `phases` is Record<string, number>, so a plain string phase key is fine here.
    const phase: string = phaseInfo.phase;

    for (const s of symptoms) {
      acc[s] = acc[s] || { phases: {}, days: [] };
      acc[s].phases[phase] = (acc[s].phases[phase] || 0) + 1;
      acc[s].days.push(doc);
    }
  }

  const patterns: SymptomPattern[] = [];
  for (const [symptom, { phases, days }] of Object.entries(acc)) {
    const total = days.length;
    if (total < 2) continue; // need a bit of history before claiming a pattern
    const entriesByPhase = Object.entries(phases).sort((a, b) => b[1] - a[1]);
    const [dominantPhase, dominantCount] = entriesByPhase[0];
    const dominance = dominantCount / total;
    const avgCycleDay = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
    const pct = Math.round(dominance * 100);
    const insight =
      dominance >= 0.6
        ? `"${symptom}" shows up in your ${dominantPhase} phase ${pct}% of the time (usually around cycle day ${avgCycleDay}).`
        : `"${symptom}" appears across phases — most often in ${dominantPhase} (${pct}%).`;
    patterns.push({
      symptom,
      totalOccurrences: total,
      byPhase: phases,
      dominantPhase,
      dominance,
      avgCycleDay,
      insight,
    });
  }

  return patterns.sort((a, b) => b.totalOccurrences - a.totalOccurrences);
}

/** Irregularity check: flag cycles deviating > ±7 days from personal average. */
export interface IrregularityAlert {
  cycleIndex: number;
  length: number;
  deviation: number;
  message: string;
}

export function detectIrregularities(entries: PeriodEntry[]): IrregularityAlert[] {
  const completed = entries
    .filter((e) => e.status === 'completed' && e.end_datetime)
    .sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());
  if (completed.length < 3) return [];

  const lengths: number[] = [];
  for (let i = 1; i < completed.length; i++) {
    lengths.push(
      differenceInCalendarDays(
        parseISO(completed[i].start_datetime),
        parseISO(completed[i - 1].start_datetime)
      )
    );
  }
  const avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
  const alerts: IrregularityAlert[] = [];
  lengths.forEach((len, idx) => {
    const dev = len - avg;
    if (Math.abs(dev) >= 7) {
      alerts.push({
        cycleIndex: idx + 1,
        length: len,
        deviation: dev,
        message: `Cycle ${idx + 1} was ${len} days — ${Math.abs(dev)} days ${dev > 0 ? 'longer' : 'shorter'} than your ${avg}-day average.`,
      });
    }
  });
  return alerts;
}

// ---------- Module 2: Lifestyle ↔ symptom correlation engine ----------

export interface LifestyleInsight {
  id: string;
  emoji: string;
  insight: string;
  strength: number; // 0..1 rough confidence weight
}

interface DayRecord {
  dateKey: string;
  phase: string | null;
  painLevel: number | null; // 1-10 (derived from intensity if slider not set)
  symptoms: string[];
  lifestyle: LifestyleData | null;
}

const INTENSITY_TO_LEVEL: Record<string, number> = { Mild: 2, Moderate: 5, Severe: 8 };

function buildDayRecords(entries: PeriodEntry[], logs: DailyLogFull[]): DayRecord[] {
  const stats = calculateCycleStats(entries);
  const daily = logs.filter((l) => l.log_type === 'daily');
  const recs: DayRecord[] = [];
  for (const log of daily) {
    const start = lastStartBefore(entries, log.log_date);
    let phase: string | null = null;
    if (start) {
      const p = getCyclePhase(log.log_date, start.start_datetime, stats.avgCycleLength, stats.avgPeriodDuration);
      phase = p ? p.phase : null;
    }
    let painLevel: number | null = null;
    if (typeof log.pain_level === 'number') painLevel = log.pain_level;
    else if (log.pain_intensity) painLevel = INTENSITY_TO_LEVEL[log.pain_intensity] ?? null;
    recs.push({
      dateKey: log.log_date,
      phase,
      painLevel,
      symptoms: log.symptoms || [],
      lifestyle: (log as any).lifestyle || null,
    });
  }
  return recs;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

/**
 * Correlates lifestyle logs with symptoms/pain. Surfaces patterns like
 * "You report higher cramps on days with <6 hours of sleep."
 */
export function analyzeLifestyleCorrelations(
  entries: PeriodEntry[],
  logs: DailyLogFull[]
): LifestyleInsight[] {
  if (entries.length === 0 || logs.length === 0) return [];
  const days = buildDayRecords(entries, logs);
  const withLifestyle = days.filter((d) => d.lifestyle);
  if (withLifestyle.length < 3) return []; // need some history before claiming patterns

  const insights: LifestyleInsight[] = [];

  // 1. Sleep vs pain
  const shortSleep = withLifestyle.filter((d) => (d.lifestyle!.sleepHours ?? 99) < 6 && d.painLevel != null);
  const goodSleep = withLifestyle.filter((d) => (d.lifestyle!.sleepHours ?? 0) >= 7 && d.painLevel != null);
  if (shortSleep.length >= 2 && goodSleep.length >= 2) {
    const diff = avg(shortSleep.map((d) => d.painLevel!)) - avg(goodSleep.map((d) => d.painLevel!));
    if (diff >= 1.5) {
      insights.push({
        id: 'sleep-pain',
        emoji: '😴',
        insight: `On nights with under 6 hours of sleep, your pain runs ${diff.toFixed(1)} points higher (avg ${avg(shortSleep.map((d) => d.painLevel!)).toFixed(1)}/10 vs ${avg(goodSleep.map((d) => d.painLevel!)).toFixed(1)}/10). Prioritise rest around your period.`,
        strength: Math.min(1, (shortSleep.length + goodSleep.length) / 12),
      });
    }
  }

  // 2. Stress vs pain
  const highStress = withLifestyle.filter((d) => (d.lifestyle!.stressLevel ?? 0) >= 7 && d.painLevel != null);
  const lowStress = withLifestyle.filter((d) => (d.lifestyle!.stressLevel ?? 99) <= 4 && d.painLevel != null);
  if (highStress.length >= 2 && lowStress.length >= 2) {
    const diff = avg(highStress.map((d) => d.painLevel!)) - avg(lowStress.map((d) => d.painLevel!));
    if (diff >= 1.5) {
      insights.push({
        id: 'stress-pain',
        emoji: '🧘‍♀️',
        insight: `High-stress days (7+/10) come with ${diff.toFixed(1)} more pain points than calm days. Breathing exercises or a walk may genuinely reduce symptoms.`,
        strength: Math.min(1, (highStress.length + lowStress.length) / 12),
      });
    }
  }

  // 3. Exercise type vs cycle phase mood
  const exerciseDays = withLifestyle.filter((d) => d.lifestyle!.exerciseType && d.lifestyle!.exerciseType !== 'None');
  if (exerciseDays.length >= 3) {
    const moodsByExercise: Record<string, number> = {};
    for (const d of exerciseDays) {
      const t = d.lifestyle!.exerciseType!;
      moodsByExercise[t] = (moodsByExercise[t] || 0) + 1;
    }
    const top = Object.entries(moodsByExercise).sort((a, b) => b[1] - a[1])[0];
    insights.push({
      id: 'exercise-fav',
      emoji: '🏃‍♀️',
      insight: `${top[0]} is your most-logged movement (${top[1]} days). Keep it up — regular gentle exercise eases cramps and lifts mood in most users' data.`,
      strength: Math.min(1, exerciseDays.length / 15),
    });
  }

  // 4. Diet tags vs symptoms
  const sugary = withLifestyle.filter((d) => (d.lifestyle!.dietNotes || []).some((n) => /sugar|salty|caffeine|alcohol/i.test(n)));
  const bloatedOrCravings = sugary.filter((d) => d.symptoms.some((s) => /bloating|cravings|acne|headache/i.test(s)));
  if (sugary.length >= 3 && bloatedOrCravings.length / sugary.length >= 0.6) {
    insights.push({
      id: 'diet-symptoms',
      emoji: '🍫',
      insight: `On days you log "high sugar / caffeine / salty" meals, ${Math.round((bloatedOrCravings.length / sugary.length) * 100)}% also include bloating, cravings or headaches. Try balanced meals in your luteal phase.`,
      strength: Math.min(1, sugary.length / 10),
    });
  }

  // 5. Hydration vs fatigue
  const lowWater = withLifestyle.filter((d) => (d.lifestyle!.waterLiters ?? 99) < 1.5);
  const fatiguedLowWater = lowWater.filter((d) => d.symptoms.includes('Fatigue'));
  if (lowWater.length >= 3 && fatiguedLowWater.length / lowWater.length >= 0.5) {
    insights.push({
      id: 'water-fatigue',
      emoji: '💧',
      insight: `Days under 1.5 L of water coincide with fatigue ${Math.round((fatiguedLowWater.length / lowWater.length) * 100)}% of the time. A water bottle reminder could help, especially during your period.`,
      strength: Math.min(1, lowWater.length / 10),
    });
  }

  return insights.sort((a, b) => b.strength - a.strength);
}

/** Symptom frequency heatmap data: rows = symptoms, cols = cycle day (1..maxDay). */
export interface HeatmapData {
  symptoms: string[];
  maxDay: number;
  counts: Record<string, Record<number, number>>; // symptom -> cycleDay -> count
}

export function buildSymptomHeatmap(entries: PeriodEntry[], logs: Array<Pick<DailyLog, 'log_date' | 'symptoms'>>): HeatmapData {
  const counts: Record<string, Record<number, number>> = {};
  let maxDay = 28;
  for (const log of logs) {
    const start = lastStartBefore(entries, log.log_date);
    if (!start) continue;
    const doc = dayOfCycle(start.start_datetime, log.log_date);
    if (doc === null) continue;
    maxDay = Math.max(maxDay, Math.min(45, doc));
    for (const s of log.symptoms || []) {
      counts[s] = counts[s] || {};
      counts[s][doc] = (counts[s][doc] || 0) + 1;
    }
  }
  const symptoms = Object.keys(counts).sort(
    (a, b) =>
      Object.values(counts[b]).reduce((x, y) => x + y, 0) -
      Object.values(counts[a]).reduce((x, y) => x + y, 0)
  );
  return { symptoms: symptoms.slice(0, 8), maxDay, counts };
}

/** Phase-tailored advice library (Module 7: personalized content). */
export const PHASE_CONTENT: Record<string, { title: string; tips: string[] }> = {
  menstrual: {
    title: 'Menstrual phase — slow down & restore',
    tips: [
      'Iron-rich foods (leafy greens, lentils, red meat) replace what you lose.',
      'Gentle yoga or walking can reduce cramps more than bed-rest.',
      'Journaling or a favourite show: emotional bandwidth is lowest now.',
    ],
  },
  follicular: {
    title: 'Follicular phase — ramp up',
    tips: [
      'Estrogen is climbing — great window for new projects and hard workouts.',
      'Skin usually clears; good time to change skincare routines.',
      'Social energy returns — schedule the things that drain you later.',
    ],
  },
  fertile: {
    title: 'Fertile window — peak energy',
    tips: [
      'Confidence and verbal fluency tend to peak — nail that presentation.',
      'Track cervical mucus to confirm fertility signs.',
      'Strength training often feels easiest right now.',
    ],
  },
  ovulation: {
    title: 'Ovulation — your spotlight day',
    tips: [
      'Most fertile ~24h window; libido commonly rises.',
      'Some feel mittelschmerz — a one-sided twinge. Normal.',
      'Plan important conversations today.',
    ],
  },
  luteal: {
    title: 'Luteal phase — PMS window',
    tips: [
      'Progesterone rises; cravings and bloating are common — not a failure of willpower.',
      'Complex carbs, magnesium-rich foods and steady sleep reduce PMS severity.',
      'Lower workout intensity; prioritise recovery and stress reduction.',
    ],
  },
};
