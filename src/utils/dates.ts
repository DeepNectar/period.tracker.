import { format, differenceInDays, differenceInHours, differenceInMinutes, addDays, parseISO, startOfDay } from 'date-fns';
import { PeriodEntry } from '../lib/supabase';

export function formatFullDateTime(isoString: string): string {
  const date = parseISO(isoString);
  return format(date, 'EEEE, d MMMM yyyy • hh:mm:ss a');
}

export function formatShortDateTime(isoString: string): string {
  const date = parseISO(isoString);
  return format(date, 'd MMM yyyy, hh:mm:ss a');
}

export function formatDuration(startISO: string, endISO: string | null): string {
  const start = parseISO(startISO);
  const end = endISO ? parseISO(endISO) : new Date();
  
  const days = differenceInDays(end, start);
  const hours = differenceInHours(end, start) % 24;
  const minutes = differenceInMinutes(end, start) % 60;
  
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
  parts.push(`${minutes} min`);
  
  return parts.join(', ');
}

export function getDaysBetween(date1: string, date2: string): number {
  return Math.abs(differenceInDays(parseISO(date1), parseISO(date2)));
}

export function predictNextPeriod(lastPeriodStart: string, avgCycleLength: number): string {
  const start = parseISO(lastPeriodStart);
  return addDays(start, avgCycleLength).toISOString();
}

export function predictFertileWindow(periodStart: string, avgCycleLength: number): { start: string; end: string; ovulation: string } {
  const start = parseISO(periodStart);
  const ovulationDay = addDays(start, avgCycleLength - 14);
  const fertileStart = addDays(ovulationDay, -5);
  const fertileEnd = addDays(ovulationDay, 1);
  return {
    start: fertileStart.toISOString(),
    end: fertileEnd.toISOString(),
    ovulation: ovulationDay.toISOString()
  };
}

// Cycle phase calculation
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal' | 'pms';

export function getCyclePhase(date: Date, lastPeriodStart: string, avgCycleLength: number, avgPeriodDuration: number): { phase: CyclePhase; dayInPhase: number; totalPhaseDays: number } {
  const start = startOfDay(parseISO(lastPeriodStart));
  const checkDate = startOfDay(date);
  const daysSinceStart = differenceInDays(checkDate, start);
  
  // Normalize to current cycle
  const cycleDay = ((daysSinceStart % avgCycleLength) + avgCycleLength) % avgCycleLength;
  
  if (cycleDay < avgPeriodDuration) {
    return { phase: 'menstrual', dayInPhase: cycleDay + 1, totalPhaseDays: avgPeriodDuration };
  } else if (cycleDay < avgCycleLength - 14 - 5) {
    // Follicular phase: after period until 5 days before ovulation
    const follicularStart = avgPeriodDuration;
    const follicularEnd = avgCycleLength - 14 - 5;
    return { phase: 'follicular', dayInPhase: cycleDay - follicularStart + 1, totalPhaseDays: follicularEnd - follicularStart };
  } else if (cycleDay < avgCycleLength - 14 + 1) {
    // Fertile/Ovulation window
    return { phase: 'ovulation', dayInPhase: cycleDay - (avgCycleLength - 14 - 5) + 1, totalPhaseDays: 7 };
  } else if (cycleDay < avgCycleLength - 5) {
    // Luteal phase
    const lutealStart = avgCycleLength - 14 + 1;
    const lutealEnd = avgCycleLength - 5;
    return { phase: 'luteal', dayInPhase: cycleDay - lutealStart + 1, totalPhaseDays: lutealEnd - lutealStart };
  } else {
    // PMS phase (last 5 days before period)
    return { phase: 'pms', dayInPhase: cycleDay - (avgCycleLength - 5) + 1, totalPhaseDays: 5 };
  }
}

export function getPhaseInfo(phase: CyclePhase): { label: string; emoji: string; color: string; description: string } {
  switch (phase) {
    case 'menstrual':
      return { label: 'Menstrual', emoji: '🩸', color: 'red', description: 'Your period phase. Rest and self-care.' };
    case 'follicular':
      return { label: 'Follicular', emoji: '🌱', color: 'green', description: 'Energy rising. Great time for new projects.' };
    case 'ovulation':
      return { label: 'Ovulation', emoji: '🥚', color: 'purple', description: 'Peak fertility window. Highest energy.' };
    case 'luteal':
      return { label: 'Luteal', emoji: '🌙', color: 'blue', description: 'Winding down. Focus on calm activities.' };
    case 'pms':
      return { label: 'PMS', emoji: '🌸', color: 'pink', description: 'Pre-menstrual. Be gentle with yourself.' };
  }
}

export function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];
  
  const startPadding = firstDay.getDay();
  for (let i = startPadding - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }
  
  const endPadding = 6 - lastDay.getDay();
  for (let i = 1; i <= endPadding; i++) {
    days.push(new Date(year, month + 1, i));
  }
  
  return days;
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate();
}

export function isDateInRange(date: Date, startISO: string, endISO: string | null): boolean {
  const start = parseISO(startISO);
  const end = endISO ? parseISO(endISO) : new Date();
  const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const checkStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const checkEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return checkDate >= checkStart && checkDate <= checkEnd;
}

// Calculate cycle stats from entries
export function calculateCycleStats(entries: PeriodEntry[]) {
  const completedEntries = entries
    .filter(e => e.status === 'completed' && e.end_datetime)
    .sort((a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime());

  if (completedEntries.length === 0) {
    return { avgCycleLength: 28, avgPeriodDuration: 5, cycleLengths: [], periodDurations: [] };
  }

  // Cycle lengths
  const cycleLengths: number[] = [];
  for (let i = 0; i < completedEntries.length - 1; i++) {
    const days = differenceInDays(
      parseISO(completedEntries[i].start_datetime),
      parseISO(completedEntries[i + 1].start_datetime)
    );
    if (days > 0 && days < 60) cycleLengths.push(days);
  }

  // Period durations
  const periodDurations = completedEntries.map(e => {
    return differenceInDays(parseISO(e.end_datetime!), parseISO(e.start_datetime));
  });

  const avgCycleLength = cycleLengths.length > 0
    ? Math.round(cycleLengths.slice(0, 6).reduce((a, b) => a + b, 0) / Math.min(cycleLengths.length, 6))
    : 28;
  
  const avgPeriodDuration = periodDurations.length > 0
    ? Math.round(periodDurations.slice(0, 6).reduce((a, b) => a + b, 0) / Math.min(periodDurations.length, 6))
    : 5;

  return { avgCycleLength, avgPeriodDuration, cycleLengths, periodDurations };
}
