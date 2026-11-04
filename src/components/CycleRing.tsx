import { useState } from 'react';
import { motion } from 'framer-motion';
import { PeriodEntry } from '../lib/supabase';
import { calculateCycleStats, getCyclePhase, getPhaseInfo, CyclePhase } from '../utils/dates';
import { parseISO, differenceInCalendarDays } from 'date-fns';

/**
 * Animated cycle journey ring (Home screen hero).
 * SVG donut with the 5 phases; a glowing marker rides around it daily.
 */

const PHASES: { phase: CyclePhase; color: string; label: string }[] = [
  { phase: 'menstrual', color: '#f43f5e', label: 'Menstrual' },
  { phase: 'follicular', color: '#fb923c', label: 'Follicular' },
  { phase: 'ovulation', color: '#d946ef', label: 'Ovulation' },
  { phase: 'luteal', color: '#8b5cf6', label: 'Luteal' },
  { phase: 'pms', color: '#6366f1', label: 'PMS' },
];

export function CycleRing({ entries }: { entries: PeriodEntry[] }) {
  const [hovered, setHovered] = useState<CyclePhase | null>(null);

  if (entries.length === 0) return null;

  const stats = calculateCycleStats(entries);
  const sorted = [...entries].sort((a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime());
  const lastStart = sorted[0].start_datetime;
  const cycleLength = Math.max(15, stats.avgCycleLength);
  const dayOfCycle = Math.min(Math.max(differenceInCalendarDays(new Date(), parseISO(lastStart)) + 1, 1), cycleLength);
  const current = getCyclePhase(new Date(), lastStart, stats.avgCycleLength, stats.avgPeriodDuration);
  const info = getPhaseInfo(current.phase);

  // Segment fractions of the cycle
  const menstrualFrac = Math.min(stats.avgPeriodDuration, cycleLength) / cycleLength;
  const ovuDay = cycleLength - 14;
  const pmsFrac = 4 / cycleLength;
  const ovuFrac = 2 / cycleLength;
  const follicularFrac = Math.max(0, (ovuDay - 5 - stats.avgPeriodDuration)) / cycleLength;
  const lutealFrac = Math.max(0, 1 - menstrualFrac - follicularFrac - ovuFrac - pmsFrac);

  const fracs: Record<CyclePhase, number> = {
    menstrual: menstrualFrac,
    follicular: follicularFrac,
    ovulation: ovuFrac,
    luteal: lutealFrac,
    pms: pmsFrac,
  };

  const R = 80;
  const C = 2 * Math.PI * R;
  let acc = 0;

  return (
    <div className="flex flex-col items-center py-4">
      <div className="relative w-52 h-52">
        <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
          {/* track */}
          <circle cx="100" cy="100" r={R} fill="none" stroke="currentColor" className="text-pink-100 dark:text-gray-800" strokeWidth="14" />
          {/* phase segments */}
          {PHASES.map(({ phase, color }) => {
            const frac = fracs[phase];
            const dash = frac * C;
            const offset = -acc * C;
            acc += frac;
            return (
              <circle
                key={phase}
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={color}
                strokeWidth={hovered === phase ? 18 : 14}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                opacity={hovered && hovered !== phase ? 0.35 : 0.9}
                onMouseEnter={() => setHovered(phase)}
                onMouseLeave={() => setHovered(null)}
                style={{ transition: 'stroke-width .2s, opacity .2s' }}
              />
            );
          })}
          {/* progress arc to today */}
          <motion.circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth="3"
            initial={{ strokeDasharray: `0 ${C}`, strokeDashoffset: 0 }}
            animate={{ strokeDasharray: `${(dayOfCycle / cycleLength) * C} ${C}` }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="-rotate-0"
            style={{ transformOrigin: 'center' }}
          />
          {/* today marker */}
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <circle
              cx={100 + R * Math.cos(2 * Math.PI * (dayOfCycle / cycleLength))}
              cy={100 + R * Math.sin(2 * Math.PI * (dayOfCycle / cycleLength))}
              r="9"
              fill="#fff"
              stroke={info.color.includes('bg') ? '#ec4899' : '#ec4899'}
              strokeWidth="3"
              className="drop-shadow-lg"
            />
          </motion.g>
        </svg>
        {/* center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {hovered ? (
            <>
              <span className="text-2xl">{getPhaseInfo(hovered).emoji}</span>
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wide">
                {getPhaseInfo(hovered).label}
              </span>
            </>
          ) : (
            <>
              <span className="text-3xl">{info.emoji}</span>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">Day {dayOfCycle}</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">{info.label}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex gap-3 mt-3 flex-wrap justify-center">
        {PHASES.map(({ phase, color }) => (
          <button
            key={phase}
            onMouseEnter={() => setHovered(phase)}
            onMouseLeave={() => setHovered(null)}
            className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400"
          >
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            {phase}
          </button>
        ))}
      </div>
    </div>
  );
}
