// Real vs reconstructed wastewater, for the /evidence page. Retrospective (evaluation) code: it
// reads the whole season, unlike the decision engine. Both series are put on the same footing:
// averaged into Sunday–Saturday weeks (dated at the week's end, as the real export is), expressed
// as excess over the region's baseline, and scaled to that series' own season peak.

import { REGION_IDS } from "./data/regions";
import { DEFAULT_CONFIG, type Config } from "./engine/config";
import { addDays, dayOfWeek } from "./engine/dates";
import { evaluateWastewater, wastewaterBaseline } from "./engine/signals";
import type { RegionId, Season } from "./engine/types";

type Reading = { date: string; value: number };

/** First-rise rule: 3-week trailing mean of the excess reaches this share of its season maximum. */
export const RISE_SHARE = 0.1;
export const RISE_WINDOW_WEEKS = 3;

export interface WeeklyPoint { date: string; value: number }

/** Average readings into Sunday–Saturday weeks, dated at the Saturday. */
export function weekly(readings: readonly Reading[]): WeeklyPoint[] {
  const byWeek = new Map<string, number[]>();
  for (const r of readings) {
    const end = addDays(r.date, 6 - dayOfWeek(r.date));
    byWeek.set(end, [...(byWeek.get(end) ?? []), r.value]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, vs]) => ({ date, value: vs.reduce((s, v) => s + v, 0) / vs.length }));
}

/** Excess over the baseline (median of the first 4 weeks), scaled so the season peak = 1. */
export function shareOfPeak(points: readonly WeeklyPoint[]): WeeklyPoint[] {
  const first = [...points.slice(0, 4).map((p) => p.value)].sort((a, b) => a - b);
  const base = first.length ? (first[(first.length - 1) >> 1] + first[first.length >> 1]) / 2 : 0;
  const excess = points.map((p) => Math.max(0, p.value - base));
  const peak = Math.max(...excess, 0);
  return points.map((p, i) => ({ date: p.date, value: peak > 0 ? excess[i] / peak : 0 }));
}

/** First week the 3-week trailing mean of the excess reaches RISE_SHARE of its season maximum. */
export function firstSustainedRise(points: readonly WeeklyPoint[]): string | null {
  const means = points.map((_, i) => {
    const w = points.slice(Math.max(0, i - RISE_WINDOW_WEEKS + 1), i + 1);
    return w.reduce((s, p) => s + p.value, 0) / w.length;
  });
  const max = Math.max(...means, 0);
  const i = means.findIndex((m) => max > 0 && m >= RISE_SHARE * max);
  return i < 0 ? null : points[i].date;
}

/** First reading at which the engine's wastewater check (W) passes on the series as published. */
export function firstWPass(readings: readonly Reading[], cfg: Config = DEFAULT_CONFIG): string | null {
  for (let k = 1; k <= readings.length; k++) {
    if (evaluateWastewater(readings.slice(0, k), cfg).passed) return readings[k - 1].date;
  }
  return null;
}

export interface RegionEvidence {
  regionId: RegionId;
  /** Weekly, share of season peak, keyed by week-end date. */
  real: WeeklyPoint[];
  reconstructed: WeeklyPoint[];
  realRows: number;
  realFirstRise: string | null;
  reconstructedFirstRise: string | null;
  /** real − reconstructed, days (positive = the real rise came later). */
  riseGapDays: number | null;
  realFirstW: string | null;
  reconstructedFirstW: string | null;
  /** Real peak multiple of its baseline (median first 4 weeks), for context on the noise floor. */
  realBaseline: number;
}

export function regionEvidence(real: Season, reconstructed: Season, cfg: Config = DEFAULT_CONFIG): RegionEvidence[] {
  return REGION_IDS.map((regionId) => {
    const rw = weekly(real.wastewater[regionId]);
    const cw = weekly(reconstructed.wastewater[regionId]);
    const realFirstRise = firstSustainedRise(shareOfPeak(rw));
    const reconstructedFirstRise = firstSustainedRise(shareOfPeak(cw));
    const gap = realFirstRise && reconstructedFirstRise
      ? Math.round((Date.parse(realFirstRise) - Date.parse(reconstructedFirstRise)) / 86_400_000)
      : null;
    return {
      regionId,
      real: shareOfPeak(rw),
      reconstructed: shareOfPeak(cw),
      realRows: real.wastewater[regionId].length,
      realFirstRise,
      reconstructedFirstRise,
      riseGapDays: gap,
      realFirstW: firstWPass(real.wastewater[regionId], cfg),
      reconstructedFirstW: firstWPass(reconstructed.wastewater[regionId], cfg),
      realBaseline: wastewaterBaseline(real.wastewater[regionId]),
    };
  });
}

export const REAL_SOURCE_PAGE = "https://health-infobase.canada.ca/wastewater/";
export const REAL_SOURCE_FILE = "https://health-infobase.canada.ca/src/data/wastewater/wastewater_aggregate.csv";

/** The download date recorded in a real season's sourceNote ("… downloaded 2026-10-25. …"). */
export function downloadedOn(season: Season): string | null {
  return /downloaded (\d{4}-\d{2}-\d{2})/.exec(season.sourceNote)?.[1] ?? null;
}
