import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from './Toast';
import { supabase, PeriodEntry } from '../lib/supabase';
import { calculateCycleStats } from '../utils/dates';
import { format, parseISO, addDays, differenceInCalendarDays } from 'date-fns';
import { Sparkles, ChevronRight, Check, X, BarChart3, Heart } from 'lucide-react';

/**
 * Onboarding wizard: shown on first launch (before any data exists).
 * Collects average cycle/period length and optional symptoms to seed predictions.
 */

const STEPS = ['welcome', 'cycle', 'symptoms', 'done'] as const;
type Step = (typeof STEPS)[number];

const SYMPTOM_CHOICES = ['Cramps', 'Headache', 'Bloating', 'Fatigue', 'Mood swings', 'Acne', 'Back pain', 'Cravings'];

interface Props {
  entries: PeriodEntry[];
  hasData: boolean; // entries.length > 0 or user dismissed before
  onFinish: () => void;
}

export function Onboarding({ onFinish }: Props) {
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>('welcome');
  const [cycleLength, setCycleLength] = useState(28);
  const [periodDuration, setPeriodDuration] = useState(5);
  const [lastStart, setLastStart] = useState<string>(() => format(addDays(new Date(), -7), 'yyyy-MM-dd'));
  const [seedSymptoms, setSeedSymptoms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const saveAndFinish = async () => {
    setSaving(true);
    try {
      await supabase.from('user_prefs').upsert(
        {
          user_id: 'local',
          prefs: { onboarded: true, defaultCycleLength: cycleLength, defaultPeriodLength: periodDuration },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    } catch {
      /* table may not exist yet — onboarding still completes locally */
    }
    localStorage.setItem('pt_onboarded_v1', 'true');
    localStorage.setItem('pt_defaults_v1', JSON.stringify({ cycleLength, periodDuration }));

    // Optionally seed a first period entry so predictions work immediately
    try {
      const startISO = new Date(lastStart + 'T09:00:00').toISOString();
      const endISO = addDays(new Date(lastStart), periodDuration - 1).toISOString();
      await supabase.from('period_entries').insert({
        start_datetime: startISO,
        end_datetime: endISO,
        status: 'completed',
        flow: 'Medium',
        symptoms: seedSymptoms,
        notes: 'Added during onboarding',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      showToast('Welcome! Your first cycle was logged 🌸', 'success');
    } catch (err) {
      showToast('Onboarding saved. Log your last period from Home to unlock predictions.', 'info');
    } finally {
      setSaving(false);
      onFinish();
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -40 }}
        transition={{ duration: 0.25 }}
        className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-100 via-purple-50 to-pink-50 dark:from-gray-950 dark:via-purple-950/30 dark:to-gray-900 p-6"
      >
        <div className="w-full max-w-sm">
          {step === 'welcome' && (
            <div className="text-center space-y-5">
              <div className="text-6xl">🌸</div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
                Welcome to your Cycle Companion
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Track periods, predict ovulation, get reminders, and understand your body's patterns — privately.
              </p>
              <ul className="text-xs text-left space-y-2 text-gray-600 dark:text-gray-300 bg-white/70 dark:bg-gray-900/70 rounded-2xl p-4">
                <li className="flex gap-2"><Sparkles size={14} className="text-pink-500 shrink-0" /> Smart predictions from your history</li>
                <li className="flex gap-2"><Heart size={14} className="text-pink-500 shrink-0" /> Symptom & mood correlation insights</li>
                <li className="flex gap-2"><BarChart3 size={14} className="text-pink-500 shrink-0" /> Calendar sync, exports & partner mode</li>
              </ul>
              <NextButton onClick={() => setStep('cycle')} label="Let's set you up" />
              <SkipLink onSkip={onFinish} />
            </div>
          )}

          {step === 'cycle' && (
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur rounded-3xl p-6 shadow-xl space-y-6">
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Your typical cycle</h2>
              <Slider label="Cycle length" value={cycleLength} min={21} max={40} onChange={setCycleLength} unit="days" />
              <Slider label="Period lasts" value={periodDuration} min={2} max={10} onChange={setPeriodDuration} unit="days" />
              <label className="block">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">When did your last period start?</span>
                <input
                  type="date"
                  value={lastStart}
                  max={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(e) => setLastStart(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-sm outline-none focus:border-pink-300"
                />
              </label>
              <NextButton onClick={() => setStep('symptoms')} label="Next" />
            </div>
          )}

          {step === 'symptoms' && (
            <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur rounded-3xl p-6 shadow-xl space-y-5">
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Common symptoms?</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Optional — helps spot patterns earlier.</p>
              <div className="flex flex-wrap gap-2">
                {SYMPTOM_CHOICES.map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      setSeedSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
                    }
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      seedSymptoms.includes(s)
                        ? 'bg-pink-500 text-white border-pink-500'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <NextButton onClick={saveAndFinish} label={saving ? 'Saving…' : 'Finish ✨'} disabled={saving} />
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function NextButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-semibold text-sm flex items-center justify-center gap-1 disabled:opacity-50"
    >
      {label} <ChevronRight size={16} />
    </button>
  );
}

function SkipLink({ onSkip }: { onSkip: () => void }) {
  return (
    <button onClick={onSkip} className="mx-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-500">
      <X size={12} /> Skip for now
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  unit: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-sm font-bold text-pink-500">{value} {unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-pink-500"
      />
    </div>
  );
}

/** Hook: should we show onboarding? */
export function useShouldOnboard(entriesLoaded: boolean, entriesCount: number) {
  const [dismissed] = useState(() => localStorage.getItem('pt_onboarded_v1') === 'true');
  return entriesLoaded && !dismissed && entriesCount === 0;
}
