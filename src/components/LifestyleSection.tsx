import { useState } from 'react';
import { Activity, Droplets, Moon, Wind, Save, Star } from 'lucide-react';
import {
  LifestyleData,
  ExerciseType,
  EXERCISE_TYPES,
  DIET_TAGS,
  emptyLifestyle,
  hasLifestyle,
} from '../utils/dailyLog';

interface Props {
  value: LifestyleData;
  onChange: (next: LifestyleData) => void;
  onSave?: () => void;
  saving?: boolean;
}

const EXERCISE_EMOJI: Record<ExerciseType, string> = {
  None: '🛋️',
  Yoga: '🧘‍♀️',
  Cardio: '🏃‍♀️',
  Strength: '🏋️‍♀️',
  Walking: '🚶‍♀️',
  'Rest day': '😴',
};

/**
 * Module 2 — Lifestyle & habit logger embedded in the daily check-in.
 * Sleep hours + quality, water intake, exercise type, diet tags and stress.
 */
export function LifestyleSection({ value, onChange, onSave, saving }: Props) {
  const [showAll, setShowAll] = useState(!hasLifestyle(value));

  const set = <K extends keyof LifestyleData>(k: K, v: LifestyleData[K]) => onChange({ ...value, [k]: v });

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
      active
        ? 'bg-purple-500 text-white border-purple-500'
        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-purple-300'
    }`;

  const toggleDiet = (tag: string) => {
    const cur = value.dietNotes || [];
    set('dietNotes', cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]);
  };

  return (
    <div className="rounded-2xl border border-purple-100 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20 p-3 space-y-3">
      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-xs font-semibold text-purple-600 dark:text-purple-300 flex items-center gap-1.5">
          <Activity size={13} /> Lifestyle & habits
          {hasLifestyle(value) && <span className="font-normal text-gray-400">· logged</span>}
        </span>
        <span className="text-purple-400 text-sm">{showAll ? '▾' : '▸'}</span>
      </button>

      {showAll && (
        <>
          {/* Sleep */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Moon size={12} /> Sleep: <span className="text-purple-600 dark:text-purple-300">{value.sleepHours ?? '—'} h</span>
            </label>
            <input
              type="range"
              min={0}
              max={12}
              step={0.5}
              value={value.sleepHours ?? 0}
              onChange={(e) => set('sleepHours', Number(e.target.value))}
              className="w-full accent-purple-500"
            />
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-gray-500 dark:text-gray-400 mr-1">Quality:</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => set('sleepQuality', value.sleepQuality === n ? null : n)}>
                  <Star
                    size={14}
                    className={value.sleepQuality! >= n ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Water */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Droplets size={12} /> Water: <span className="text-blue-500">{value.waterLiters ?? 0} L</span>
            </label>
            <div className="flex gap-1.5">
              {[0, 1, 1.5, 2, 2.5, 3, 4].map((l) => (
                <button key={l} type="button" onClick={() => set('waterLiters', l === 0 ? null : l)} className={chip(value.waterLiters === l)}>
                  {l === 0 ? '—' : `${l}L`}
                </button>
              ))}
            </div>
          </div>

          {/* Exercise */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Wind size={12} /> Exercise
            </label>
            <div className="flex flex-wrap gap-2">
              {EXERCISE_TYPES.map((x) => (
                <button key={x} type="button" onClick={() => set('exerciseType', value.exerciseType === x ? null : x)} className={chip(value.exerciseType === x)}>
                  {EXERCISE_EMOJI[x]} {x}
                </button>
              ))}
            </div>
          </div>

          {/* Diet tags */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Diet notes</label>
            <div className="flex flex-wrap gap-2">
              {DIET_TAGS.map((t) => (
                <button key={t} type="button" onClick={() => toggleDiet(t)} className={chip((value.dietNotes || []).includes(t))}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Stress */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              Stress level: <span className="text-rose-500">{value.stressLevel ?? '—'}/10</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={value.stressLevel ?? 1}
              onChange={(e) => set('stressLevel', Number(e.target.value))}
              className="w-full accent-rose-400"
            />
          </div>

          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-purple-500 text-white text-xs font-semibold disabled:opacity-60"
            >
              <Save size={13} /> Save lifestyle log
            </button>
          )}
        </>
      )}
    </div>
  );
}

export { emptyLifestyle };
