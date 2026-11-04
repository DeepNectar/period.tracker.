import { useEffect, useState } from 'react';
import { PeriodEntry } from '../lib/supabase';
import { useToast } from './Toast';
import { FLOW_OPTIONS, SYMPTOM_OPTIONS, EMOTIONAL_SYMPTOM_OPTIONS } from '../lib/constants';
import { DailyLog, toDayKey, fetchLogsForDay, saveDailyCheckIn } from '../utils/dailyLog';
import { format, startOfDay, differenceInCalendarDays } from 'date-fns';
import { PenLine, X, CheckCircle2 } from 'lucide-react';

interface Props {
  day: Date;
  entries: PeriodEntry[];
  onEndPeriod?: (id: string) => Promise<any>;
  onUpdateEntry?: (id: string, updates: Partial<PeriodEntry>) => Promise<any>;
}

/**
 * Bottom-sheet style "Log this day" editor, like the day-by-day logging on
 * period-tracker.org. Lets you mark a day as period start/end and record
 * flow, symptoms & notes for that specific date.
 */
export function DayLogSheet({ day, entries, onEndPeriod, onUpdateEntry }: Props) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [flow, setFlow] = useState<string | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const dayKey = toDayKey(format(startOfDay(day), 'yyyy-MM-dd'));
  const todayK = format(new Date(), 'yyyy-MM-dd');
  const entryOnDay = entries.find((e) => {
    const s = format(startOfDay(new Date(e.start_datetime)), 'yyyy-MM-dd');
    const en = e.end_datetime ? format(startOfDay(new Date(e.end_datetime)), 'yyyy-MM-dd') : null;
    return dayKey >= s && (!en || dayKey <= en);
  }) || null;
  const isFuture = dayKey > todayK;

  const symptomChoices = [...SYMPTOM_OPTIONS.slice(0, 8), ...EMOTIONAL_SYMPTOM_OPTIONS];

  useEffect(() => {
    if (!open) return;
    fetchLogsForDay(dayKey)
      .then((data) => {
        setLogs(data);
        const daily = data.find((l) => l.log_type === 'daily');
        setFlow(daily?.flow || entryOnDay?.flow || null);
        setSymptoms(daily?.symptoms || entryOnDay?.symptoms || []);
        setNotes(daily?.notes || '');
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dayKey]);

  if (isFuture && !entryOnDay) {
    // Future predicted days: nothing to log yet
    return (
      <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
        Tip: you can log flow & notes on today's or past dates.
      </p>
    );
  }

  const handleEndHere = async () => {
    if (!entryOnDay || !onEndPeriod) return;
    try {
      // Set end datetime to 23:59 of the selected day if it's in the past, else now
      let endISO: string;
      if (dayKey === format(new Date(), 'yyyy-MM-dd')) {
        endISO = new Date().toISOString();
      } else {
        const d = new Date(day);
        d.setHours(23, 59, 0, 0);
        endISO = d.toISOString();
      }
      if (onUpdateEntry) {
        await onUpdateEntry(entryOnDay.id, {
          end_datetime: endISO,
          ended_by: new Date().toISOString(),
          status: 'completed',
        });
      } else {
        await onEndPeriod(entryOnDay.id);
      }
      showToast(`Period marked as ended on ${format(day, 'd MMM')} ✅`, 'success');
    } catch (e: any) {
      showToast('Could not update: ' + (e?.message || ''), 'error');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const daily = logs.find((l) => l.log_type === 'daily');
      await saveDailyCheckIn(
        dayKey,
        { flow, symptoms, notes: notes.trim() || null },
        daily?.id
      );
      // Also reflect flow/symptoms onto the period entry itself
      if (entryOnDay && onUpdateEntry) {
        const updates: Partial<PeriodEntry> = {};
        if (flow) updates.flow = flow as PeriodEntry['flow'];
        if (symptoms.length) updates.symptoms = symptoms;
        if (notes.trim()) updates.notes = notes.trim();
        if (Object.keys(updates).length) await onUpdateEntry(entryOnDay.id, updates);
      }
      showToast('Day saved! ✅', 'success');
      setOpen(false);
    } catch (e: any) {
      showToast('Save failed: ' + (e?.message || 'Please run the daily_logs migration'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
      active
        ? 'bg-pink-500 text-white border-pink-500'
        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
    }`;

  const daysIntoPeriod = entryOnDay
    ? differenceInCalendarDays(startOfDay(day), startOfDay(new Date(entryOnDay.start_datetime))) + 1
    : 0;

  return (
    <>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-pink-500 text-white text-xs font-semibold"
        >
          <PenLine size={14} /> Log this day
        </button>
        {entryOnDay?.status === 'active' && onEndPeriod && (
          <button
            onClick={handleEndHere}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-white text-xs font-semibold"
          >
            <CheckCircle2 size={14} /> End period here
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-end justify-center" onClick={() => setOpen(false)}>
          <div
            className="bg-white dark:bg-gray-800 w-full sm:max-w-md rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-gray-800 dark:text-gray-100">
                {format(day, 'EEE, d MMM yyyy')}
              </h4>
              <button onClick={() => setOpen(false)} className="p-2 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {entryOnDay && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                🩸 Period day {daysIntoPeriod}
                {entryOnDay.status === 'active' ? ' (ongoing)' : ''}
              </p>
            )}

            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Flow</p>
              <div className="flex flex-wrap gap-2">
                {FLOW_OPTIONS.map((f) => (
                  <button key={f} onClick={() => setFlow(flow === f ? null : f)} className={chip(flow === f)}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Symptoms</p>
              <div className="flex flex-wrap gap-2">
                {symptomChoices.map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      setSymptoms((prev) => (prev.includes(s) ? prev.filter((v) => v !== s) : [...prev, s]))
                    }
                    className={chip(symptoms.includes(s))}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Notes</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="How did this day go?"
                className="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-800 dark:text-gray-100 resize-none"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-semibold disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save this day'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
