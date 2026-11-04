import { useMemo, useState } from 'react';
import { PeriodEntry } from '../lib/supabase';
import { useMonthlyInsights } from '../hooks/usePeriodData';
import { CollapsibleCard } from './CollapsibleCard';
import { calculateCycleStats, predictFertileWindow } from '../utils/dates';
import { format, parseISO, addDays } from 'date-fns';
import { TrendingUp, Calendar, Heart, Brain, Sparkles, Activity, Droplets, Target } from 'lucide-react';

type Props = {
  entries: PeriodEntry[];
};

export function InsightsScreen({ entries }: Props) {
  const { insight, loading } = useMonthlyInsights(entries);
  const stats = useMemo(() => calculateCycleStats(entries), [entries]);
  const data = insight?.insight_json;
  // Accordion state: expanding one insights box collapses the previously open one.
  const [openBoxId, setOpenBoxId] = useState<string | null>(null);

  // Build chart data for cycle lengths
  const chartData = useMemo(() => {
    const completed = entries
      .filter(e => e.status === 'completed' && e.end_datetime)
      .sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());
    
    const points: { label: string; value: number; date: string }[] = [];
    for (let i = 1; i < completed.length; i++) {
      const days = Math.round((new Date(completed[i].start_datetime).getTime() - new Date(completed[i-1].start_datetime).getTime()) / (1000 * 60 * 60 * 24));
      if (days > 0 && days < 60) {
        points.push({
          label: `Cycle ${i}`,
          value: days,
          date: format(parseISO(completed[i].start_datetime), 'MMM d')
        });
      }
    }
    return points;
  }, [entries]);

  if (loading) {
    return (
      <div className="screen-pad compact-top py-3">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6">Insights</h1>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-3 border-pink-200 border-t-pink-500 rounded-full" />
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="screen-pad compact-top py-3">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6">Insights</h1>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="text-6xl mb-4">🔮</div>
          <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-300">No Insights Yet</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 text-center max-w-[250px]">
            Track a few cycles to unlock personalized insights and predictions
          </p>
        </div>
      </div>
    );
  }

  const lastEntry = entries[0];
  const lastStart = parseISO(lastEntry.start_datetime);
  const nextPeriod = addDays(lastStart, stats.avgCycleLength);
  const ovulationDay = addDays(lastStart, stats.avgCycleLength - 14);

  return (
    <div className="screen-pad compact-top py-3">
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Insights</h1>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
        {insight?.month ? `Updated for ${format(parseISO(insight.month + '-01'), 'MMMM yyyy')}` : 'Your cycle analysis'}
      </p>

      {/* Personalized Message */}
      <div className="rounded-2xl p-5 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border border-purple-100 dark:border-purple-900/30 mb-4">
        <div className="flex items-start gap-3">
          <Sparkles size={20} className="text-purple-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
            {data?.message || `Tracking your cycle. Average length: ${stats.avgCycleLength} days. Next period expected around ${format(nextPeriod, 'd MMM yyyy')}.`}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
          <Calendar size={18} className="text-pink-400 mb-2" />
          <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{stats.avgCycleLength}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Avg Cycle Length (days)</p>
        </div>
        <div className="rounded-2xl p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
          <Droplets size={18} className="text-rose-400 mb-2" />
          <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{stats.avgPeriodDuration}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Avg Period Duration (days)</p>
        </div>
      </div>

      {/* Cycle Length Chart — collapsible */}
      {chartData.length >= 2 && (
        <CollapsibleCard
          id="chart"
          groupId="insights-boxes"
          openId={openBoxId}
          onToggle={setOpenBoxId}
          className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm mb-4"
          headerClassName="p-4"
          bodyClassName="px-4 pb-4"
          icon={<Activity size={14} className="text-pink-400" />}
          title="Cycle Length History"
          subtitle={`Last ${Math.min(chartData.length, 8)} cycles · avg ${stats.avgCycleLength} days`}
        >
          <div className="flex items-end gap-2 h-32">
            {chartData.slice(-8).map((point, i) => {
              const maxVal = Math.max(...chartData.slice(-8).map(p => p.value), stats.avgCycleLength + 5);
              const height = (point.value / maxVal) * 100;
              const isAboveAvg = point.value > stats.avgCycleLength;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{point.value}d</span>
                  <div 
                    className={`w-full rounded-t-lg transition-all ${
                      isAboveAvg ? 'bg-pink-300 dark:bg-pink-700' : 'bg-purple-300 dark:bg-purple-700'
                    }`}
                    style={{ height: `${height}%`, minHeight: '8px' }}
                  />
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{point.date}</span>
                </div>
              );
            })}
          </div>
          {/* Average line indicator */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <div className="w-3 h-0.5 bg-pink-400" />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">Your average: {stats.avgCycleLength} days</span>
          </div>
        </CollapsibleCard>
      )}

      {/* Next Predictions — collapsible */}
      <CollapsibleCard
        id="predictions"
        groupId="insights-boxes"
        openId={openBoxId}
        onToggle={setOpenBoxId}
        className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm mb-4"
        headerClassName="p-4"
        bodyClassName="px-4 pb-4"
        icon={<Target size={14} className="text-pink-400" />}
        title="Upcoming Predictions"
        subtitle={`Next period ${format(nextPeriod, 'd MMM yyyy')} · Ovulation ${format(ovulationDay, 'd MMM')}`}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-pink-50 dark:bg-pink-950/20">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">🩸 Next Period</span>
            <span className="text-xs font-semibold text-pink-600 dark:text-pink-400">
              {format(nextPeriod, 'd MMM yyyy')}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-purple-50 dark:bg-purple-950/20">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">🥚 Ovulation</span>
            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
              {format(ovulationDay, 'd MMM yyyy')}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-green-50 dark:bg-green-950/20">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">🟢 Fertile Window</span>
            <span className="text-xs font-semibold text-green-600 dark:text-green-400">
              {format(addDays(ovulationDay, -5), 'd MMM')} – {format(addDays(ovulationDay, 1), 'd MMM')}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-yellow-50 dark:bg-yellow-950/20">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">🌸 PMS May Start</span>
            <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">
              {format(addDays(nextPeriod, -5), 'd MMM yyyy')}
            </span>
          </div>
        </div>
      </CollapsibleCard>

      {/* Trend */}
      {data?.trend && (
        <CollapsibleCard
          id="trend"
          groupId="insights-boxes"
          openId={openBoxId}
          onToggle={setOpenBoxId}
          className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm mb-4"
          headerClassName="p-4"
          bodyClassName="px-4 pb-4"
          icon={<TrendingUp size={14} className="text-purple-400" />}
          title="Cycle Trend"
        >
          <p className="text-sm text-gray-600 dark:text-gray-300">{data.trend}</p>
        </CollapsibleCard>
      )}

      {/* Common Symptoms — collapsible */}
      {data?.commonSymptoms && data.commonSymptoms.length > 0 && (
        <CollapsibleCard
          id="symptoms"
          groupId="insights-boxes"
          openId={openBoxId}
          onToggle={setOpenBoxId}
          className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm mb-4"
          headerClassName="p-4"
          bodyClassName="px-4 pb-4"
          icon={<Brain size={14} className="text-purple-400" />}
          title="Most Common Symptoms"
          subtitle={data.commonSymptoms.slice(0, 3).join(', ')}
        >
          <div className="flex flex-wrap gap-2">
            {data.commonSymptoms.map((s: string) => (
              <span key={s} className="px-3 py-1.5 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 border border-purple-100 dark:border-purple-800">
                {s}
              </span>
            ))}
          </div>
        </CollapsibleCard>
      )}

      {/* Flow Distribution — collapsible */}
      {entries.length > 0 && (
        <CollapsibleCard
          id="flow"
          groupId="insights-boxes"
          openId={openBoxId}
          onToggle={setOpenBoxId}
          className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm mb-4"
          headerClassName="p-4"
          bodyClassName="px-4 pb-4"
          icon={<Droplets size={14} className="text-rose-400" />}
          title="Flow Pattern"
          subtitle={`${entries.filter(e => e.flow).length} entries with flow data`}
        >
          <div className="space-y-2">
            {(['Light', 'Medium', 'Heavy'] as const).map(f => {
              const count = entries.filter(e => e.flow === f).length;
              const total = entries.filter(e => e.flow).length;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={f} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-14">{f}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${f === 'Light' ? 'bg-pink-200' : f === 'Medium' ? 'bg-pink-400' : 'bg-pink-600'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </CollapsibleCard>
      )}

      {/* Footer note */}
      <div className="mt-6 text-center">
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          Insights auto-regenerate monthly based on your tracked data.
        </p>
      </div>
    </div>
  );
}
