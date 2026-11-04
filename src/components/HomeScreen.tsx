import { useState, useMemo } from 'react';
import { LiveClock } from './LiveClock';
import { CollapsibleCard } from './CollapsibleCard';
import { useToast } from './Toast';
import { PeriodEntry } from '../lib/supabase';
import { formatShortDateTime, formatDuration, calculateCycleStats, getCyclePhase, getPhaseInfo, predictFertileWindow, predictNextPeriod } from '../utils/dates';
import { buildPredictions, formatDateShort, countdownLabel } from '../utils/predictions';
import { format, differenceInDays, parseISO, addDays } from 'date-fns';
import { Droplets, Clock, Calendar, ChevronRight, Heart, Sparkles, Moon, Sun, Wrench } from 'lucide-react';
import { CycleRing } from './CycleRing';

const SYMPTOMS = ['Cramps', 'Headache', 'Bloating', 'Fatigue', 'Back pain', 'Acne', 'Nausea', 'Insomnia', 'Cravings', 'Breast tenderness', 'Dizziness'];
const MOODS = ['😊 Happy', '😢 Sad', '😤 Irritable', '😰 Anxious', '😴 Tired', '🥰 Loving', '😐 Neutral', '🤢 Sick'];

type Props = {
  activeEntry: PeriodEntry | null;
  entries: PeriodEntry[];
  onStartPeriod: (flow: string | null, symptoms: string[], notes: string | null) => Promise<any>;
  onNavigate?: (screen: string) => void;
};

export function HomeScreen({ activeEntry, entries, onStartPeriod, onNavigate }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [flow, setFlow] = useState<string>('Medium');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [mood, setMood] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Accordion state: only one collapsible box can be open at a time.
  // Opening another box collapses the previous one; clicking the open box again collapses it.
  const [openBoxId, setOpenBoxId] = useState<string | null>(null);
  const { showToast } = useToast();

  const stats = useMemo(() => calculateCycleStats(entries), [entries]);
  const lastEntry = entries.length > 0 ? entries[0] : null;
  const lastStart = lastEntry ? parseISO(lastEntry.start_datetime) : null;

  // Current cycle day
  const currentCycleDay = lastStart ? differenceInDays(new Date(), lastStart) + 1 : null;
  
  // Current phase
  const currentPhase = useMemo(() => {
    if (!lastStart) return null;
    return getCyclePhase(new Date(), lastStart.toISOString(), stats.avgCycleLength, stats.avgPeriodDuration);
  }, [lastStart, stats]);

  const phaseInfo = currentPhase ? getPhaseInfo(currentPhase.phase) : null;

  // Next period prediction
  const nextPeriodDate = lastStart ? predictNextPeriod(lastStart.toISOString(), stats.avgCycleLength) : null;
  const daysUntilNextPeriod = nextPeriodDate ? differenceInDays(parseISO(nextPeriodDate), new Date()) : null;

  // Ovulation prediction
  const ovulationInfo = useMemo(() => {
    if (!lastStart) return null;
    const fw = predictFertileWindow(lastStart.toISOString(), stats.avgCycleLength);
    return {
      ovulationDay: parseISO(fw.ovulation),
      fertileStart: parseISO(fw.start),
      fertileEnd: parseISO(fw.end),
      daysUntilOvulation: differenceInDays(parseISO(fw.ovulation), new Date())
    };
  }, [lastStart, stats]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const allSymptoms = mood ? [...selectedSymptoms, `Mood: ${mood}`] : selectedSymptoms;
      await onStartPeriod(flow, allSymptoms, notes || null);
      showToast(`Period started at ${formatShortDateTime(new Date().toISOString())}`);
      setShowForm(false);
      setFlow('Medium');
      setSelectedSymptoms([]);
      setMood('');
      setNotes('');
    } catch (err: any) {
      showToast(err.message || 'Failed to start period', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSymptom = (s: string) => {
    setSelectedSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  return (
    <div className="screen-pad pb-24 pt-2 sm:pt-4">
      <LiveClock />

      {/* Animated cycle journey ring */}
      {entries.length > 0 && <CycleRing entries={entries} />}

      {/* Status Card */}
      <div className="mt-4 rounded-3xl p-6 bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-950/30 dark:to-purple-950/30 border border-pink-100 dark:border-pink-900/30 shadow-sm">
        {activeEntry ? (
          <div className="text-center">
            <div className="text-4xl mb-3">🩸</div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Period Ongoing</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Started {formatShortDateTime(activeEntry.start_datetime)}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 text-sm font-medium">
              <Clock size={14} />
              {formatDuration(activeEntry.start_datetime, null)}
            </div>
            {activeEntry.flow && (
              <div className="mt-3 flex items-center justify-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                <Droplets size={14} /> {activeEntry.flow} flow
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <div className="text-4xl mb-3">🌸</div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">No Active Period</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Tap below when your period starts</p>
          </div>
        )}
      </div>

      {/* Start Button */}
      {!activeEntry && !showForm && (
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => setShowForm(true)}
            className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-pink-400 to-rose-400 hover:from-pink-500 hover:to-rose-500 text-white font-semibold text-base shadow-lg shadow-pink-200 dark:shadow-pink-900/30 transition-all duration-200 active:scale-[0.98]"
          >
            🩸 Start Period
          </button>
          {onNavigate && (
            <button
              onClick={() => onNavigate('tools')}
              className="flex-1 py-4 rounded-2xl bg-white dark:bg-gray-800 border-2 border-pink-200 dark:border-pink-800 text-pink-500 font-semibold text-base shadow-sm transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Wrench size={18} /> Tools
            </button>
          )}
        </div>
      )}

      {/* Start Form */}
      {showForm && !activeEntry && (
        <div className="mt-4 rounded-3xl p-5 bg-white dark:bg-gray-800 border border-pink-100 dark:border-gray-700 shadow-sm animate-fade-in">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Log Period Start</h3>
          
          {/* Flow */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Flow</label>
            <div className="flex gap-2 mt-2">
              {['Light', 'Medium', 'Heavy'].map(f => (
                <button
                  key={f}
                  onClick={() => setFlow(f)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    flow === f
                      ? 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 border-2 border-pink-300 dark:border-pink-700'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-2 border-transparent'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Mood */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Mood</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {MOODS.map(m => (
                <button
                  key={m}
                  onClick={() => setMood(mood === m ? '' : m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    mood === m
                      ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Symptoms */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Symptoms</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {SYMPTOMS.map(s => (
                <button
                  key={s}
                  onClick={() => toggleSymptom(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    selectedSymptoms.includes(s)
                      ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="How are you feeling?"
              className="mt-2 w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-pink-300 dark:focus:ring-pink-700"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-pink-400 to-rose-400 text-white font-medium text-sm shadow-md disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save & Start'}
            </button>
          </div>
        </div>
      )}

      {/* Cycle Phase Card */}
      {!activeEntry && phaseInfo && currentPhase && (
        <div className="mt-4 rounded-2xl p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{phaseInfo.emoji}</div>
            <div className="flex-1">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">Current Phase</p>
              <p className="text-base font-semibold text-gray-800 dark:text-gray-100">{phaseInfo.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{phaseInfo.description}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Day</p>
              <p className="text-lg font-bold text-gray-700 dark:text-gray-200">{currentPhase.dayInPhase}</p>
              <p className="text-[10px] text-gray-400">of {currentPhase.totalPhaseDays}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-center shadow-sm">
          <Calendar size={18} className="mx-auto text-pink-400 mb-1" />
          <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{currentCycleDay || '—'}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Cycle Day</p>
        </div>
        <div className="rounded-2xl p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-center shadow-sm">
          <Heart size={18} className="mx-auto text-rose-400 mb-1" />
          <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            {daysUntilNextPeriod !== null && daysUntilNextPeriod > 0 ? daysUntilNextPeriod : '—'}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Days Until Period</p>
        </div>
      </div>

      {/* Ovulation & Fertile Window — collapsible */}
      {!activeEntry && ovulationInfo && (
        <CollapsibleCard
          id="fertility"
          groupId="home-boxes"
          openId={openBoxId}
          onToggle={setOpenBoxId}
          className="mt-4 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border border-purple-100 dark:border-purple-900/30 shadow-sm"
          headerClassName="p-4"
          bodyClassName="px-4 pb-4"
          icon={<Sparkles size={16} className="text-purple-500" />}
          title="Fertility Window"
          subtitle={`Ovulation ${format(ovulationInfo.ovulationDay, 'd MMM')} · ${
            ovulationInfo.daysUntilOvulation > 0
              ? `in ${ovulationInfo.daysUntilOvulation} days`
              : ovulationInfo.daysUntilOvulation === 0 ? 'today!' : 'past'
          }`}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Ovulation Day</p>
              <p className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                {format(ovulationInfo.ovulationDay, 'd MMM')}
              </p>
              <p className="text-[10px] text-gray-400">
                {ovulationInfo.daysUntilOvulation > 0 
                  ? `In ${ovulationInfo.daysUntilOvulation} days` 
                  : ovulationInfo.daysUntilOvulation === 0 ? 'Today!' : 'Past'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Fertile Window</p>
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                {format(ovulationInfo.fertileStart, 'd MMM')} – {format(ovulationInfo.fertileEnd, 'd MMM')}
              </p>
              <p className="text-[10px] text-gray-400">6-day window</p>
            </div>
          </div>
        </CollapsibleCard>
      )}

      {/* Cycle Stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-center shadow-sm">
          <Clock size={14} className="mx-auto text-pink-400 mb-1" />
          <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{stats.avgCycleLength}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Avg Cycle</p>
        </div>
        <div className="rounded-2xl p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-center shadow-sm">
          <Droplets size={14} className="mx-auto text-rose-400 mb-1" />
          <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{stats.avgPeriodDuration}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Avg Duration</p>
        </div>
        <div className="rounded-2xl p-3 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-center shadow-sm">
          <ChevronRight size={14} className="mx-auto text-purple-400 mb-1" />
          <p className="text-[11px] font-bold text-gray-800 dark:text-gray-100 leading-tight">
            {nextPeriodDate ? format(parseISO(nextPeriodDate), 'd MMM') : '—'}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Next Period</p>
        </div>
      </div>

      {/* Prediction Summary Card — collapsible */}
      {(() => {
        const p = buildPredictions(entries);
        if (!p.hasData) return null;
        return (
          <CollapsibleCard
            id="predictions"
            groupId="home-boxes"
            openId={openBoxId}
            onToggle={setOpenBoxId}
            className="mt-4 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30 border border-violet-100 dark:border-violet-900/30 shadow-sm"
            headerClassName="p-4"
            bodyClassName="px-4 pb-4"
            title="🔮 Your Predictions"
            subtitle={`Next period ${formatDateShort(p.nextPeriodDate)} · ${countdownLabel(p.daysUntilNextPeriod)}${p.isPeriodLate ? ' · ⚠️ looks late' : ''}`}
            headerRight={
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                p.confidence === 'high' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : p.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
              }`}>{p.confidence}</span>
            }
          >
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/70 dark:bg-gray-900/40 py-2.5">
                <p className="text-sm font-bold text-pink-600 dark:text-pink-400">{formatDateShort(p.nextPeriodDate)}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Next period · {countdownLabel(p.daysUntilNextPeriod)}</p>
              </div>
              <div className="rounded-xl bg-white/70 dark:bg-gray-900/40 py-2.5">
                <p className="text-sm font-bold text-purple-600 dark:text-purple-400">{formatDateShort(p.ovulationDate)}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Ovulation · {countdownLabel(p.daysUntilOvulation)}</p>
              </div>
              <div className="rounded-xl bg-white/70 dark:bg-gray-900/40 py-2.5">
                <p className="text-sm font-bold text-green-600 dark:text-green-400">{p.fertileStart ? format(parseISO(p.fertileStart), 'd MMM') : '—'}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Fertile window opens</p>
              </div>
            </div>
            {p.isPeriodLate && (
              <p className="mt-2 text-center text-[11px] font-medium text-amber-600 dark:text-amber-400">
                ⚠️ Your period looks {p.lateByDays} day{p.lateByDays > 1 ? 's' : ''} late — cycles can shift for many reasons.
              </p>
            )}
          </CollapsibleCard>
        );
      })()}

      {/* Cycle Phase Timeline — collapsible */}
      {!activeEntry && lastStart && (
        <CollapsibleCard
          id="phases"
          groupId="home-boxes"
          openId={openBoxId}
          onToggle={setOpenBoxId}
          className="mt-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm"
          headerClassName="p-4"
          bodyClassName="px-4 pb-4"
          title="Cycle Phases"
          subtitle={phaseInfo ? `${phaseInfo.emoji} ${phaseInfo.label} — day ${currentPhase?.dayInPhase} of ${currentPhase?.totalPhaseDays}` : undefined}
        >
          <div className="flex rounded-full h-3 overflow-hidden bg-gray-100 dark:bg-gray-700">
            <div className="bg-red-400" style={{ width: `${(stats.avgPeriodDuration / stats.avgCycleLength) * 100}%` }} title="Menstrual" />
            <div className="bg-green-400" style={{ width: `${((stats.avgCycleLength - 14 - 5 - stats.avgPeriodDuration) / stats.avgCycleLength) * 100}%` }} title="Follicular" />
            <div className="bg-purple-400" style={{ width: `${(7 / stats.avgCycleLength) * 100}%` }} title="Ovulation" />
            <div className="bg-blue-400" style={{ width: `${(9 / stats.avgCycleLength) * 100}%` }} title="Luteal" />
            <div className="bg-pink-300" style={{ width: `${(5 / stats.avgCycleLength) * 100}%` }} title="PMS" />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 rounded-full bg-red-400" />Menstrual</span>
            <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 rounded-full bg-green-400" />Follicular</span>
            <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 rounded-full bg-purple-400" />Ovulation</span>
            <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 rounded-full bg-blue-400" />Luteal</span>
            <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 rounded-full bg-pink-300" />PMS</span>
          </div>
        </CollapsibleCard>
      )}

      {/* Privacy note */}
      <div className="mt-6 text-center">
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          🔒 Synced securely to your private cloud. Accessible only on devices with this app.
        </p>
      </div>
    </div>
  );
}
