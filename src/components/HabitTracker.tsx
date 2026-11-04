import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { HABITS, HabitId, HabitDayRecord, loadHabitLog, toggleHabit, computeStreak } from '../utils/habits';
import { todayKey } from '../utils/dailyLog';
import { useAuth } from '../hooks/useAuth';
import { Flame } from 'lucide-react';

const card = 'bg-white dark:bg-gray-800 rounded-3xl p-4 shadow-sm border border-pink-100 dark:border-gray-700';

/** Weekly habit grid + streak for cycle-aligned self-care goals. */
export function HabitTracker() {
  const { user } = useAuth();
  const [log, setLog] = useState<Record<string, HabitDayRecord>>({});
  const [loading, setLoading] = useState(true);

  const weekDays: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    weekDays.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }

  useEffect(() => {
    loadHabitLog(user?.id ?? null).then((l) => {
      setLog(l);
      setLoading(false);
    });
  }, [user?.id]);

  const onToggle = async (dayKey: string, habit: HabitId) => {
    const updated = await toggleHabit(user?.id ?? null, dayKey, habit);
    setLog({ ...updated });
  };

  const streak = computeStreak(log, todayKey());
  const todayK = todayKey();

  if (loading) {
    return <div className={`${card} text-center py-8 text-xs text-gray-400`}>Loading habits…</div>;
  }

  return (
    <div className={`${card} space-y-4`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-800 dark:text-gray-100">This week</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Tap a cell to check it off</p>
        </div>
        <motion.div
          key={streak}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300"
        >
          <Flame size={14} />
          <span className="text-sm font-bold">{streak}-day streak</span>
        </motion.div>
      </div>

      {/* Header row of days */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-[10px] font-medium text-gray-400 pb-1 w-28">Habit</th>
              {weekDays.map((k) => (
                <th key={k} className={`text-[10px] font-medium pb-1 ${k === todayK ? 'text-pink-500' : 'text-gray-400'}`}>
                  {new Date(k + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HABITS.map((h) => (
              <tr key={h.id}>
                <td className="py-1.5 pr-2">
                  <span className="text-xs text-gray-700 dark:text-gray-200">
                    {h.emoji} {h.label}
                  </span>
                </td>
                {weekDays.map((k) => {
                  const done = !!log[k]?.habits[h.id];
                  return (
                    <td key={k} className="text-center py-1.5">
                      <button
                        onClick={() => onToggle(k, h.id)}
                        aria-label={`${h.label} ${k}`}
                        className={`w-6 h-6 mx-auto rounded-lg border text-[11px] transition-all active:scale-90 ${
                          done
                            ? 'bg-pink-500 border-pink-500 text-white'
                            : k === todayK
                            ? 'border-pink-200 dark:border-pink-800'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        {done ? '✓' : ''}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl bg-purple-50 dark:bg-purple-900/20 p-3">
        <p className="text-[11px] text-purple-600 dark:text-purple-300 leading-relaxed">
          💡 Phase tip: {HABITS[Math.floor(Math.random() * HABITS.length)].phaseTip}
        </p>
      </div>
    </div>
  );
}
