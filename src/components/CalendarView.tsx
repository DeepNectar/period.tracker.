import { useState, useMemo } from 'react';
import { PeriodEntry } from '../lib/supabase';
import { getCalendarDays, isSameDay, isDateInRange, calculateCycleStats, getCyclePhase, getPhaseInfo } from '../utils/dates';
import { format, parseISO, startOfDay, differenceInDays, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayLogSheet } from './DayLogSheet';

type Props = {
  entries: PeriodEntry[];
  onEndPeriod?: (id: string) => Promise<any>;
  onUpdateEntry?: (id: string, updates: Partial<PeriodEntry>) => Promise<any>;
};

type DayStatus = 'period' | 'predicted' | 'fertile' | 'ovulation' | 'pms' | 'follicular' | 'luteal' | 'none';

export function CalendarView({ entries, onEndPeriod, onUpdateEntry }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const days = useMemo(() => getCalendarDays(year, month), [year, month]);

  const stats = useMemo(() => calculateCycleStats(entries), [entries]);
  const lastEntry = entries.length > 0 ? entries[0] : null;
  const lastStart = lastEntry ? parseISO(lastEntry.start_datetime) : null;

  // Generate predictions for next 6 cycles
  const predictions = useMemo(() => {
    if (!lastStart) return [];
    const preds: { start: Date; end: Date; ovulation: Date; fertileStart: Date; fertileEnd: Date }[] = [];
    for (let i = 0; i <= 6; i++) {
      const cycleStart = addDays(lastStart, stats.avgCycleLength * i);
      const cycleEnd = addDays(cycleStart, stats.avgPeriodDuration - 1);
      const ovulation = addDays(cycleStart, stats.avgCycleLength - 14);
      const fertileStart = addDays(ovulation, -5);
      const fertileEnd = addDays(ovulation, 1);
      preds.push({ start: cycleStart, end: cycleEnd, ovulation, fertileStart, fertileEnd });
    }
    return preds;
  }, [lastStart, stats]);

  const getDayStatus = (day: Date): DayStatus => {
    const today = startOfDay(new Date());
    const checkDay = startOfDay(day);
    
    // Check actual period days first
    for (const entry of entries) {
      if (isDateInRange(day, entry.start_datetime, entry.end_datetime)) {
        return 'period';
      }
    }
    
    // Check predictions for future days
    if (checkDay >= today) {
      for (const pred of predictions) {
        const predStart = startOfDay(pred.start);
        const predEnd = startOfDay(pred.end);
        
        // Ovulation day
        if (isSameDay(checkDay, pred.ovulation)) {
          return 'ovulation';
        }
        
        // Fertile window
        if (checkDay >= startOfDay(pred.fertileStart) && checkDay <= startOfDay(pred.fertileEnd)) {
          return 'fertile';
        }
        
        // Predicted period
        if (checkDay >= predStart && checkDay <= predEnd) {
          return 'predicted';
        }

        // PMS (5 days before predicted period)
        const pmsStart = addDays(pred.start, -5);
        if (checkDay >= startOfDay(pmsStart) && checkDay < predStart) {
          return 'pms';
        }
      }
    }
    
    // Past days - show phase based on last known cycle
    if (checkDay < today && lastStart) {
      const phase = getCyclePhase(day, lastStart.toISOString(), stats.avgCycleLength, stats.avgPeriodDuration);
      switch (phase.phase) {
        case 'follicular': return 'follicular';
        case 'luteal': return 'luteal';
        default: return 'none';
      }
    }
    
    return 'none';
  };

  const getEntryForDay = (day: Date) => {
    return entries.find(e => isDateInRange(day, e.start_datetime, e.end_datetime));
  };

  const getDayColor = (status: DayStatus): string => {
    switch (status) {
      case 'period': return 'bg-red-400 text-white dark:bg-red-600';
      case 'predicted': return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200';
      case 'fertile': return 'bg-green-200 text-green-800 dark:bg-green-900/40 dark:text-green-200';
      case 'ovulation': return 'bg-purple-300 text-purple-900 dark:bg-purple-700 dark:text-white';
      case 'pms': return 'bg-pink-200 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200';
      case 'follicular': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
      case 'luteal': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      default: return 'text-gray-600 dark:text-gray-300';
    }
  };

  const selectedEntry = selectedDay ? getEntryForDay(selectedDay) : null;
  const selectedDayStatus = selectedDay ? getDayStatus(selectedDay) : 'none';
  const selectedPhase = selectedDay && lastStart 
    ? getCyclePhase(selectedDay, lastStart.toISOString(), stats.avgCycleLength, stats.avgPeriodDuration)
    : null;

  return (
    <div className="px-4 pb-24 pt-6">
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Calendar</h1>
      
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCurrentMonth(new Date(year, month - 1))} className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
          <ChevronLeft size={18} className="text-gray-600 dark:text-gray-300" />
        </button>
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <button onClick={() => setCurrentMonth(new Date(year, month + 1))} className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
          <ChevronRight size={18} className="text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 dark:text-gray-500 py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, idx) => {
          const status = getDayStatus(day);
          const isCurrentMonth = day.getMonth() === month;
          const isToday = isSameDay(day, new Date());
          const isSelected = selectedDay && isSameDay(day, selectedDay);
          const colorClass = getDayColor(status);
          
          return (
            <button
              key={idx}
              onClick={() => setSelectedDay(day)}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-medium transition-all relative ${
                !isCurrentMonth ? 'opacity-30' : ''
              } ${isSelected ? 'ring-2 ring-pink-400 dark:ring-pink-500 scale-105' : ''} ${
                status !== 'none' ? colorClass : 'text-gray-600 dark:text-gray-300'
              } ${isToday && status === 'none' ? 'ring-2 ring-pink-300 dark:ring-pink-600' : ''}`}
            >
              <span>{day.getDate()}</span>
              {status === 'ovulation' && <span className="text-[8px] leading-none">🥚</span>}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <span className="text-[10px] text-gray-500 dark:text-gray-400">Period</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-yellow-200" />
          <span className="text-[10px] text-gray-500 dark:text-gray-400">Predicted</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-200" />
          <span className="text-[10px] text-gray-500 dark:text-gray-400">Fertile</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-purple-300" />
          <span className="text-[10px] text-gray-500 dark:text-gray-400">Ovulation</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-pink-200" />
          <span className="text-[10px] text-gray-500 dark:text-gray-400">PMS</span>
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div className="mt-4 rounded-2xl p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm animate-fade-in">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
            {format(selectedDay, 'EEEE, d MMMM yyyy')}
          </h3>
          {selectedEntry ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p>🩸 Period day</p>
              <p>Flow: {selectedEntry.flow || 'Not logged'}</p>
              {selectedEntry.symptoms && selectedEntry.symptoms.length > 0 && (
                <p>Symptoms: {selectedEntry.symptoms.join(', ')}</p>
              )}
              {selectedEntry.notes && <p className="italic">"{selectedEntry.notes}"</p>}
            </div>
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              {selectedDayStatus === 'predicted' && <p>🟡 Predicted period day</p>}
              {selectedDayStatus === 'fertile' && <p>🟢 Fertile day — high chance of conception</p>}
              {selectedDayStatus === 'ovulation' && <p>🥚 Ovulation day — peak fertility</p>}
              {selectedDayStatus === 'pms' && <p>🌸 PMS phase — symptoms may appear</p>}
              {selectedDayStatus === 'follicular' && <p>🌱 Follicular phase — energy building</p>}
              {selectedDayStatus === 'luteal' && <p>🌙 Luteal phase — winding down</p>}
              {selectedDayStatus === 'none' && <p>No data for this day</p>}
              {selectedPhase && (
                <p className="text-gray-400 dark:text-gray-500 mt-1">
                  Cycle Day {selectedPhase.dayInPhase} of {selectedPhase.totalPhaseDays} in {getPhaseInfo(selectedPhase.phase).label} phase
                </p>
              )}
            </div>
          )}

          {/* Log this day — period-tracker.org style per-day logging */}
          <DayLogSheet
            day={selectedDay}
            entries={entries}
            onEndPeriod={onEndPeriod}
            onUpdateEntry={onUpdateEntry}
          />
        </div>
      )}
    </div>
  );
}
