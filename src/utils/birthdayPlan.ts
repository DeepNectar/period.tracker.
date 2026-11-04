// ---------- Child Birthday Party Planning helpers ----------
// Pure date functions used by the Future Birthday Calculator's planning tab.

import { addYearsToKey, diffDaysBetweenKeys, getAgeOnDate, toKey } from './tools';

export type MonthNum = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** School year in India generally runs June – April/May. */
export function getSchoolYear(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return m >= 6 ? `${y}–${y + 1}` : `${y - 1}–${y}`;
}

export interface SeasonInfo {
  label: string;
  emoji: string;
  note: string;
}

/** Broad Indian seasonal classification for party-planning advice. */
export function getIndianSeason(month: MonthNum): SeasonInfo {
  switch (month) {
    case 3:
    case 4:
    case 5:
      return {
        label: 'Summer',
        emoji: '☀️',
        note: 'Hot afternoons — prefer an evening party, pool party or AC indoor venue with cool treats.',
      };
    case 6:
    case 7:
    case 8:
    case 9:
      return {
        label: 'Monsoon',
        emoji: '🌧️',
        note: 'Rain likely — plan an indoor venue and keep outdoor games as a backup only.',
      };
    case 10:
    case 11:
      return {
        label: 'Pleasant / Post-monsoon',
        emoji: '🍂',
        note: 'The best window! Comfortable weather for outdoor parties, parks and garden setups.',
      };
    default:
      return {
        label: 'Winter',
        emoji: '❄️',
        note: 'Cool and cosy — great for all-day parties; North India can be cold, plan warm snacks & indoor backup.',
      };
  }
}

export type PrepLead = 'now' | 'this-week' | 'advance';

export interface PrepTask {
  task: string;
  lead: PrepLead;
}

interface ThemeDef {
  name: string;
  emoji: string;
  themes: string[];
  cake: string;
  extras?: string;
}

const THEMES: Record<string, ThemeDef> = {
  baby: {
    name: 'Baby milestone (under 1)',
    emoji: '🍼',
    themes: ['First-birthday jungle safari', 'Pastel teddy bear', 'One-tu-forever balloon arch'],
    cake: 'Smash-the-cake session — soft vanilla, no nuts',
    extras: 'Handprint/footprint keepsake corner for guests',
  },
  toddler: {
    name: 'Toddler (1–3)',
    emoji: '🧸',
    themes: ['Peppa Pig / Bluey', 'Vehicles & diggers', 'Animal friends'],
    cake: 'Character-themed fondant cake, candles count = age',
    extras: 'Soft-play area; keep the party under 90 minutes',
  },
  kid: {
    name: 'Kid (4–9)',
    emoji: '🎨',
    themes: ['Superhero squad', 'Unicorn / princess', 'Dinosaur adventure', 'Football/cricket theme'],
    cake: 'Two-tier favourite-flavour cake with topper',
    extras: 'Games hour: musical chairs, treasure hunt, face painting',
  },
  tween: {
    name: 'Tween (10–12)',
    emoji: '🎮',
    themes: ['Gaming / Minecraft', 'Movie night & popcorn bar', 'Talent show', 'Sports tournament'],
    cake: 'Bigger sheet cake + dessert table',
    extras: 'Let the child co-plan the guest list & playlist',
  },
  teen: {
    name: 'Teen (13+)',
    emoji: '✨',
    themes: ['Neon glow / black-and-gold', 'Masquerade', 'Beach / pool party', 'Boho garden setup'],
    cake: 'Elegant drip cake or cupcake tower',
    extras: 'Photo booth with props; confirm parental permissions & timings early',
  },
};

export function getThemeForAge(age: number): ThemeDef {
  if (age < 1) return THEMES.baby;
  if (age <= 3) return THEMES.toddler;
  if (age <= 9) return THEMES.kid;
  if (age <= 12) return THEMES.tween;
  return THEMES.teen;
}

/** Build an age-appropriate party checklist with lead-time tags. */
export function buildPrepChecklist(ageTurns: number, daysUntil: number): PrepTask[] {
  const t = getThemeForAge(ageTurns);
  const tasks: PrepTask[] = [
    { task: `Pick a theme together — e.g. ${t.themes.slice(0, 2).join(' or ')}`, lead: 'advance' },
    { task: 'Finalise guest list (classmates + family) and send invites', lead: 'advance' },
    { task: 'Book venue / decorate home slot', lead: 'advance' },
    { task: `Order the cake: ${t.cake}`, lead: 'this-week' },
    { task: 'Plan menu, party favours & return gifts', lead: 'this-week' },
    ...(t.extras ? [{ task: t.extras, lead: 'this-week' as PrepLead }] : []),
    { task: 'Confirm music/playlist & games schedule', lead: 'now' },
    { task: 'Charge camera/phone, arrange a helper for photos', lead: 'now' },
  ];
  // If the day is very close, surface the immediate items first.
  if (daysUntil <= 7) {
    return [...tasks.filter((x) => x.lead === 'now'), ...tasks.filter((x) => x.lead !== 'now')];
  }
  return tasks;
}

export interface PartyPlan {
  dateKey: string; // suggested celebration date (the birthday itself)
  weekday: string;
  ageTurns: number;
  season: SeasonInfo;
  schoolYear: string;
  theme: ThemeDef;
  checklist: PrepTask[];
  daysUntil: number;
}

/**
 * Suggest which upcoming birthdays to plan for. Returns the next `count`
 * birthday dates with season/theme/checklist planning info.
 */
export function buildPartyPlans(birthKey: string, today: Date, count = 3): PartyPlan[] {
  const todayKey = toKey(today);
  const currentAge = getAgeOnDate(birthKey, today).years;
  const plans: PartyPlan[] = [];
  let n = currentAge + 1;
  while (plans.length < count && n <= currentAge + 20) {
    const dateKey = addYearsToKey(birthKey, n);
    const daysUntil = diffDaysBetweenKeys(todayKey, dateKey);
    if (daysUntil >= 0) {
      const d = new Date(dateKey + 'T00:00:00');
      const month = (d.getMonth() + 1) as MonthNum;
      plans.push({
        dateKey,
        weekday: d.toLocaleDateString('en-IN', { weekday: 'long' }),
        ageTurns: n,
        season: getIndianSeason(month),
        schoolYear: getSchoolYear(d),
        theme: getThemeForAge(n),
        checklist: buildPrepChecklist(n, daysUntil),
        daysUntil,
      });
    }
    n += 1;
  }
  return plans;
}

/** True if the birthday falls on a weekend (easier for classmate parties). */
export function isWeekend(dateKey: string): boolean {
  const day = new Date(dateKey + 'T00:00:00').getDay();
  return day === 0 || day === 6;
}
