import { ActiveRun, DiscState, Discipline } from '../types';
import { iso } from './formatters';

// All disciplines across every edital (time is counted for all of them)
export const allDisciplines = (ds: DiscState): Discipline[] =>
  ds.eds.flatMap((ed) => ed.list || []);

export const todayKey = (): string => iso(new Date());

export const addDaysKey = (key: string, n: number): string => {
  const [y, m, d] = key.split('-').map(Number);
  return iso(new Date(y, m - 1, d + n));
};

// Inclusive list of YYYY-MM-DD keys between two keys
export const dateRange = (fromKey: string, toKey: string): string[] => {
  const out: string[] = [];
  let k = fromKey;
  while (k <= toKey) {
    out.push(k);
    k = addDaysKey(k, 1);
  }
  return out;
};

// Seconds studied per day, including the session that is running right now
export const buildDailyTotals = (
  ds: DiscState,
  activeRun: ActiveRun | null,
  liveSeconds: number
): Record<string, number> => {
  const totals: Record<string, number> = {};
  allDisciplines(ds).forEach((d) => {
    Object.entries(d.log || {}).forEach(([day, s]) => {
      totals[day] = (totals[day] || 0) + (s || 0);
    });
  });
  if (activeRun?.start && activeRun.day) {
    totals[activeRun.day] = (totals[activeRun.day] || 0) + liveSeconds;
  }
  return totals;
};

// Days in a period: a number of days ending today, or 'all' since the first study day
export const periodKeys = (period: number | 'all', totals: Record<string, number>): string[] => {
  const today = todayKey();
  if (period === 'all') {
    const studied = Object.keys(totals)
      .filter((k) => totals[k] > 0)
      .sort();
    return dateRange(studied[0] || today, today);
  }
  return dateRange(addDaysKey(today, -(period - 1)), today);
};

export const sumSeconds = (totals: Record<string, number>, keys: string[]): number =>
  keys.reduce((acc, k) => acc + (totals[k] || 0), 0);

// Current streak (ending today, or yesterday if today has nothing yet) and longest streak
export const streaks = (totals: Record<string, number>): { current: number; longest: number } => {
  const studied = new Set(Object.keys(totals).filter((k) => totals[k] > 0));
  const sorted = [...studied].sort();

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  sorted.forEach((k) => {
    run = prev && addDaysKey(prev, 1) === k ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = k;
  });

  let current = 0;
  let k = todayKey();
  if (!studied.has(k)) k = addDaysKey(k, -1);
  while (studied.has(k)) {
    current++;
    k = addDaysKey(k, -1);
  }

  return { current, longest };
};

// "502h54min", "45min"
export const fmtLong = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${String(m).padStart(2, '0')}min`;
};
