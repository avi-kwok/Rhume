// Stage and confidence (DESIGN.md §7.2), plus a memoized per-date stage engine for the
// neighbour check (§7.1). Pure: depends only on (season, cfg, asOf) and visible data.

import type { Config } from "./config";
import { addDays, eachDay } from "./dates";
import { labCheck, neighbourCheck, wastewaterCheck, wastewaterEverPassed, type UpstreamRegion } from "./signals";
import type { Confidence, RegionId, RegionState, Season, SignalCheck, Stage } from "./types";
import { published } from "./visible";
import { REGION_IDS } from "../data/regions";

type Reading = { date: string; value: number };

export const PEAK_NEAR_MAX_SHARE = 0.9;   // latest ≥ 0.9 × rolling max
export const PEAK_FLAT_CHANGE = 0.1;      // last change within ±10%
export const FALLING_SHARE = 0.8;         // latest < 0.8 × rolling max

function rollingMax(readings: readonly Reading[]): number {
  return readings.reduce((m, r) => Math.max(m, r.value), -Infinity);
}

/**
 * Peaking: the season has had W pass for this region, latest ≥ 0.9 × rolling max of visible
 * readings, and the last reading's change is between −10% and +10%.
 * Depends only on wastewater, so it can be evaluated for any region without recursion.
 */
export function isPeakingReadings(readings: readonly Reading[], cfg: Config): boolean {
  const n = readings.length;
  if (n < 2) return false;
  const latest = readings[n - 1].value;
  const previous = readings[n - 2].value;
  if (!(previous > 0)) return false;
  const change = latest / previous - 1;
  if (change < -PEAK_FLAT_CHANGE || change > PEAK_FLAT_CHANGE) return false;
  if (latest < PEAK_NEAR_MAX_SHARE * rollingMax(readings)) return false;
  return wastewaterEverPassed(readings, cfg);
}

/**
 * Falling: a rolling max has been reached earlier and latest < 0.8 × rolling max.
 * "Reached earlier" is read as: the surge has started this season (W has passed) and the max
 * is at an earlier reading. Without the W gate, pre-onset baseline noise (σ = 0.15) would
 * routinely read as "falling".
 */
export function isFallingReadings(readings: readonly Reading[], cfg: Config): boolean {
  const n = readings.length;
  if (n < 2) return false;
  const max = rollingMax(readings.slice(0, n - 1));
  if (!(readings[n - 1].value < FALLING_SHARE * max)) return false;
  return wastewaterEverPassed(readings, cfg);
}

export interface StageInputs { peaking: boolean; falling: boolean; w: boolean; l: boolean; n: boolean }

/** Order of evaluation: peaking → falling → rising (≥ 2 of W, L, N) → watch (exactly 1 of W, N) → quiet. */
export function classifyStage({ peaking, falling, w, l, n }: StageInputs): Stage {
  if (peaking) return "peaking";
  if (falling) return "falling";
  if (Number(w) + Number(l) + Number(n) >= 2) return "rising";
  if (Number(w) + Number(n) === 1) return "watch";
  return "quiet";
}

/** Rising 3/3 = high, rising 2/3 = medium, watch = low. Other stages use the same agree-count rule. */
export function confidenceFor(stage: Stage, agreeCount: number): Confidence {
  if (stage === "watch" || stage === "quiet") return "low";
  if (agreeCount >= 3) return "high";
  if (agreeCount === 2) return "medium";
  return "low";
}

/**
 * Compute one region's state as of asOf. `upstream` lists the other regions that were
 * peaking within the neighbour window (from the stage engine).
 */
export function computeRegionState(
  season: Season, cfg: Config, regionId: RegionId, asOf: string, upstream: readonly UpstreamRegion[],
): RegionState {
  const readings = published(season.wastewater[regionId], asOf, cfg.wwPublicationLagDays);
  const W = wastewaterCheck(season, cfg, regionId, asOf);
  const L = labCheck(season, cfg, regionId, asOf);
  const N = neighbourCheck(upstream, cfg);
  const checks: SignalCheck[] = [W, L, N];
  const agreeCount = checks.filter((c) => c.passed).length;
  const stage = classifyStage({
    peaking: isPeakingReadings(readings, cfg),
    falling: isFallingReadings(readings, cfg),
    w: W.passed,
    l: L.passed,
    n: N.passed,
  });
  return { regionId, asOf, stage, confidence: confidenceFor(stage, agreeCount), checks, agreeCount };
}

// ---------------------------------------------------------------------------
// Stage engine: stages for all regions, memoized per date.

export interface StageEngine {
  readonly season: Season;
  readonly cfg: Config;
  /** All five regions as of a date. */
  statesAt(asOf: string): Record<RegionId, RegionState>;
  stateAt(regionId: RegionId, asOf: string): RegionState;
  /** Was this region's stage "peaking" on this date? */
  wasPeaking(regionId: RegionId, date: string): boolean;
  /** Other regions peaking at any point in [asOf − neighbourWindowDays, asOf]. */
  upstreamAt(regionId: RegionId, asOf: string): UpstreamRegion[];
}

export function createStageEngine(season: Season, cfg: Config): StageEngine {
  const peakingMemo = new Map<string, Record<RegionId, boolean>>();
  const stateMemo = new Map<string, Record<RegionId, RegionState>>();

  // Stage = peaking exactly when the peaking condition holds (it is evaluated first), and that
  // condition reads only the region's own visible wastewater. So the neighbour check needs no
  // recursion: it reads memoized per-date peaking flags for dates <= asOf.
  function peakingFlags(date: string): Record<RegionId, boolean> {
    let flags = peakingMemo.get(date);
    if (!flags) {
      flags = {} as Record<RegionId, boolean>;
      for (const id of REGION_IDS) flags[id] = isPeakingReadings(published(season.wastewater[id], date, cfg.wwPublicationLagDays), cfg);
      peakingMemo.set(date, flags);
    }
    return flags;
  }

  function upstreamAt(regionId: RegionId, asOf: string): UpstreamRegion[] {
    const from = addDays(asOf, -cfg.neighbourWindowDays);
    const start = from > season.startDate ? from : season.startDate;
    if (asOf < start) return [];
    const dates = eachDay(start, asOf);
    const out: UpstreamRegion[] = [];
    for (const other of REGION_IDS) {
      if (other === regionId) continue;
      for (let i = dates.length - 1; i >= 0; i--) {
        if (peakingFlags(dates[i])[other]) {
          out.push({ regionId: other, lastPeakingDate: dates[i] });
          break;
        }
      }
    }
    return out;
  }

  function statesAt(asOf: string): Record<RegionId, RegionState> {
    let states = stateMemo.get(asOf);
    if (!states) {
      states = {} as Record<RegionId, RegionState>;
      for (const id of REGION_IDS) states[id] = computeRegionState(season, cfg, id, asOf, upstreamAt(id, asOf));
      stateMemo.set(asOf, states);
    }
    return states;
  }

  return {
    season,
    cfg,
    statesAt,
    stateAt: (regionId, asOf) => statesAt(asOf)[regionId],
    wasPeaking: (regionId, date) => peakingFlags(date)[regionId],
    upstreamAt,
  };
}

const engineCache = new WeakMap<Season, WeakMap<Config, StageEngine>>();

/** Memoized engine per (season, cfg) object identity. Treat both as immutable. */
export function getStageEngine(season: Season, cfg: Config): StageEngine {
  let byCfg = engineCache.get(season);
  if (!byCfg) {
    byCfg = new WeakMap();
    engineCache.set(season, byCfg);
  }
  let engine = byCfg.get(cfg);
  if (!engine) {
    engine = createStageEngine(season, cfg);
    byCfg.set(cfg, engine);
  }
  return engine;
}

/** Convenience: all regions' states as of a date. */
export function computeStates(season: Season, cfg: Config, asOf: string): Record<RegionId, RegionState> {
  return getStageEngine(season, cfg).statesAt(asOf);
}

/** Stage history on given dates (e.g. Mondays) for one region. */
export function stageHistory(season: Season, cfg: Config, regionId: RegionId, dates: readonly string[]): { date: string; stage: Stage }[] {
  const engine = getStageEngine(season, cfg);
  return dates.map((date) => ({ date, stage: engine.stateAt(regionId, date).stage }));
}
