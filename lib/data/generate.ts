// Reconstructed season generator (DESIGN.md §5). Deterministic: seeded mulberry32.
// The output JSON is committed; the app never generates data at runtime.

import { addDays, daysBetween, eachDay, isMonday, isThursday } from "../engine/dates";
import { DEFAULT_SEED, mulberry32, normalSampler } from "../engine/rng";
import type { RegionId, Season } from "../engine/types";
import { REGION_IDS, SEASON_2023_24, SEASON_2024_25, type RegionCurveParams, type SeasonParams } from "./regions";

/** Wastewater onset threshold on the normalized scale (baseline 1.0). */
export const WW_ONSET_LEVEL = 1.5;
/** Multiplicative wastewater noise: value × exp(N(0, WW_NOISE_SD)). */
export const WW_NOISE_SD = 0.15;
/** Lab true positivity baseline (%). */
export const LAB_BASELINE_PCT = 2;
/** Additive noise on reported lab positivity (percentage points). */
export const LAB_REPORT_NOISE_PP = 0.5;
/** Reported lab positivity floor (%). */
export const LAB_REPORT_FLOOR_PCT = 0.5;
/** Reported value on Monday D = mean true positivity over D−13 … D−7. */
export const LAB_REPORT_WINDOW = { fromDaysBack: 13, toDaysBack: 7 } as const;

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export function peakDate(p: RegionCurveParams): string {
  return addDays(p.onset, p.peakOffsetDays);
}

/**
 * σ such that 1 + (M − 1)·exp(−Δ²/(2σ²)) = 1.5 at the onset, Δ = peak − onset:
 * σ = Δ / sqrt(2·ln(2(M − 1))).
 */
export function solveSigma(p: RegionCurveParams): number {
  const delta = daysBetween(p.onset, peakDate(p));
  const ratio = (p.wwPeakMultiple - 1) / (WW_ONSET_LEVEL - 1);
  return delta / Math.sqrt(2 * Math.log(ratio));
}

function gaussian(t: number, centre: number, sigma: number): number {
  return Math.exp(-((t - centre) ** 2) / (2 * sigma * sigma));
}

/** Noise-free normalized wastewater on a date. */
export function wastewaterCurve(date: string, p: RegionCurveParams): number {
  const t = daysBetween(p.onset, date);
  return 1 + (p.wwPeakMultiple - 1) * gaussian(t, p.peakOffsetDays, solveSigma(p));
}

/** Noise-free true lab positivity (%) on a date: same shape, peak shifted by +lag, baseline 2%. */
export function labTrueCurve(date: string, p: RegionCurveParams): number {
  const t = daysBetween(p.onset, date);
  return LAB_BASELINE_PCT + (p.labPeakPct - LAB_BASELINE_PCT) * gaussian(t, p.peakOffsetDays + p.labLagDays, solveSigma(p));
}

/** Reported value for Monday D before noise: mean true positivity over D−13 … D−7. */
export function labReportedMean(monday: string, p: RegionCurveParams): number {
  let sum = 0;
  let n = 0;
  for (let k = LAB_REPORT_WINDOW.fromDaysBack; k >= LAB_REPORT_WINDOW.toDaysBack; k--) {
    sum += labTrueCurve(addDays(monday, -k), p);
    n++;
  }
  return sum / n;
}

function emptyByRegion<T>(): Record<RegionId, T[]> {
  return Object.fromEntries(REGION_IDS.map((id) => [id, [] as T[]])) as unknown as Record<RegionId, T[]>;
}

/**
 * Generate one reconstructed season. Draw order (fixed, so output is reproducible):
 * for each region west → east, all wastewater readings in date order, then all lab reports in date order.
 */
export function generateSeason(params: SeasonParams, seed: number = DEFAULT_SEED): Season {
  const normal = normalSampler(mulberry32(seed));
  const days = eachDay(params.startDate, params.endDate);

  const wastewater = emptyByRegion<{ date: string; value: number }>();
  const labTrue = emptyByRegion<{ date: string; positivity: number }>();
  const labReported = emptyByRegion<{ date: string; positivity: number }>();

  for (const id of REGION_IDS) {
    const p = params.regions[id];
    for (const date of days) {
      if (isMonday(date) || isThursday(date)) {
        const value = wastewaterCurve(date, p) * Math.exp(normal(0, WW_NOISE_SD));
        wastewater[id].push({ date, value: round3(value) });
      }
    }
    for (const date of days) {
      labTrue[id].push({ date, positivity: round3(labTrueCurve(date, p)) });
    }
    for (const date of days) {
      if (!isMonday(date)) continue;
      const reported = Math.max(LAB_REPORT_FLOOR_PCT, labReportedMean(date, p) + normal(0, LAB_REPORT_NOISE_PP));
      labReported[id].push({ date, positivity: round3(reported) });
    }
  }

  return {
    id: params.id,
    label: params.label,
    mode: "reconstructed",
    sourceNote: params.sourceNote,
    startDate: params.startDate,
    endDate: params.endDate,
    wastewater,
    labTrue,
    labReported,
  };
}

export function generateSeason2023(seed: number = DEFAULT_SEED): Season {
  return generateSeason(SEASON_2023_24, seed);
}

export function generateSeason2024Synchronized(seed: number = DEFAULT_SEED): Season {
  return generateSeason(SEASON_2024_25, seed);
}

/** Stable, diff-friendly JSON: two-space indent, one data point per line, trailing newline. */
export function serializeSeason(season: Season): string {
  const pretty = JSON.stringify(season, null, 2);
  return (
    pretty.replace(/\{\n\s+("date": "[^"]+"),\n\s+("(?:value|positivity)": [^\n]+)\n\s+\}/g, "{ $1, $2 }") + "\n"
  );
}
