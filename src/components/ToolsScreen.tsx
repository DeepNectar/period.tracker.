import { useEffect, useMemo, useState } from 'react';
import { PeriodEntry } from '../lib/supabase';
import { useAuth, updateProfileName } from '../hooks/useAuth';
import { todayKey } from '../utils/dailyLog';
import { calculateCycleStats } from '../utils/dates';
import {
  calculateCycleFromStarts,
  calculateDueDate,
  calculateOvulation,
  analyzeBbt,
  BbtReading,
  DueDateMethod,
  PMS_SYMPTOMS,
  PMS_GENERAL_TIPS,
  fmtDate,
  fmtDateShort,
  getLastPeriodStartKey,
  getPeriodStartKeys,
} from '../utils/tools';
import { format } from 'date-fns';
import { BirthdayCalculator } from './BirthdayCalculator';
import { ExportPanel } from '../utils/exportTools';
import { NotificationSettings, PartnerShare } from '../utils/notifications';
import { PrivacyLockSettings } from './PinLock';
import { HabitTracker } from './HabitTracker';

interface Props {
  entries: PeriodEntry[];
  userId?: string | null;
}

type ToolId = 'cycle-length' | 'due-date' | 'ovulation' | 'bbt' | 'pms' | 'birthday' | 'data' | 'reminders' | 'partner' | 'privacy' | 'profile' | 'habits';

const TOOLS: { id: ToolId; emoji: string; name: string; desc: string }[] = [
  { id: 'profile', emoji: '👤', name: 'My Profile', desc: 'Whose data this is — shown on the lock screen & header' },
  { id: 'cycle-length', emoji: '📏', name: 'Cycle Length Calculator', desc: 'Average cycle, regularity & next period' },
  { id: 'due-date', emoji: '🤰', name: 'Pregnancy Due Date', desc: 'Due date & conception from LMP, conception or IVF' },
  { id: 'ovulation', emoji: '🥚', name: 'Ovulation Calculator', desc: 'Ovulation day & fertile window' },
  { id: 'bbt', emoji: '🌡️', name: 'BBT Fertility Checker', desc: 'Spot your temperature shift & coverline' },
  { id: 'pms', emoji: '🌸', name: 'PMS Symptoms Guide', desc: 'Why symptoms happen & how to find relief' },
  { id: 'birthday', emoji: '🎂', name: 'Future Birthday Calculator', desc: "Child's age & birthdays, or plan a baby's birth date (conception window)" },
  { id: 'habits', emoji: '✅', name: 'Cycle Goals & Habits', desc: 'Hydration, sleep, movement streaks by phase' },
  { id: 'reminders', emoji: '🔔', name: 'Reminders', desc: 'Period, ovulation & PMS notifications' },
  { id: 'partner', emoji: '💞', name: 'Partner Mode', desc: 'Read-only share link — phase & next period only' },
  { id: 'privacy', emoji: '🔐', name: 'Privacy Lock', desc: 'PIN gate when the app reopens' },
  { id: 'data', emoji: '💾', name: 'Data & Sync', desc: 'Calendar (.ics), CSV/JSON export, PDF report, restore' },
];

// min-w-0 + max-w-full keep boxes from ever exceeding the phone screen width.
const inputCls =
  'block w-full min-w-0 max-w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-pink-300';
const card =
  'max-w-full overflow-hidden bg-white dark:bg-gray-800 rounded-3xl p-3.5 sm:p-4 shadow-sm border border-pink-100 dark:border-gray-700';

function Disclaimer() {
  return (
    <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500 px-1">
      ⚠️ These tools give calendar/temperature-based estimates for educational purposes only. They are not medical
      advice and must not be used to confirm pregnancy or as contraception. Consult a healthcare professional.
    </p>
  );
}

// ---------- shared sub-components ----------

function ResultRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="min-w-0 flex-1 basis-auto text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span
        className={`min-w-0 max-w-full break-words text-right text-sm font-semibold ${
          highlight ? 'text-pink-600 dark:text-pink-400' : 'text-gray-800 dark:text-gray-100'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-2">{children}</h3>;
}

// ---------- 1. Cycle Length Calculator ----------

function CycleLengthTool({ entries }: { entries: PeriodEntry[] }) {
  const autoStarts = useMemo(() => getPeriodStartKeys(entries), [entries]);
  const [manual, setManual] = useState('');
  const useManual = manual.trim().length > 0;
  const starts = useMemo(() => {
    if (useManual) {
      return manual
        .split(/[,;\s\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return autoStarts;
  }, [useManual, manual, autoStarts]);

  const result = useMemo(() => {
    try {
      return calculateCycleFromStarts(starts);
    } catch {
      return null;
    }
  }, [starts]);

  return (
    <div className="space-y-4">
      <div className={card}>
        <SectionTitle>📥 Your period start dates</SectionTitle>
        {!useManual && starts.length >= 1 && (
          <div className="mb-3 bg-pink-50 dark:bg-pink-900/20 rounded-2xl p-3">
            <p className="text-xs font-semibold text-pink-600 dark:text-pink-300 mb-1">
              {starts.length >= 2
                ? `Using ${starts.length} periods from your logged history ✨`
                : `Auto-filled from your logged history ✨ — log one more period to calculate an average`}
            </p>
            <p className="text-[11px] break-words text-gray-500 dark:text-gray-400">
              {starts.slice(-8).map(fmtDateShort).join(' · ')}
            </p>
          </div>
        )}
        {!useManual && starts.length === 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2">
            No periods logged yet — the calculator auto-fills from your history once you log periods, or enter dates below.
          </p>
        )}
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
          Or enter your own (comma-separated, YYYY-MM-DD):
        </label>
        <input
          className={inputCls}
          placeholder="e.g. 2026-07-02, 2026-07-30, 2026-08-27"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
      </div>

      {result ? (
        <>
          <div className={`${card}`}>
            <div className="text-center mb-3">
              <p className="text-4xl font-extrabold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
                {result.averageLength} days
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">average cycle length</p>
            </div>
            <ResultRow label="Shortest cycle" value={`${result.shortest} days`} />
            <ResultRow label="Longest cycle" value={`${result.longest} days`} />
            <ResultRow label="Variation" value={`${result.variability} days`} />
            <ResultRow
              label="Regularity"
              value={
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    result.regularity === 'regular'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                      : result.regularity === 'moderate'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  }`}
                >
                  {result.regularity === 'regular' ? 'Regular' : result.regularity === 'moderate' ? 'Moderate' : 'Irregular'}
                </span>
              }
            />
            {result.cycleDayToday !== null && (
              <ResultRow label="Today is cycle day" value={result.cycleDayToday} />
            )}
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">{result.regularityNote}</p>
            {result.ignoredCount > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                ({result.ignoredCount} date(s) ignored — gaps too short or long to be one cycle)
              </p>
            )}
          </div>

          <div className={card}>
            <SectionTitle>🔮 Based on your average</SectionTitle>
            <ResultRow label="Next period expected" value={fmtDate(result.nextPeriodDate)} highlight />
            <ResultRow label="Ovulation estimate" value={fmtDate(result.ovulationDate)} />
            <ResultRow
              label="Fertile window"
              value={`${fmtDateShort(result.fertileStart)} – ${fmtDateShort(result.fertileEnd)}`}
            />
          </div>
        </>
      ) : (
        <div className={`${card} text-center`}>
          <p className="text-3xl mb-2">🗓️</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter at least two period start dates (or log two periods in the app) to calculate your average cycle
            length.
          </p>
        </div>
      )}
      <Disclaimer />
    </div>
  );
}

// ---------- 2. Pregnancy Due Date Calculator ----------

function DueDateTool({ entries }: { entries: PeriodEntry[] }) {
  const autoLmp = useMemo(() => getLastPeriodStartKey(entries), [entries]);
  const [method, setMethod] = useState<DueDateMethod>('lmp');
  // Auto-filled with the first day of the last period from logged data
  const [date, setDate] = useState(autoLmp ?? '');
  const [overridden, setOverridden] = useState(false);
  const [ivfDay, setIvfDay] = useState<number>(5);

  // Keep the auto value in sync until the user manually picks a date
  useEffect(() => {
    if (!overridden && autoLmp) setDate(autoLmp);
  }, [autoLmp, overridden]);

  const result = useMemo(() => {
    if (!date) return null;
    try {
      return calculateDueDate(method, date, ivfDay);
    } catch {
      return null;
    }
  }, [method, date, ivfDay]);

  const methods: { id: DueDateMethod; label: string; hint: string }[] = [
    { id: 'lmp', label: 'Last period (LMP)', hint: 'First day of your last menstrual period' },
    { id: 'conception', label: 'Conception date', hint: 'The day you believe conception happened' },
    { id: 'ivf-transfer', label: 'IVF / embryo transfer', hint: 'Your transfer date + embryo age' },
  ];

  return (
    <div className="space-y-4">
      <div className={card}>
        <SectionTitle>🧮 How do you want to calculate?</SectionTitle>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {methods.map((m) => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={`px-2 py-2 rounded-xl text-[11px] font-semibold border transition-colors ${
                method === m.id
                  ? 'bg-pink-500 text-white border-pink-500'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
          {methods.find((m) => m.id === method)?.hint}
        </p>
        {method === 'lmp' && autoLmp && !overridden && (
          <div className="mb-2 bg-pink-50 dark:bg-pink-900/20 rounded-2xl p-2.5 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-pink-600 dark:text-pink-300">
              ✨ Auto-filled from your logged period ({fmtDateShort(autoLmp)})
            </p>
            <button
              onClick={() => { setOverridden(true); setDate(''); }}
              className="text-[10px] font-bold text-gray-400 hover:text-pink-500 underline shrink-0"
            >
              Change
            </button>
          </div>
        )}
        {method === 'lmp' && !autoLmp && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2">
            No period logged yet — enter it manually below. It will auto-fill once you log a period.
          </p>
        )}
        <input
          type="date"
          className={inputCls}
          value={date}
          onChange={(e) => { setOverridden(true); setDate(e.target.value); }}
        />
        {method === 'ivf-transfer' && (
          <div className="mt-3">
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Embryo age at transfer</label>
            <select className={inputCls} value={ivfDay} onChange={(e) => setIvfDay(Number(e.target.value))}>
              <option value={3}>Day-3 (cleavage stage)</option>
              <option value={5}>Day-5 (blastocyst)</option>
              <option value={6}>Day-6 (blastocyst)</option>
            </select>
          </div>
        )}
      </div>

      {result && (
        <>
          <div className="bg-gradient-to-br from-pink-500 to-purple-500 max-w-full overflow-hidden rounded-3xl p-4 text-white shadow-lg text-center">
            <p className="text-xs opacity-80 uppercase tracking-widest">Estimated due date</p>
            <p className="mt-1 break-words text-xl sm:text-2xl font-extrabold">{format(new Date(`${result.dueDate}T00:00:00`), 'd MMMM yyyy')}</p>
            <p className="text-xs opacity-90 mt-2">
              Today you are{' '}
              <b>
                {result.currentGestationalAge.weeks}w {result.currentGestationalAge.days}d
              </b>{' '}
              pregnant{result.trimester ? ` — ${result.trimester.label}` : ''}
            </p>
            <div className="mt-2.5 bg-white/20 rounded-full h-2 overflow-hidden">
              <div className="bg-white h-full rounded-full transition-all" style={{ width: `${result.progressPercent}%` }} />
            </div>
            <p className="text-[10px] opacity-80 mt-1">{result.progressPercent}% of the 40-week journey</p>
          </div>

          <div className={card}>
            <SectionTitle>📋 Details</SectionTitle>
            {result.conceptionEstimate && <ResultRow label="Estimated conception" value={fmtDate(result.conceptionEstimate)} />}
            {result.trimester && <ResultRow label="Trimester" value={`${result.trimester.label} (${result.trimesterRange})`} />}
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">{result.note}</p>
          </div>

          {result.nextMilestone && (
            <div className={`${card} bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-800`}>
              <SectionTitle>👶 Next milestone — week {result.nextMilestone.week}</SectionTitle>
              <p className="text-xs text-gray-600 dark:text-gray-300">{result.nextMilestone.text}</p>
            </div>
          )}
        </>
      )}
      <Disclaimer />
    </div>
  );
}

// ---------- 3. Ovulation Calculator ----------

function OvulationTool({ entries }: { entries: PeriodEntry[] }) {
  const stats = useMemo(() => calculateCycleStats(entries), [entries]);
  const autoStart = useMemo(() => getLastPeriodStartKey(entries), [entries]);
  const [start, setStart] = useState(autoStart ?? '');
  const [overridden, setOverridden] = useState(false);
  const [lenOverridden, setLenOverridden] = useState(false);
  const [len, setLen] = useState<number>(stats.avgCycleLength);

  useEffect(() => {
    if (!overridden && autoStart) setStart(autoStart);
  }, [autoStart, overridden]);

  // Follow the logged average until the user moves the slider manually.
  useEffect(() => {
    if (!lenOverridden) setLen(stats.avgCycleLength);
  }, [stats.avgCycleLength, lenOverridden]);

  const result = useMemo(() => {
    if (!start) return null;
    try {
      return calculateOvulation(start, len);
    } catch {
      return null;
    }
  }, [start, len]);

  return (
    <div className="space-y-4">
      <div className={card}>
        <SectionTitle>🥚 Calculate your ovulation & fertile window</SectionTitle>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">First day of your last period</label>
        {autoStart && !overridden && (
          <p className="text-[11px] font-semibold text-pink-600 dark:text-pink-300 mb-1.5">
            ✨ Auto-filled from your logged period ({fmtDateShort(autoStart)}) — change below if needed
          </p>
        )}
        <input
          type="date"
          className={inputCls}
          value={start}
          onChange={(e) => { setOverridden(true); setStart(e.target.value); }}
        />
        <label className="text-xs text-gray-500 dark:text-gray-400 block mt-3 mb-1">
          Average cycle length: <b className="text-pink-500">{len} days</b>
          {entries.length > 0 && <span className="ml-1">(your logged average is {stats.avgCycleLength})</span>}
        </label>
        <input
          type="range"
          min={21}
          max={45}
          value={len}
          onChange={(e) => { setLenOverridden(true); setLen(Number(e.target.value)); }}
          className="w-full accent-pink-500"
        />
        <div className="flex justify-between text-[10px] text-gray-400">
          <span>21</span><span>28</span><span>35</span><span>45</span>
        </div>
      </div>

      {result && (
        <>
          <div className="bg-gradient-to-br from-purple-500 to-pink-500 max-w-full overflow-hidden rounded-3xl p-4 text-white shadow-lg text-center">
            <p className="text-xs opacity-80 uppercase tracking-widest">Estimated ovulation day</p>
            <p className="mt-1 break-words text-xl sm:text-2xl font-extrabold">{fmtDate(result.ovulationDate)}</p>
            <p className="text-xs opacity-90 mt-2">
              {result.daysUntilOvulation > 0
                ? `in ${result.daysUntilOvulation} day${result.daysUntilOvulation > 1 ? 's' : ''}`
                : result.daysUntilOvulation === 0
                  ? "that's today 🎯"
                  : `${Math.abs(result.daysUntilOvulation)} days ago`}
            </p>
          </div>

          <div className={card}>
            <SectionTitle>💗 Fertile window</SectionTitle>
            <ResultRow
              label="Fertile days"
              value={`${fmtDateShort(result.fertileStart)} – ${fmtDateShort(result.fertileEnd)}`}
              highlight
            />
            <ResultRow label="Peak fertility" value={result.peakDays.map(fmtDateShort).join(', ')} />
            <ResultRow label="Next period expected" value={fmtDate(result.nextPeriodDate)} />
            {result.withinFertileNow && (
              <div className="mt-3 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-300 rounded-2xl p-3 text-xs font-semibold text-center">
                You're inside your fertile window right now 💗
              </div>
            )}
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
              The egg survives ~12–24 hours after release; sperm can survive up to 5 days — which is why the window is
              about 6 days long.
            </p>
          </div>
        </>
      )}
      <Disclaimer />
    </div>
  );
}

// ---------- 4. BBT Fertility Checker ----------

function BbtTool() {
  const [unit, setUnit] = useState<'F' | 'C'>('F');
  const [rows, setRows] = useState<BbtReading[]>([{ date: todayKey(), temp: NaN }]);
  const [draftDate, setDraftDate] = useState('');
  const [draftTemp, setDraftTemp] = useState('');

  const analysis = useMemo(() => {
    const valid = rows.filter((r) => r.date && !Number.isNaN(r.temp));
    try {
      return analyzeBbt(valid, unit);
    } catch {
      return null;
    }
  }, [rows, unit]);

  const addRow = () => {
    const t = parseFloat(draftTemp);
    if (!draftDate || Number.isNaN(t)) return;
    setRows((prev) => {
      // Replace any existing reading for the same date, keep empty placeholder rows.
      const withoutSameDate = prev.filter((r) => r.date !== draftDate || Number.isNaN(r.temp));
      const filled = withoutSameDate.filter((r) => !Number.isNaN(r.temp));
      const empties = withoutSameDate.filter((r) => Number.isNaN(r.temp));
      const next = [...filled, { date: draftDate, temp: t }].sort((a, b) => (a.date < b.date ? -1 : 1));
      return [...next, ...empties];
    });
    setDraftDate('');
    setDraftTemp('');
  };

  const removeRow = (i: number) =>
    setRows((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length ? next : [{ date: todayKey(), temp: NaN }];
    });

  const temps = rows.filter((r) => !Number.isNaN(r.temp)).map((r) => r.temp);
  const minT = temps.length ? Math.min(...temps) : 0;
  const maxT = temps.length ? Math.max(...temps) : 1;
  const span = Math.max(0.3, maxT - minT);

  return (
    <div className="space-y-4">
      <div className={card}>
        <SectionTitle>🌡️ Basal body temperature checker</SectionTitle>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Add your morning temperatures (taken before getting out of bed). After ~2 weeks the tool looks for the
          sustained post-ovulation rise.
        </p>
        <div className="flex gap-2 mb-3">
          {(['F', 'C'] as const).map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border ${
                unit === u
                  ? 'bg-pink-500 text-white border-pink-500'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
              }`}
            >
              °{u}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">Date</label>
            <input type="date" className={inputCls} value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
          </div>
          <div className="w-24">
            <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">Temp °{unit}</label>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              className={inputCls}
              placeholder={unit === 'F' ? '97.4' : '36.3'}
              value={draftTemp}
              onChange={(e) => setDraftTemp(e.target.value)}
            />
          </div>
          <button
            onClick={addRow}
            className="px-4 py-2.5 rounded-xl bg-pink-500 text-white text-sm font-bold active:scale-95 transition-transform"
          >
            +
          </button>
        </div>

        {rows.length > 0 && (
          <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-900 rounded-xl px-3 py-1.5">
                <span className="text-gray-600 dark:text-gray-300">{fmtDate(r.date)}</span>
                <span className="font-bold text-gray-800 dark:text-gray-100">
                  {Number.isNaN(r.temp) ? '—' : `${r.temp.toFixed(2)}°`}
                </span>
                <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-500 px-2">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {analysis && (
        <>
          {/* Mini chart */}
          <div className={card}>
            <SectionTitle>📈 Your trend</SectionTitle>
            <div className="flex items-end gap-1 h-24">
              {analysis.readings.map((r, i) => {
                const h = 12 + ((r.temp - minT) / span) * 80;
                const above = r.temp > (analysis.coverline ?? Infinity);
                return (
                  <div
                    key={i}
                    title={`${fmtDateShort(r.date)}: ${r.temp.toFixed(2)}°`}
                    className={`flex-1 rounded-t-md ${above ? 'bg-pink-500' : 'bg-purple-200 dark:bg-purple-800'}`}
                    style={{ height: `${h}px` }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              {analysis.readings.map((r, i) => (
                <span key={i} className="text-[10px] text-gray-400 flex-1 text-center">
                  {format(new Date(`${r.date}T00:00:00`), 'd')}
                </span>
              ))}
            </div>
          </div>

          <div className={card}>
            <SectionTitle>🔍 Analysis</SectionTitle>
            <ResultRow label="Days of data" value={analysis.coveredDays} />
            <ResultRow label="Coverline" value={`${(analysis.coverline ?? 0).toFixed(2)}°${analysis.unit}`} />
            <ResultRow
              label="Possible ovulation"
              value={analysis.possibleOvulation ? fmtDate(analysis.possibleOvulation) : 'Not detected yet'}
              highlight={!!analysis.possibleOvulation}
            />
            <ResultRow
              label="Current phase"
              value={analysis.currentlyElevated ? 'Elevated (post-ovulation)' : 'Low (pre-ovulation)'}
            />
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">{analysis.interpretation}</p>
          </div>

          <div className={`${card} bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-800`}>
            <SectionTitle>✅ Accurate BBT tips</SectionTitle>
            <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5 list-disc pl-4">
              {analysis.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        </>
      )}
      {!analysis && (
        <div className={`${card} text-center`}>
          <p className="text-3xl mb-2">🌡️</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Add at least 3 readings to see an analysis.</p>
        </div>
      )}
      <Disclaimer />
    </div>
  );
}

// ---------- 5. PMS Symptoms Guide ----------

function PmsTool() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className={card}>
        <SectionTitle>🌸 Understanding PMS</SectionTitle>
        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
          Up to 80% of menstruating people experience premenstrual symptoms in the 1–2 weeks before their period
          (the luteal phase). They're driven mainly by the rise and fall of estrogen and progesterone. Tap any
          symptom below to learn why it happens and what actually helps.
        </p>
      </div>

      {PMS_SYMPTOMS.map((s) => {
        const isOpen = open === s.name;
        return (
          <div key={s.name} className={card}>
            <button className="w-full flex items-center justify-between" onClick={() => setOpen(isOpen ? null : s.name)}>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                {s.emoji} {s.name}
              </span>
              <span className="text-pink-400 text-lg">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-purple-500 mb-1">Why it happens</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{s.why}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400 mb-1">
                    What helps
                  </p>
                  <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1 list-disc pl-4">
                    {s.relief.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
                {s.seeDoctor && (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-red-500 mb-1">See a doctor if</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">{s.seeDoctor}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className={`${card} bg-pink-50 dark:bg-pink-900/20 border-pink-100 dark:border-pink-800`}>
        <SectionTitle>💡 General evidence-based tips</SectionTitle>
        <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5 list-disc pl-4">
          {PMS_GENERAL_TIPS.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
      <Disclaimer />
    </div>
  );
}

// ---------- My Profile (whose data is this) ----------

export function ProfileTool() {
  const { user } = useAuth();
  const [name, setName] = useState(() => localStorage.getItem('pt_profile_name') || '');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Prefill from account metadata / synced lock config when available.
    if (!name) {
      const meta = (user?.user_metadata?.full_name || user?.user_metadata?.name || '') as string;
      if (meta.trim()) setName(meta.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await updateProfileName(name); // local + auth metadata + synced lock config
    setBusy(false);
    setMsg('✅ Saved! Your name now appears on the app header and the PIN lock screen on all your devices.');
  };

  return (
    <div className={`${card} space-y-3`}>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">👤 Whose data is this?</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        This name is shown in the app header and on the Privacy Lock screen of every device signed into this
        account, so you always know whose tracker you are opening.
      </p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          placeholder="Your name (e.g. Priya)"
          className={inputCls}
        />
        <button
          onClick={() => void save()}
          disabled={!name.trim() || busy}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-medium disabled:opacity-40 shrink-0"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {user?.email && (
        <p className="text-[11px] text-gray-400">Signed in as <b>{user.email}</b></p>
      )}
      {!user && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          You are using guest mode — the name stays on this device only. Sign in with an account to sync it (and
          your PIN lock) across all devices.
        </p>
      )}
      {msg && <p className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</p>}
    </div>
  );
}

// ---------- Main screen ----------

export function ToolsScreen({ entries, userId: userIdProp = null }: Props) {
  const { user } = useAuth();
  // Fall back to the signed-in account id so Reminders / Partner Mode can sync.
  const userId = userIdProp ?? user?.id ?? null;
  const [active, setActive] = useState<ToolId | null>(null);
  const tool = TOOLS.find((t) => t.id === active);

  if (tool) {
    return (
      <div className="screen-pad py-3 space-y-3 max-w-xl mx-auto overflow-x-hidden">
        <button
          onClick={() => setActive(null)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-pink-500 hover:text-pink-600"
        >
          ← All tools
        </button>
        <div className="text-center">
          <p className="text-3xl">{tool.emoji}</p>
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">{tool.name}</h2>
        </div>
        {tool.id === 'profile' && <ProfileTool />}
        {tool.id === 'cycle-length' && <CycleLengthTool entries={entries} />}
        {tool.id === 'due-date' && <DueDateTool entries={entries} />}
        {tool.id === 'ovulation' && <OvulationTool entries={entries} />}
        {tool.id === 'bbt' && <BbtTool />}
        {tool.id === 'pms' && <PmsTool />}
        {tool.id === 'birthday' && <BirthdayCalculator />}
        {tool.id === 'habits' && <HabitTracker />}
        {tool.id === 'reminders' && <NotificationSettings entries={entries} userId={userId} />}
        {tool.id === 'partner' && <PartnerShare entries={entries} userId={userId} />}
        {tool.id === 'privacy' && <PrivacyLockSettings />}
        {tool.id === 'data' && <ExportPanel entries={entries} />}
      </div>
    );
  }

  return (
    <div className="screen-pad py-3 space-y-3 max-w-xl mx-auto overflow-x-hidden">
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-pink-400 font-semibold">Tools</p>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Period & fertility calculators</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Free calculators — no sign-up needed. Tools using your history fill in automatically.
        </p>
      </div>
      <div className="space-y-3">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`${card} w-full min-w-0 flex items-center gap-3 text-left hover:border-pink-300 dark:hover:border-pink-700 transition-colors active:scale-[0.99]`}
          >
            <span className="text-2xl shrink-0">{t.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">{t.name}</span>
              <span className="block text-[11px] break-words text-gray-500 dark:text-gray-400 mt-0.5">{t.desc}</span>
            </span>
            <span className="shrink-0 text-pink-300 text-lg">›</span>
          </button>
        ))}
      </div>
      <Disclaimer />
    </div>
  );
}
