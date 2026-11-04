import { useEffect, useMemo, useState } from 'react';
import { PeriodEntry } from '../lib/supabase';
import { useToast } from './Toast';
import { CollapsibleCard } from './CollapsibleCard';
import {
  FLOW_OPTIONS,
  FLOW_DETAIL_OPTIONS,
  SYMPTOM_OPTIONS,
  EMOTIONAL_SYMPTOM_OPTIONS,
  MOOD_OPTIONS,
  DISCHARGE_OPTIONS,
  painLevelToIntensity,
  intensityToPainLevel,
} from '../lib/constants';
import {
  DailyLogFull,
  LifestyleData,
  todayKey,
  fetchLogsForDay,
  saveDailyCheckIn,
  saveLifestyle,
  addEventLog,
  deleteLog,
  getCyclePhase,
  emptyLifestyle,
} from '../utils/dailyLog';
import { calculateCycleStats } from '../utils/dates';
import { buildPredictions, countdownLabel } from '../utils/predictions';
import { PHASE_CONTENT } from '../utils/correlations';
import { LifestyleSection } from './LifestyleSection';
import { MedicationReminders } from './MedicationReminders';
import { format } from 'date-fns';
import { CalendarPlus, Heart, Pill, Dumbbell, Trash2, Save } from 'lucide-react';

interface Props {
  entries: PeriodEntry[];
  onStartPeriod: (flow: string | null, symptoms: string[], notes: string | null) => Promise<any>;
}

const EVENT_META: Record<string, { label: string; emoji: string }> = {
  intercourse: { label: 'Intercourse', emoji: '💞' },
  exercise: { label: 'Exercise', emoji: '🏃‍♀️' },
  medication: { label: 'Medication', emoji: '💊' },
};

export function TodayScreen({ entries, onStartPeriod }: Props) {
  const { showToast } = useToast();
  const dayKey = useMemo(() => todayKey(), []);

  const [logs, setLogs] = useState<DailyLogFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Check-in form state
  const [flow, setFlow] = useState<string | null>(null);
  const [flowDetails, setFlowDetails] = useState<string[]>([]);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [painLevel, setPainLevel] = useState<number | null>(null);
  const [discharge, setDischarge] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [lifestyle, setLifestyle] = useState<LifestyleData>(emptyLifestyle());

  // Quick-add modal
  const [quickType, setQuickType] = useState<'intercourse' | 'exercise' | 'medication' | null>(null);
  const [quickNotes, setQuickNotes] = useState('');

  // Accordion state: expanding one box collapses the previously open one.
  const [openBoxId, setOpenBoxId] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await fetchLogsForDay(dayKey);
      setLogs(data);
      const daily = data.find((l) => l.log_type === 'daily');
      if (daily) {
        setFlow(daily.flow);
        setSymptoms(daily.symptoms || []);
        setMoods(daily.moods || []);
        setPainLevel(
          typeof daily.pain_level === 'number' ? daily.pain_level : intensityToPainLevel(daily.pain_intensity)
        );
        setFlowDetails(daily.flow_details || []);
        setDischarge(daily.discharge);
        setNotes(daily.notes || '');
        setLifestyle(daily.lifestyle || emptyLifestyle());
      }
    } catch (e: any) {
      showToast('Could not load today\'s log: ' + (e?.message || ''), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);

  const stats = useMemo(() => calculateCycleStats(entries), [entries]);
  const predictions = useMemo(() => buildPredictions(entries), [entries]);
  const phase = useMemo(
    () => getCyclePhase(dayKey, predictions.lastPeriodStart, stats.avgCycleLength, stats.avgPeriodDuration),
    [dayKey, predictions.lastPeriodStart, stats]
  );

  const dailyLog = logs.find((l) => l.log_type === 'daily') || null;
  const eventLogs = logs.filter((l) => l.log_type !== 'daily');

  const painIntensity = painLevelToIntensity(painLevel);
  const hasAnyField =
    flow || symptoms.length || moods.length || painLevel || discharge || notes.trim() || flowDetails.length;

  const handleSave = async () => {
    if (!hasAnyField) {
      showToast('Add something to your check-in first 🙂', 'info');
      return;
    }
    try {
      setSaving(true);
      const saved = await saveDailyCheckIn(
        dayKey,
        {
          flow,
          symptoms,
          moods,
          pain_intensity: painIntensity,
          pain_level: painLevel,
          flow_details: flowDetails,
          discharge,
          notes: notes.trim() || null,
        },
        dailyLog?.id
      );
      // Persist lifestyle data on the (possibly newly created) daily row.
      await saveLifestyle(dayKey, lifestyle, saved.id);
      await load();
      showToast('Today saved! ✅', 'success');
    } catch (e: any) {
      showToast('Save failed: ' + (e?.message || 'Please run the daily_logs migration'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLifestyleOnly = async () => {
    try {
      setSaving(true);
      await saveLifestyle(dayKey, lifestyle, dailyLog?.id);
      await load();
      showToast('Lifestyle logged 🌿', 'success');
    } catch (e: any) {
      showToast('Save failed: ' + (e?.message || ''), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickAdd = async () => {
    if (!quickType) return;
    try {
      await addEventLog(dayKey, quickType, quickNotes.trim() || null);
      await load();
      showToast(`${EVENT_META[quickType].emoji} ${EVENT_META[quickType].label} logged`, 'success');
      setQuickType(null);
      setQuickNotes('');
    } catch (e: any) {
      showToast('Could not log: ' + (e?.message || 'Please run the daily_logs migration'), 'error');
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await deleteLog(id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (e: any) {
      showToast('Delete failed', 'error');
    }
  };

  const toggle = (arr: string[], value: string, setter: (v: string[]) => void) => {
    setter(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
      active
        ? 'bg-pink-500 text-white border-pink-500'
        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-pink-300'
    }`;

  return (
    <div className="screen-pad py-3 space-y-3 max-w-xl mx-auto">
      {/* Header / date */}
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-pink-400 font-semibold">Today</p>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
          {format(new Date(dayKey), 'EEEE, d MMMM')}
        </h2>
      </div>

      {/* Status card: period prediction + current phase */}
      <div className="bg-gradient-to-br from-pink-500 to-purple-500 rounded-3xl p-5 text-white shadow-lg">
        {predictions.hasData ? (
          <>
            <p className="text-xs opacity-80">Next period</p>
            <p className="text-lg font-bold">{countdownLabel(predictions.daysUntilNextPeriod)}</p>
            {phase && (
              <div className="mt-3 bg-white/15 rounded-2xl p-3">
                <p className="text-sm font-semibold">
                  {phase.emoji} You're in your {phase.label.toLowerCase()}
                </p>
                <p className="text-xs opacity-90 mt-1">{phase.description}</p>
              </div>
            )}
          </>
        ) : (
          <div>
            <p className="text-sm font-semibold">Start tracking to see your predictions</p>
            <button
              onClick={() => onStartPeriod(null, [], null)}
              className="mt-3 inline-flex items-center gap-2 bg-white text-pink-600 px-4 py-2 rounded-xl text-sm font-semibold"
            >
              <CalendarPlus size={16} /> Start my period
            </button>
          </div>
        )}
      </div>

      {/* What to expect — collapsible */}
      {phase && (
        <CollapsibleCard
          id="expect"
          groupId="today-boxes"
          openId={openBoxId}
          onToggle={setOpenBoxId}
          className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-pink-100 dark:border-gray-700"
          headerClassName="p-4"
          bodyClassName="px-4 pb-4"
          title="💡 What to expect right now"
          subtitle={`${phase.emoji} ${phase.label} phase`}
        >
          <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1 list-disc pl-4">
            {phase.phase === 'menstrual' && (
              <>
                <li>Cramping and fatigue are normal — gentle movement can help.</li>
                <li>Stay hydrated; iron-rich foods replace what's lost.</li>
              </>
            )}
            {phase.phase === 'follicular' && (
              <>
                <li>Energy is likely rising — a good window for intense workouts.</li>
                <li>Skin may clear up as estrogen climbs.</li>
              </>
            )}
            {(phase.phase === 'fertile' || phase.phase === 'ovulation') && (
              <>
                <li>Peak fertility days — note changes in cervical mucus.</li>
                <li>If avoiding pregnancy, use protection on these days.</li>
              </>
            )}
            {phase.phase === 'luteal' && (
              <>
                <li>PMS like bloating or mood shifts may show up.</li>
                <li>Prioritise sleep and lower-intensity exercise.</li>
              </>
            )}
          </ul>
        </CollapsibleCard>
      )}

      {/* Quick actions — collapsible */}
      <CollapsibleCard
        id="quicklog"
        groupId="today-boxes"
        openId={openBoxId}
        onToggle={setOpenBoxId}
        className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-pink-100 dark:border-gray-700"
        headerClassName="p-4"
        bodyClassName="px-4 pb-4"
        title="Quick log"
        subtitle={eventLogs.length > 0 ? `${eventLogs.length} logged today` : 'Intercourse · Exercise · Medication'}
      >
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setQuickType('intercourse')}
            className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300 text-xs font-medium hover:bg-rose-100 transition-colors"
          >
            <Heart size={18} /> Intercourse
          </button>
          <button
            onClick={() => setQuickType('exercise')}
            className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 text-xs font-medium hover:bg-purple-100 transition-colors"
          >
            <Dumbbell size={18} /> Exercise
          </button>
          <button
            onClick={() => setQuickType('medication')}
            className="flex flex-col items-center gap-1 py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300 text-xs font-medium hover:bg-amber-100 transition-colors"
          >
            <Pill size={18} /> Medication
          </button>
        </div>

        {eventLogs.length > 0 && (
          <div className="mt-3 space-y-2">
            {eventLogs.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2"
              >
                <span className="text-xs text-gray-700 dark:text-gray-200">
                  {EVENT_META[l.log_type]?.emoji} {EVENT_META[l.log_type]?.label}
                  {l.notes ? ` — ${l.notes}` : ''}
                </span>
                <button
                  onClick={() => handleDeleteEvent(l.id)}
                  className="text-gray-400 hover:text-red-400"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </CollapsibleCard>

      {/* Daily check-in — collapsible */}
      <CollapsibleCard
        id="checkin"
        groupId="today-boxes"
        openId={openBoxId}
        onToggle={setOpenBoxId}
        className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-pink-100 dark:border-gray-700"
        headerClassName="p-4"
        bodyClassName="px-4 pb-4 space-y-4"
        title="📝 How was your day?"
        subtitle={dailyLog ? 'Check-in saved — tap to edit' : 'Flow · Symptoms · Mood · Pain · Notes'}
      >

        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Spotting / flow</p>
          <div className="flex flex-wrap gap-2">
            {FLOW_OPTIONS.map((f) => (
              <button key={f} onClick={() => setFlow(flow === f ? null : f)} className={chip(flow === f)}>
                {f}
              </button>
            ))}
          </div>
          {flow && (
            <div className="flex flex-wrap gap-2 mt-2">
              {FLOW_DETAIL_OPTIONS.slice(0, 2).map((d) => (
                <button
                  key={d}
                  onClick={() =>
                    setFlowDetails((prev) => (prev.includes(d) ? prev.filter((v) => v !== d) : [...prev, d]))
                  }
                  className={`${chip(flowDetails.includes(d))} !text-[11px]`}
                >
                  + {d}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Physical symptoms</p>
          <div className="flex flex-wrap gap-2">
            {SYMPTOM_OPTIONS.map((s) => (
              <button key={s} onClick={() => toggle(symptoms, s, setSymptoms)} className={chip(symptoms.includes(s))}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Emotional symptoms</p>
          <div className="flex flex-wrap gap-2">
            {EMOTIONAL_SYMPTOM_OPTIONS.map((s) => (
              <button key={s} onClick={() => toggle(symptoms, s, setSymptoms)} className={chip(symptoms.includes(s))}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Mood</p>
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map((m) => (
              <button
                key={m.label}
                onClick={() => toggle(moods, m.label, setMoods)}
                className={`${chip(moods.includes(m.label))} flex items-center gap-1`}
              >
                <span>{m.emoji}</span> {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
              Pain level{' '}
              {painLevel != null && (
                <span className={painLevel >= 7 ? 'text-red-500' : painLevel >= 4 ? 'text-amber-500' : 'text-green-600'}>
                  {painLevel}/10 · {painIntensity}
                </span>
              )}
            </p>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={painLevel ?? 1}
              onChange={(e) => setPainLevel(Number(e.target.value))}
              className="w-full accent-pink-500"
            />
            <div className="flex justify-between mt-1">
              <button onClick={() => setPainLevel(null)} className="text-[10px] text-gray-400 hover:text-pink-500">
                Clear
              </button>
              <span className="text-[10px] text-gray-400">1 = mild · 10 = severe</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Discharge</p>
            <div className="flex flex-wrap gap-2">
              {DISCHARGE_OPTIONS.slice(0, 4).map((d) => (
                <button key={d} onClick={() => setDischarge(discharge === d ? null : d)} className={chip(discharge === d)}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Module 2: lifestyle & habit correlation logger */}
        <LifestyleSection value={lifestyle} onChange={setLifestyle} onSave={handleSaveLifestyleOnly} saving={saving} />

        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Notes</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything else about today…"
            rows={3}
            className="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-800 dark:text-gray-100 resize-none"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-semibold disabled:opacity-60"
        >
          <Save size={16} /> {dailyLog ? 'Update today\'s check-in' : 'Save today\'s check-in'}
        </button>
      </CollapsibleCard>

      {/* Quick-add modal */}
      {quickType && (
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setQuickType(null)}>
          <div
            className="bg-white dark:bg-gray-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 space-y-4 max-h-[85dvh] overflow-y-auto safe-area-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-base font-bold text-gray-800 dark:text-gray-100">
              {EVENT_META[quickType].emoji} Log {EVENT_META[quickType].label.toLowerCase()}
            </h4>
            <textarea
              value={quickNotes}
              onChange={(e) => setQuickNotes(e.target.value)}
              placeholder="Optional notes (e.g. type, dosage)…"
              rows={3}
              className="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 focus:outline-none focus:ring-2 focus:ring-pink-300 text-gray-800 dark:text-gray-100 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setQuickType(null);
                  setQuickNotes('');
                }}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleQuickAdd}
                className="flex-1 py-2.5 rounded-xl bg-pink-500 text-white text-sm font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
