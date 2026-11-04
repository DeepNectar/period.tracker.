import { PeriodEntry } from '../lib/supabase';
import { DailyLog } from './dailyLog';

/** CSV / JSON export & import for backups and doctor visits. */

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(Array.isArray(value) ? value.join('; ') : value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
}

export function periodsToCsv(entries: PeriodEntry[]): string {
  return toCsv(
    ['id', 'start_datetime', 'end_datetime', 'status', 'flow', 'symptoms', 'notes', 'created_at'],
    entries.map((e) => [e.id, e.start_datetime, e.end_datetime, e.status, e.flow, e.symptoms, e.notes, e.created_at])
  );
}

export function dailyLogsToCsv(logs: DailyLog[]): string {
  return toCsv(
    ['log_date', 'type', 'flow', 'symptoms', 'moods', 'pain_intensity', 'discharge', 'notes'],
    logs.map((l) => [l.log_date, l.log_type, l.flow, l.symptoms, l.moods, l.pain_intensity, l.discharge, l.notes])
  );
}

export interface BackupBundle {
  app: 'period-tracker';
  version: 1;
  exportedAt: string;
  periodEntries: PeriodEntry[];
  dailyLogs?: DailyLog[];
}

export function buildBackupJson(entries: PeriodEntry[], logs?: DailyLog[]): BackupBundle {
  return {
    app: 'period-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    periodEntries: entries,
    dailyLogs: logs,
  };
}

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Parse a backup JSON file. Throws on invalid shape. */
export async function parseBackupFile(file: File): Promise<BackupBundle> {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.periodEntries)) {
    throw new Error('This file does not look like a Period Tracker backup (missing periodEntries).');
  }
  return data as BackupBundle;
}
