// Pure chart-data builders. The workspace builders take asOf and pass every series through
// visible(), so no chart can draw a point dated after the replay date (PRD §11). The scoreboard
// builder is an outcome view and covers the whole season.

import { REGION_IDS } from "./data/regions";
import { mondayOnOrBefore, parseISO } from "./engine/dates";
import type { RegionId, Season, SimResult } from "./engine/types";
import { visible } from "./engine/visible";

export interface ChartPoint {
  date: string;
  /** Epoch ms (UTC midnight), for a numeric time axis. */
  t: number;
  value: number;
}

export const toT = (iso: string): number => parseISO(iso).getTime();

/** Fixed x-axis domain: the whole season, so the chart never rescales as the replay advances. */
export function seasonDomain(season: Season): [number, number] {
  return [toT(season.startDate), toT(season.endDate)];
}

/** Wastewater sparkline (normalized, × baseline): visible readings only. */
export function sparklineSeries(season: Season, regionId: RegionId, asOf: string): ChartPoint[] {
  return visible(season.wastewater[regionId], asOf).map((p) => ({ date: p.date, t: toT(p.date), value: p.value }));
}

export interface DetailSeries {
  /** Wastewater, × baseline. */
  wastewater: ChartPoint[];
  /** Reported lab positivity, %. */
  lab: ChartPoint[];
  /** Store stock cover, days (interactive Rhume simulation). */
  cover: ChartPoint[];
  domain: [number, number];
  today: number;
}

/** Region detail chart: three series up to asOf, a fixed season domain and the "today" line. */
export function detailSeries(season: Season, rh: SimResult, regionId: RegionId, asOf: string): DetailSeries {
  return {
    wastewater: sparklineSeries(season, regionId, asOf),
    lab: visible(season.labReported[regionId], asOf).map((p) => ({ date: p.date, t: toT(p.date), value: p.positivity })),
    cover: visible(rh.days[regionId], asOf).map((d) => ({ date: d.date, t: toT(d.date), value: d.coverDays })),
    domain: seasonDomain(season),
    today: toT(asOf),
  };
}

/** A y-axis upper bound from visible data only (never from the future peak), with a floor. */
export function niceMax(points: readonly ChartPoint[], floor: number): number {
  const max = points.reduce((m, p) => Math.max(m, p.value), floor);
  const step = max <= 5 ? 1 : max <= 20 ? 5 : max <= 50 ? 10 : 25;
  return Math.ceil(max / step) * step;
}

export interface WeeklyFlowRow {
  week: string;
  t: number;
  /** True demand, units. */
  demand: number;
  /** Units arriving at stores under status quo. */
  statusQuo: number;
  /** Units arriving at stores under Rhume. */
  rhume: number;
}

/** Scoreboard small multiple: weekly demand vs stock arriving at stores, both policies (whole season). */
export function weeklyFlows(sq: SimResult, rh: SimResult, regionId: RegionId): WeeklyFlowRow[] {
  const rows = new Map<string, WeeklyFlowRow>();
  const sqDays = sq.days[regionId];
  const rhDays = rh.days[regionId];
  for (let i = 0; i < sqDays.length; i++) {
    const d = sqDays[i];
    const week = mondayOnOrBefore(d.date);
    let row = rows.get(week);
    if (!row) {
      row = { week, t: toT(week), demand: 0, statusQuo: 0, rhume: 0 };
      rows.set(week, row);
    }
    row.demand += d.demand;
    row.statusQuo += d.arrivedUnits;
    row.rhume += rhDays[i]?.arrivedUnits ?? 0;
  }
  return [...rows.values()];
}

export function allWeeklyFlows(sq: SimResult, rh: SimResult): Record<RegionId, WeeklyFlowRow[]> {
  const out = {} as Record<RegionId, WeeklyFlowRow[]>;
  for (const id of REGION_IDS) out[id] = weeklyFlows(sq, rh, id);
  return out;
}

/** First-of-month ticks inside the season (fixed, so axes never shift while scrubbing). */
export function monthTicks(season: Season): number[] {
  const [t0, t1] = seasonDomain(season);
  const out: number[] = [];
  const d = new Date(t0);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  for (;;) {
    const t = Date.UTC(y, m, 1);
    if (t > t1) break;
    if (t >= t0) out.push(t);
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function monthLabel(t: number): string {
  return MONTHS[new Date(t).getUTCMonth()];
}

export function isoOf(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}
