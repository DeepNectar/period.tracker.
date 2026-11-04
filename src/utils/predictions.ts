import { PeriodEntry } from '../lib/supabase';
import { calculateCycleStats, predictNextPeriod, predictFertileWindow } from './dates';
import { differenceInDays, parseISO, addDays, format } from 'date-fns';

export interface PredictionResult {
  // Inputs used
  avgCycleLength: number;
  avgPeriodDuration: number;
  cycleLengths: number[];
  periodDurations: number[];
  completedCount: number;
  totalLogged: number;
  hasData: boolean;
  confidence: 'low' | 'medium' | 'high';
  confidenceLabel: string;
  // Predictions
  lastPeriodStart: string | null;
  nextPeriodDate: string | null;
  daysUntilNextPeriod: number | null;
  followingPeriodDate: string | null;   // the one after next (for longer horizon)
  ovulationDate: string | null;
  fertileStart: string | null;
  fertileEnd: string | null;
  daysUntilOvulation: number | null;
  isPeriodLate: boolean;
  lateByDays: number;
}

export function buildPredictions(entries: PeriodEntry[]): PredictionResult {
  const stats = calculateCycleStats(entries);
  const completedEntries = entries.filter(e => e.status === 'completed' && e.end_datetime);

  const lastEntry = entries.length > 0 ? entries[0] : null;
  const lastStartISO = lastEntry ? lastEntry.start_datetime : null;

  const hasData = !!lastStartISO;
  const today = new Date();

  let nextPeriodDate: string | null = null;
  let followingPeriodDate: string | null = null;
  let ovulationDate: string | null = null;
  let fertileStart: string | null = null;
  let fertileEnd: string | null = null;

  if (hasData) {
    nextPeriodDate = predictNextPeriod(lastStartISO!, stats.avgCycleLength);
    followingPeriodDate = addDays(parseISO(nextPeriodDate), stats.avgCycleLength).toISOString();
    const fw = predictFertileWindow(lastStartISO!, stats.avgCycleLength);
    ovulationDate = fw.ovulation;
    fertileStart = fw.start;
    fertileEnd = fw.end;
  }

  const daysUntilNextPeriod = nextPeriodDate ? differenceInDays(parseISO(nextPeriodDate), today) : null;
  const daysUntilOvulation = ovulationDate ? differenceInDays(parseISO(ovulationDate), today) : null;

  // A period counts as "late" if we're past the predicted start and no active period was logged.
  const activeEntry = entries.find(e => e.status === 'active');
  const isPeriodLate = daysUntilNextPeriod !== null && daysUntilNextPeriod < 0 && !activeEntry;
  const lateByDays = isPeriodLate ? Math.abs(daysUntilNextPeriod!) : 0;

  // Confidence based on how many cycles of data we have + variability
  const recentCycles = stats.cycleLengths.slice(0, 6);
  const variability = recentCycles.length > 1
    ? Math.max(...recentCycles) - Math.min(...recentCycles)
    : 999;

  let confidence: 'low' | 'medium' | 'high' = 'low';
  let confidenceLabel = 'Add at least one completed cycle for predictions';
  if (!hasData) {
    confidence = 'low';
  } else if (completedEntries.length >= 3 && variability <= 7) {
    confidence = 'high';
    confidenceLabel = `Based on ${Math.min(completedEntries.length, 6)} regular cycles`;
  } else if (completedEntries.length >= 2 || completedEntries.length >= 1) {
    confidence = 'medium';
    confidenceLabel = completedEntries.length >= 2
      ? `Based on ${completedEntries.length} cycles`
      : 'Based on your first cycle — add more for better accuracy';
    if (variability > 14) {
      confidence = 'low';
      confidenceLabel = 'Your cycles vary a lot — predictions are approximate';
    }
  }

  return {
    avgCycleLength: stats.avgCycleLength,
    avgPeriodDuration: stats.avgPeriodDuration,
    cycleLengths: stats.cycleLengths,
    periodDurations: stats.periodDurations,
    completedCount: completedEntries.length,
    totalLogged: entries.length,
    hasData,
    confidence,
    confidenceLabel,
    lastPeriodStart: lastStartISO,
    nextPeriodDate,
    daysUntilNextPeriod,
    followingPeriodDate,
    ovulationDate,
    fertileStart,
    fertileEnd,
    daysUntilOvulation,
    isPeriodLate,
    lateByDays,
  };
}

export function formatDateShort(iso: string | null): string {
  if (!iso) return '—';
  return format(parseISO(iso), 'EEE, d MMM');
}

export function formatDateRange(startISO: string | null, endISO: string | null): string {
  if (!startISO || !endISO) return '—';
  return `${format(parseISO(startISO), 'd MMM')} – ${format(parseISO(endISO), 'd MMM yyyy')}`;
}

// Countdown text like period-tracker.org shows ("in X days", "today", "X days ago")
export function countdownLabel(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'Today 🎯';
  if (days === 1) return 'Tomorrow';
  if (days > 0) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}
