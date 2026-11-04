import { PeriodEntry } from '../lib/supabase';
import { addDays, format, parseISO } from 'date-fns';

/**
 * Calendar (.ics) export — periods + predictions sync into Google / Apple Calendar.
 * Follows RFC 5545: no raw newlines in text fields, CRLF line endings, wrapped lines.
 */

function foldLine(line: string): string {
  // Lines longer than 75 octets must be folded with "space continuation"
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join('\r\n');
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function toIcsDate(d: Date): string {
  return format(d, "yyyyMMdd'T'HHmmss'Z'");
}

function toIcsDay(d: Date): string {
  return format(d, 'yyyyMMdd');
}

interface BuildIcsOptions {
  includePredictions?: boolean;
  avgCycleLength?: number;
  avgPeriodDuration?: number;
}

export function buildIcs(entries: PeriodEntry[], options: BuildIcsOptions = {}): string {
  const { includePredictions = true, avgCycleLength = 28, avgPeriodDuration = 5 } = options;
  const stamp = toIcsDate(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Period Tracker//period-tracker-app//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Period Tracker',
    'X-WR-CALDESC:Period history and predictions exported from Period Tracker',
  ];

  const pushEvent = (
    uid: string,
    summary: string,
    description: string,
    startDay: Date,
    endDayExclusive: Date,
    colorCategory: string
  ) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@period-tracker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcsDay(startDay)}`,
      `DTEND;VALUE=DATE:${toIcsDay(endDayExclusive)}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      `CATEGORIES:${colorCategory}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    );
  };

  // Logged period entries
  for (const e of entries) {
    const start = parseISO(e.start_datetime);
    const end = e.end_datetime ? addDays(parseISO(e.end_datetime), 1) : addDays(start, avgPeriodDuration || 1);
    const statusLabel = e.status === 'active' ? ' (active)' : '';
    pushEvent(
      e.id,
      `🩸 Period${statusLabel} — ${format(start, 'MMM d')}`,
      `Flow: ${e.flow || 'n/a'}\nSymptoms: ${(e.symptoms || []).join(', ') || 'n/a'}\nNotes: ${e.notes || 'n/a'}`,
      start,
      end,
      'PERIOD'
    );
  }

  // Predicted next 3 cycles + fertile windows
  if (includePredictions && entries.length > 0) {
    const sorted = [...entries].sort(
      (a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime()
    );
    const lastStart = parseISO(sorted[0].start_datetime);
    for (let i = 1; i <= 3; i++) {
      const predictedStart = addDays(lastStart, avgCycleLength * i);
      const predictedEnd = addDays(predictedStart, avgPeriodDuration);
      pushEvent(
        `predicted-period-${i}-${predictedStart.getTime()}`,
        `🔮 Predicted period #${i}`,
        'Predicted from your average cycle length. Actual dates may vary.',
        predictedStart,
        predictedEnd,
        'PREDICTION'
      );
      const ovulation = addDays(predictedStart, avgCycleLength - 14);
      const fertileStart = addDays(ovulation, -5);
      const fertileEnd = addDays(ovulation, 1);
      pushEvent(
        `predicted-fertile-${i}-${predictedStart.getTime()}`,
        `💗 Fertile window #${i}`,
        `Ovulation estimated around ${format(ovulation, 'EEE, MMM d')}.`,
        fertileStart,
        addDays(fertileEnd, 1),
        'FERTILE'
      );
    }
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n');
}

export function downloadIcs(entries: PeriodEntry[], options?: BuildIcsOptions): void {
  const blob = new Blob([buildIcs(entries, options)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `period-tracker-${format(new Date(), 'yyyy-MM-dd')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
