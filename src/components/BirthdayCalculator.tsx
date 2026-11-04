import { useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import {
  getAgeOnDate,
  getNextBirthday,
  birthdayDateForAge,
  diffDaysBetweenKeys,
  getZodiac,
  toKey,
  fromKey,
  fmtDate,
  type BirthdayAgeParts,
} from '../utils/tools';
import { buildPartyPlans, isWeekend, type PrepLead } from '../utils/birthdayPlan';
import { buildConceptionPlan, formatPlanDate } from '../utils/conceptionPlan';

/**
 * Future Birthday Calculator — inspired by babymed.com's tool, built
 * natively in our app. Two modes:
 *
 *  MODE 1 — Child birthday calculator (existing):
 *  • Exact age today (years / months / days), total time lived, birth
 *    weekday + sun sign, countdown to the next birthday, a table of the
 *    next 10 birthdays, and a Party Planner tab.
 *
 *  MODE 2 — Plan a baby's birth date (like babyMed's core feature):
 *  Enter the future birthday you'd love your baby to be born on, and we
 *  work BACKWARDS through the pregnancy to show the estimated conception
 *  date, the fertile window, and the best days to have sex / try to
 *  conceive so the baby arrives around that date.
 *
 * All input state lives inside this component so typing never triggers a
 * re-render of the parent ToolsScreen (no "refresh"/focus loss mid-typing).
 */

type Mode = 'child' | 'conceive';
type Tab = 'ages' | 'plan';

const MS_DAY = 86400000;
const NEXT_BIRTHDAYS_COUNT = 10;

interface Totals {
  years: number;
  months: number;
  weeks: number;
  days: number;
  decadeFraction: string; // e.g. "0.5237"
}

/** Whole-year/month/day elapsed between two dates (same algorithm as getAgeOnDate). */
function elapsedYMD(from: Date, to: Date): BirthdayAgeParts {
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(to.getFullYear(), to.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

/** Total time lived broken into years, months, weeks, days + fraction of a decade. */
function getTotalLived(birthKey: string, todayKey: string): Totals {
  const birth = fromKey(birthKey);
  const days = Math.round((fromKey(todayKey).getTime() - birth.getTime()) / MS_DAY);
  const ymd = elapsedYMD(birth, fromKey(todayKey));
  const remainderAfterMonths = Math.round(
    (fromKey(todayKey).getTime() - new Date(birth.getFullYear() + ymd.years, birth.getMonth() + ymd.months, birth.getDate()).getTime()) / MS_DAY,
  );
  return {
    years: ymd.years,
    months: ymd.months,
    weeks: Math.floor((days - remainderAfterMonths) / 7) + 0, // whole weeks within the elapsed span
    days,
    decadeFraction: (days / 3652.425).toFixed(4),
  };
}

/** The next `count` upcoming birthdays with date, weekday and age turned. */
function getUpcomingBirthdays(birthKey: string, todayKey: string, count: number) {
  const list: { ageTurns: number; dateKey: string; weekday: string; daysUntil: number }[] = [];
  const current = getAgeOnDate(birthKey, fromKey(todayKey));
  for (let age = current.years; age <= current.years + count && list.length < count; age++) {
    if (age === 0) continue;
    const dateKey = birthdayDateForAge(birthKey, age);
    const daysUntil = diffDaysBetweenKeys(todayKey, dateKey);
    if (daysUntil < 0) continue; // already passed this year's birthday
    list.push({ ageTurns: age, dateKey, weekday: format(fromKey(dateKey), 'EEEE'), daysUntil });
  }
  return list;
}

const LEAD_META: Record<PrepLead, { label: string; cls: string }> = {
  now: { label: 'This week', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  'this-week': { label: '2–4 weeks before', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  advance: { label: '1+ month before', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
};

const card = 'bg-white dark:bg-gray-800 rounded-3xl p-4 shadow-sm border border-pink-100 dark:border-gray-700';
const inputCls =
  'w-full rounded-xl border border-pink-200 dark:border-gray-600 bg-pink-50/50 dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-pink-400';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold uppercase tracking-widest text-pink-400 mb-2">{children}</h3>;
}

function ResultRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-pink-50 dark:border-gray-700 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-sm font-bold ${highlight ? 'text-pink-600 dark:text-pink-400' : 'text-gray-800 dark:text-gray-100'}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Mode 2 — babyMed-style reverse planner: enter the birthday you want your
 * baby to be born on; we estimate conception date, fertile window and the
 * best days to have sex / try to conceive. State is local so typing never
 * re-renders the parent (no refresh / focus loss).
 */
function ConceptionMode() {
  const today = useMemo(() => new Date(), []);
    // Draft input committed only on Calculate/Enter.
  const [targetInput, setTargetInput] = useState('');
  const [target, setTarget] = useState<string | null>(null);

  const handleCalculate = () => {
    if (!targetInput) return;
    setTarget(targetInput);
  };

  const plan = useMemo(() => {
    if (!target) return null;
    const d = fromKey(target);
    if (isNaN(d.getTime()) || d <= today) return null;
    return buildConceptionPlan(target);
  }, [target, today]);

  return (
    <div className="space-y-4">
      <div className={card}>
        <SectionTitle>👶 Desired future birth date</SectionTitle>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Pick the birthday you'd love your baby to arrive on — we'll work backwards through a
          typical ~40-week pregnancy to find when conception would need to happen.
        </p>
        <input
          type="date"
          className={inputCls}
          value={targetInput}
          min={toKey(addDays(today, 30))}
          onChange={(e) => setTargetInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCalculate();
            }
          }}
        />
        <button
          type="button"
          onClick={handleCalculate}
          disabled={!targetInput}
          className="mt-4 w-full px-4 py-2.5 rounded-xl bg-pink-500 text-white text-sm font-bold active:scale-95 transition-transform disabled:opacity-40"
        >
          Plan conception dates 💞
        </button>
      </div>

      {plan ? (
        <>
          {/* Headline: estimated conception day */}
          <div className="bg-gradient-to-br from-pink-500 to-purple-500 rounded-3xl p-5 text-white shadow-lg text-center">
            <p className="text-xs opacity-80 uppercase tracking-widest">To conceive, aim for</p>
            <p className="text-2xl font-extrabold mt-1">{formatPlanDate(plan.bestConceptionKey)}</p>
            <p className="text-xs opacity-90 mt-2">
              Estimated ovulation / conception for a baby born {formatPlanDate(plan.targetBirthDate)}
            </p>
          </div>

          {/* Best days to have sex */}
          <div className={card}>
            <SectionTitle>💞 Right days to have sex</SectionTitle>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              Sperm can live up to 5 days, but the egg only lives 12–24 hours — so having sex in the
              days BEFORE ovulation gives the best chance of conceiving around this time.
            </p>
            <ul className="space-y-1.5">
              {plan.sexDayKeys.map((key) => {
                const isOvulation = key === plan.bestConceptionKey;
                return (
                  <li
                    key={key}
                    className={`flex items-center justify-between text-xs rounded-xl px-3 py-2 border ${
                      isOvulation
                        ? 'bg-pink-50 dark:bg-pink-900/30 border-pink-200 dark:border-pink-700 font-bold'
                        : 'bg-white dark:bg-gray-800 border-pink-100 dark:border-gray-700'
                    }`}
                  >
                    <span className="text-gray-800 dark:text-gray-100">{formatPlanDate(key)}</span>
                    <span className={isOvulation ? 'text-pink-600 dark:text-pink-300' : 'text-gray-400'}>
                      {isOvulation ? '★ ovulation day' : 'good day'}
                    </span>
                  </li>
                );
              })}
            </ul>
            <ResultRow
              label="Fertile window"
              value={`${fmtDate(plan.fertileWindow.startKey)} → ${fmtDate(plan.fertileWindow.endKey)}`}
              highlight
            />
            <ResultRow
              label="Expected last period (LMP) starts"
              value={formatPlanDate(plan.lmpKey)}
            />
          </div>

          {/* Conception dates by pregnancy length */}
          <div className={card}>
            <SectionTitle>🤰 Conception date by pregnancy length</SectionTitle>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              Babies arrive anywhere from 37–40+ weeks, so these are the conception dates that could
              each lead to your chosen birth day.
            </p>
            {plan.conceptionDates.map((c) => (
              <ResultRow
                key={c.week}
                label={`${c.label} pregnancy`}
                value={formatPlanDate(c.dateKey)}
                highlight={c.week === 39}
              />
            ))}
          </div>

          {plan.notes.length > 0 && (
            <div className={`${card} border-amber-200 dark:border-amber-700`}>
              {plan.notes.map((n) => (
                <p key={n} className="text-xs text-amber-700 dark:text-amber-300">
                  ⏳ {n}
                </p>
              ))}
            </div>
          )}

          <div className={card}>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
              ℹ️ These dates are estimates based on an average 28-day cycle with ovulation on day 14.
              Every body is different — cycles vary, and only about 20–25% of couples conceive in any
              given cycle even with perfect timing. Use this as planning guidance, not a guarantee;
              ovulation predictor kits or cycle tracking in this app can personalise it further.
            </p>
          </div>
        </>
      ) : (
        <div className={`${card} text-center`}>
          <p className="text-3xl mb-2">💞</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Choose a future birth date (at least ~1 month out) and tap "Plan conception dates" to see
            the estimated conception day, fertile window and the best days to try for a baby.
            {target && fromKey(target) <= today && (
              <span className="block mt-1 text-amber-600 dark:text-amber-400">
                Please pick a date at least a month in the future — a pregnancy needs ~9 months! 🙂
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export function BirthdayCalculator() {
  const today = useMemo(() => new Date(), []);
  const todayKeyStr = useMemo(() => toKey(today), [today]);

  const [mode, setMode] = useState<Mode>('child');
  const [tab, setTab] = useState<Tab>('ages');

  // Birth date is captured once per calculation via the Calculate button,
  // so keystrokes in the field never recompute / re-render results mid-typing.
  const [birthInput, setBirthInput] = useState('');
  const [birth, setBirth] = useState<string | null>(null);

  // Optional "calculate as of" date — exact age on a chosen future date.
  const [useAsOf, setUseAsOf] = useState(false);
  const [asOfInput, setAsOfInput] = useState(todayKeyStr);
  const [asOf, setAsOf] = useState<string | null>(null);

  const handleCalculate = () => {
    const trimmed = birthInput.trim();
    if (!trimmed) return;
    setBirth(trimmed);
    setAsOf(useAsOf && asOfInput ? asOfInput : null);
  };

  const analysis = useMemo(() => {
    if (!birth) return null;
    const birthDate = fromKey(birth);
    if (isNaN(birthDate.getTime()) || birthDate > today) return null;

    const currentAge = getAgeOnDate(birth, today);
    const next = getNextBirthday(birth, todayKeyStr);
    const totals = getTotalLived(birth, todayKeyStr);
    const daysToNext = diffDaysBetweenKeys(todayKeyStr, next.dateKey);
    const asOfDate = asOf ? fromKey(asOf) : null;
    const nextYMD = elapsedYMD(today, fromKey(next.dateKey));

    return {
      currentAge,
      totals,
      next,
      daysToNext,
      nextCountdown: {
        days: daysToNext,
        weeks: Math.floor(daysToNext / 7),
        months: nextYMD.months,
        years: nextYMD.years,
      },
      upcoming: getUpcomingBirthdays(birth, todayKeyStr, NEXT_BIRTHDAYS_COUNT),
      zodiac: getZodiac(birthDate.getMonth() + 1, birthDate.getDate()),
      birthdayWeekday: format(fromKey(next.dateKey), 'EEEE'),
      birthWeekday: format(birthDate, 'EEEE'),
      asOfAge: asOfDate && asOfDate >= birthDate ? getAgeOnDate(birth, asOfDate) : null,
      partyPlans: buildPartyPlans(birth, today, 3),
    };
  }, [birth, asOf, today, todayKeyStr]);

  return (
    <div className="space-y-4">
      {/* Mode switch: our child's birthday vs planning a future baby's birth date */}
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { id: 'child', label: '🎂 Child birthday' },
            { id: 'conceive', label: '💞 Plan a baby' },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`py-2 rounded-xl text-sm font-bold transition-colors ${
              mode === m.id
                ? 'bg-pink-500 text-white shadow'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-pink-100 dark:border-gray-700'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'conceive' && <ConceptionMode />}

      {mode === 'child' && (
        <>
      <div className={card}>
        <SectionTitle>🎂 Child's date of birth</SectionTitle>
        <input
          type="date"
          className={inputCls}
          value={birthInput}
          max={todayKeyStr}
          onChange={(e) => setBirthInput(e.target.value)}
          onKeyDown={(e) => {
            // Prevent implicit form submission / page refresh when pressing Enter
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCalculate();
            }
          }}
        />
        <label className="flex items-center gap-2 mt-3 text-xs text-gray-600 dark:text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-pink-500"
            checked={useAsOf}
            onChange={(e) => {
              setUseAsOf(e.target.checked);
              if (e.target.checked && !asOfInput) setAsOfInput(todayKeyStr);
            }}
          />
          Also show exact age on a specific future date
        </label>
        {useAsOf && (
          <input
            type="date"
            className={`${inputCls} mt-2`}
            min={birthInput || undefined}
            value={asOfInput}
            onChange={(e) => setAsOfInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCalculate();
              }
            }}
          />
        )}
        <button
          type="button"
          onClick={handleCalculate}
          disabled={!birthInput}
          className="mt-4 w-full px-4 py-2.5 rounded-xl bg-pink-500 text-white text-sm font-bold active:scale-95 transition-transform disabled:opacity-40"
        >
          Calculate 🎉
        </button>
      </div>

      {analysis ? (
        <>
          {/* Tabs: age results vs party planning */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'ages', label: '🎈 Ages & Dates' },
                { id: 'plan', label: '🎉 Party Planner' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`py-2 rounded-xl text-sm font-bold transition-colors ${
                  tab === t.id
                    ? 'bg-pink-500 text-white shadow'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-pink-100 dark:border-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'ages' && (
            <>
              {asOf && (
                <div className="bg-gradient-to-br from-amber-400 to-pink-500 rounded-3xl p-5 text-white shadow-lg text-center">
                  <p className="text-xs opacity-80 uppercase tracking-widest">Age on {fmtDate(asOf)}</p>
                  {analysis.asOfAge ? (
                    <p className="text-2xl font-extrabold mt-1">
                      {analysis.asOfAge.years} years, {analysis.asOfAge.months} months, {analysis.asOfAge.days} days
                    </p>
                  ) : (
                    <p className="text-sm mt-1 opacity-90">That date is before the date of birth 🤔</p>
                  )}
                </div>
              )}

              {/* Countdown to the next birthday — like the site's "Your Next Birthday" */}
              <div className="bg-gradient-to-br from-pink-500 to-purple-500 rounded-3xl p-5 text-white shadow-lg text-center">
                <p className="text-xs opacity-80 uppercase tracking-widest">Your Next Birthday</p>
                <p className="text-2xl font-extrabold mt-1">
                  Turns {analysis.next.ageTurns} — {fmtDate(analysis.next.dateKey)}
                </p>
                <p className="text-xs opacity-90 mt-2">{analysis.birthdayWeekday}</p>
                {analysis.daysToNext === 0 ? (
                  <p className="text-sm font-bold mt-2">It's the birthday today! 🎉</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {[
                      { n: analysis.nextCountdown.days, unit: 'days' },
                      { n: analysis.nextCountdown.weeks, unit: 'weeks' },
                      { n: `${analysis.nextCountdown.years > 0 ? `${analysis.nextCountdown.years}y ${analysis.nextCountdown.months}` : analysis.nextCountdown.months}`, unit: 'months' },
                    ].map((c) => (
                      <div key={c.unit} className="bg-white/15 rounded-2xl py-2">
                        <p className="text-xl font-extrabold leading-none">{c.n}</p>
                        <p className="text-[10px] uppercase tracking-wider opacity-80 mt-1">{c.unit}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Current age — like the site's "Current Age in Years, Months & Days" */}
              <div className={card}>
                <SectionTitle>🎒 Current Age (years, months &amp; days)</SectionTitle>
                <ResultRow
                  label="Exact age today"
                  value={`${analysis.currentAge.years} years, ${analysis.currentAge.months} months, ${analysis.currentAge.days} days`}
                  highlight
                />
                <ResultRow
                  label="Total age"
                  value={`${analysis.totals.years}y ${analysis.totals.months}m · ${analysis.totals.weeks.toLocaleString()} weeks · ${analysis.totals.days.toLocaleString()} days`}
                />
                <ResultRow label="Fraction of a decade lived" value={`${analysis.totals.decadeFraction} decades`} />
                <ResultRow label="Day of the week born" value={analysis.birthWeekday} />
                <ResultRow label="Sun sign" value={analysis.zodiac} />
              </div>

              {/* Future birthdays table — like the site's "Upcoming Birthdays" list */}
              <div className={card}>
                <SectionTitle>🗓️ Future Birthdays</SectionTitle>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
                  The next {NEXT_BIRTHDAYS_COUNT} birthdays with the exact date, weekday and age you'll turn.
                </p>
                <div className="overflow-hidden rounded-2xl border border-pink-100 dark:border-gray-700">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-pink-50 dark:bg-gray-900/60 text-[10px] uppercase tracking-wider text-pink-500">
                        <th className="px-3 py-2 font-bold">#</th>
                        <th className="px-3 py-2 font-bold">Birthday</th>
                        <th className="px-3 py-2 font-bold">Turning</th>
                        <th className="px-3 py-2 font-bold text-right">In</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.upcoming.map((b, i) => (
                        <tr
                          key={b.dateKey}
                          className={`border-t border-pink-50 dark:border-gray-700 text-xs ${
                            i === 0 ? 'bg-pink-50/60 dark:bg-pink-900/20 font-bold' : 'bg-white dark:bg-gray-800'
                          }`}
                        >
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 text-gray-800 dark:text-gray-100">
                            {b.weekday}, {fmtDate(b.dateKey)}
                          </td>
                          <td className="px-3 py-2 text-gray-800 dark:text-gray-100">{b.ageTurns} yrs</td>
                          <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">
                            {b.daysUntil === 0 ? 'today! 🎉' : `${b.daysUntil} days`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {tab === 'plan' && (
            <>
              <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-3xl p-5 text-white shadow-lg text-center">
                <p className="text-xs opacity-80 uppercase tracking-widest">Party planner</p>
                <p className="text-lg font-extrabold mt-1">Plan the next 3 birthday celebrations 🎂🎈</p>
                <p className="text-[11px] opacity-90 mt-2">
                  Season tips, theme ideas and a prep checklist with lead times for each upcoming birthday.
                </p>
              </div>

              {analysis.partyPlans.map((p) => (
                <div key={p.dateKey} className={card}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-extrabold text-gray-800 dark:text-gray-100">
                        {p.theme.emoji} Turns {p.ageTurns}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {p.weekday}
                        {isWeekend(p.dateKey) ? ' · weekend 🎉 great for classmate invites' : ' · weekday — consider a weekend bash nearby'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-full bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300">
                      in {p.daysUntil} days
                    </span>
                  </div>

                  <div className="mt-3 space-y-2 text-xs text-gray-600 dark:text-gray-300">
                    <p>
                      <span className="font-bold text-gray-800 dark:text-gray-100">📅 Date:</span> {fmtDate(p.dateKey)}
                      {' · '}
                      <span className="font-bold text-gray-800 dark:text-gray-100">School year:</span> {p.schoolYear}
                    </p>
                    <p>
                      <span className="font-bold text-gray-800 dark:text-gray-100">
                        {p.season.emoji} {p.season.label}:
                      </span>{' '}
                      {p.season.note}
                    </p>
                    <p>
                      <span className="font-bold text-gray-800 dark:text-gray-100">🎨 Theme ideas:</span>{' '}
                      {p.theme.themes.join(' · ')}
                    </p>
                    <p>
                      <span className="font-bold text-gray-800 dark:text-gray-100">🍰 Cake:</span> {p.theme.cake}
                    </p>
                  </div>

                  <p className="text-[11px] font-bold uppercase tracking-widest text-pink-400 mt-4 mb-1">
                    ✅ Prep checklist
                  </p>
                  <ul className="space-y-1.5">
                    {p.checklist.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
                        <span
                          className={`shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${LEAD_META[c.lead].cls}`}
                        >
                          {LEAD_META[c.lead].label}
                        </span>
                        <span>{c.task}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        <div className={`${card} text-center`}>
          <p className="text-3xl mb-2">🎉</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter your child's date of birth and tap Calculate to see their exact age today, when the next birthday
            falls (and on which weekday), plus a Party Planner with season tips, theme ideas and prep checklists.
          </p>
        </div>
      )}
        </>
      )}
    </div>
  );
}
