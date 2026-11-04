import { useMemo, useState } from 'react';
import { PeriodEntry } from '../lib/supabase';
import { CollapsibleCard } from './CollapsibleCard';
import { buildPredictions, formatDateShort, formatDateRange, countdownLabel } from '../utils/predictions';
import { getCyclePhase, getPhaseInfo } from '../utils/dates';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Droplets, Egg, Sparkles, CalendarClock, AlertTriangle, TrendingUp, Info } from 'lucide-react';

type Props = {
  entries: PeriodEntry[];
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

export function PredictionsScreen({ entries }: Props) {
  const p = useMemo(() => buildPredictions(entries), [entries]);
  // Accordion state: expanding one box collapses the previously open one.
  const [openBoxId, setOpenBoxId] = useState<string | null>(null);

  const currentPhase = useMemo(() => {
    if (!p.hasData) return null;
    return getCyclePhase(new Date(), p.lastPeriodStart!, p.avgCycleLength, p.avgPeriodDuration);
  }, [p]);

  const phaseInfo = currentPhase ? getPhaseInfo(currentPhase.phase) : null;

  // Upcoming events timeline
  const events = p.hasData
    ? [
        { date: p.fertileStart, label: 'Fertile window opens', emoji: '💚' },
        { date: p.ovulationDate, label: 'Estimated ovulation', emoji: '🥚' },
        { date: p.fertileEnd, label: 'Fertile window closes', emoji: '🔒' },
        { date: p.nextPeriodDate, label: 'Next period expected', emoji: '🩸' },
        { date: p.followingPeriodDate, label: 'Period after that', emoji: '📅' },
      ]
        .filter(e => e.date)
        .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
    : [];

  if (!p.hasData) {
    return (
      <div className="screen-pad compact-top py-3">
        <div className="rounded-3xl p-8 bg-white dark:bg-gray-800 border border-pink-100 dark:border-gray-700 text-center shadow-sm">
          <div className="text-5xl mb-4">🔮</div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">No predictions yet</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
            Log your first period and mark it as ended. After that, we'll predict your
            next period, ovulation day, and fertile window automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen-pad compact-top py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">🔮 Predictions</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Estimates based on your cycle history</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${CONFIDENCE_STYLES[p.confidence]}`}>
          {p.confidence} confidence
        </span>
      </div>

      {/* Next Period Hero Card */}
      <div className="rounded-3xl p-4 sm:p-5 bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/30 dark:to-rose-950/30 border border-pink-100 dark:border-pink-900/30 shadow-sm text-center">
        <div className="flex items-center justify-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          <Droplets size={14} className="text-pink-500" /> Next period
        </div>
        <p className="mt-2 text-3xl font-bold text-gray-800 dark:text-gray-100">
          {p.isPeriodLate
            ? `${p.lateByDays} day${p.lateByDays > 1 ? 's' : ''} late`
            : countdownLabel(p.daysUntilNextPeriod)}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 font-medium">
          {formatDateShort(p.nextPeriodDate)}
        </p>
        {p.isPeriodLate && (
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-medium">
            <AlertTriangle size={13} /> Cycles can shift due to stress, illness or travel
          </div>
        )}
        {phaseInfo && currentPhase && (
          <div className="mt-2.5 flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <span className="text-xl">{phaseInfo.emoji}</span>
            <span>
              You're in your <b>{phaseInfo.label}</b> phase — day {currentPhase.dayInPhase} of {currentPhase.totalPhaseDays}
            </span>
          </div>
        )}
      </div>

      {/* Ovulation & Fertile Window */}
      <div className="mt-2.5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-1.5 text-purple-500 mb-1">
            <Egg size={15} />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Ovulation</p>
          </div>
          <p className="text-base font-bold text-gray-800 dark:text-gray-100">{formatDateShort(p.ovulationDate)}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{countdownLabel(p.daysUntilOvulation)}</p>
        </div>
        <div className="rounded-2xl p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-1.5 text-green-500 mb-1">
            <Sparkles size={15} />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Fertile window</p>
          </div>
          <p className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-tight">
            {formatDateRange(p.fertileStart, p.fertileEnd)}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">6 days most likely to conceive</p>
        </div>
      </div>

      {/* Upcoming Timeline — collapsible */}
      <CollapsibleCard
        id="timeline"
        groupId="predictions-boxes"
        openId={openBoxId}
        onToggle={setOpenBoxId}
        className="mt-2.5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm"
        headerClassName="p-4"
        bodyClassName="px-4 pb-4"
        icon={<CalendarClock size={16} className="text-pink-500" />}
        title="What's coming up"
        subtitle={events.length > 0 ? `${events[0].emoji} ${events[0].label} · ${formatDateShort(events[0].date)}` : undefined}
      >
        <div className="space-y-1">
          {events.map((e, i) => {
            const days = differenceInDays(parseISO(e.date!), new Date());
            const past = days < 0;
            return (
              <div key={i} className={`flex items-center gap-3 py-2 ${i < events.length - 1 ? 'border-b border-gray-50 dark:border-gray-700/50' : ''} ${past ? 'opacity-40' : ''}`}>
                <span className="text-lg w-7 text-center">{e.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{e.label}</p>
                  <p className="text-[11px] text-gray-400">{format(parseISO(e.date!), 'EEEE, d MMMM')}</p>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
                  days === 0
                    ? 'bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-300'
                    : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-300'
                }`}>
                  {past ? `${Math.abs(days)}d ago` : days === 0 ? 'Today' : `in ${days}d`}
                </span>
              </div>
            );
          })}
        </div>
      </CollapsibleCard>

      {/* How we predict — collapsible */}
      <CollapsibleCard
        id="averages"
        groupId="predictions-boxes"
        openId={openBoxId}
        onToggle={setOpenBoxId}
        className="mt-2.5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm"
        headerClassName="p-4"
        bodyClassName="px-4 pb-4"
        icon={<TrendingUp size={16} className="text-purple-500" />}
        title="Your cycle averages"
        subtitle={`Avg cycle ${p.avgCycleLength} days · Avg period ${p.avgPeriodDuration} days · ${p.completedCount} cycles logged`}
      >
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-pink-50 dark:bg-pink-950/30 py-3">
            <p className="text-xl font-bold text-pink-600 dark:text-pink-400">{p.avgCycleLength}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Avg cycle (days)</p>
          </div>
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 py-3">
            <p className="text-xl font-bold text-rose-600 dark:text-rose-400">{p.avgPeriodDuration}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Avg period (days)</p>
          </div>
          <div className="rounded-xl bg-purple-50 dark:bg-purple-950/30 py-3">
            <p className="text-xl font-bold text-purple-600 dark:text-purple-400">{p.completedCount}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Cycles logged</p>
          </div>
        </div>
        {p.cycleLengths.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Recent cycle lengths</p>
            <div className="flex items-end gap-1.5 h-16">
              {p.cycleLengths.slice(0, 8).reverse().map((len, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-pink-300 to-purple-300 dark:from-pink-700 dark:to-purple-700"
                    style={{ height: `${Math.min(100, (len / 40) * 100)}%` }}
                    title={`${len} days`}
                  />
                  <span className="text-[10px] text-gray-400">{len}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CollapsibleCard>

      {/* Disclaimer — collapsible */}
      <CollapsibleCard
        id="disclaimer"
        groupId="predictions-boxes"
        openId={openBoxId}
        onToggle={setOpenBoxId}
        className="mt-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30"
        headerClassName="p-4"
        bodyClassName="px-4 pb-4"
        icon={<Info size={15} className="text-blue-500" />}
        title="About these predictions"
      >
        <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
          {p.confidenceLabel}. These are estimates using a calendar-based method (ovulation ≈ 14 days before
          your next period). Do <b>not</b> rely on this alone for contraception or pregnancy planning — cycle
          predictions can be affected by stress, illness, medication and lifestyle changes.
        </p>
      </CollapsibleCard>
    </div>
  );
}
