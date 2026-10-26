// Signal checks (DESIGN.md §7.1), for region r as of date d. Pure; reads only visible data.

import type { Config } from "./config";
import type { RegionId, Season, SignalCheck } from "./types";
import { published, visible } from "./visible";
import { REGION_BY_ID } from "../data/regions";

export { visible } from "./visible";

export const BASELINE_READINGS = 8;
export const SIGNALS_TOTAL = 3;

type Reading = { date: string; value: number };
type LabPoint = { date: string; positivity: number };

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n: number): string => WORDS[n] ?? String(n);
const r1 = (x: number): number => Math.round(x * 10) / 10;
const fmt1 = (x: number): string => r1(x).toFixed(1);

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median of the first 8 readings of the season (or of all visible readings if fewer). */
export function wastewaterBaseline(readings: readonly Reading[]): number {
  if (readings.length === 0) return NaN;
  return median(readings.slice(0, BASELINE_READINGS).map((r) => r.value));
}

export interface WastewaterEval {
  passed: boolean;
  latest: number | null;
  previous: number | null;
  baseline: number;
  vsBaseline: number | null;   // latest / baseline
  changePct: number | null;    // (latest / previous − 1) × 100
  consecutiveRises: number;    // how many of the trailing readings each rose over the previous one
}

/** W on an already-visible readings array. */
export function evaluateWastewater(readings: readonly Reading[], cfg: Config): WastewaterEval {
  const n = readings.length;
  const baseline = wastewaterBaseline(readings);
  const latest = n > 0 ? readings[n - 1].value : null;
  const previous = n > 1 ? readings[n - 2].value : null;
  let consecutiveRises = 0;
  for (let i = n - 1; i > 0 && readings[i].value > readings[i - 1].value; i--) consecutiveRises++;
  const vsBaseline = latest !== null && baseline > 0 ? latest / baseline : null;
  const changePct = latest !== null && previous !== null && previous > 0 ? (latest / previous - 1) * 100 : null;
  const passed =
    vsBaseline !== null && vsBaseline >= cfg.wwRiseMultiple && consecutiveRises >= cfg.wwConsecutive;
  return { passed, latest, previous, baseline, vsBaseline, changePct, consecutiveRises };
}

/** Has W passed at any reading so far this season (evaluated on each visible prefix)? */
export function wastewaterEverPassed(readings: readonly Reading[], cfg: Config): boolean {
  for (let k = 1; k <= readings.length; k++) {
    if (evaluateWastewater(readings.slice(0, k), cfg).passed) return true;
  }
  return false;
}

export function wastewaterCheck(season: Season, cfg: Config, regionId: RegionId, asOf: string): SignalCheck {
  const readings = published(season.wastewater[regionId], asOf, cfg.wwPublicationLagDays);
  const w = evaluateWastewater(readings, cfg);
  const city = REGION_BY_ID[regionId].city;
  const values: Record<string, number | string> = {};
  if (w.changePct !== null) values.wastewater_change_pct = r1(w.changePct);
  if (w.vsBaseline !== null) values.wastewater_vs_baseline = Math.round(w.vsBaseline * 100) / 100;
  if (w.latest !== null) {
    values.latest = w.latest;
    values.latest_date = readings[readings.length - 1].date;
    values.baseline = Math.round(w.baseline * 1000) / 1000;
  }
  values.consecutive_rises = w.consecutiveRises;

  let reason: string;
  const need = cfg.wwConsecutive;
  if (w.latest === null || readings.length < need + 1) {
    reason = `Not enough ${city} wastewater readings yet`;
  } else if (w.passed) {
    reason = `Wastewater up ${word(need)} readings in a row, ${fmt1(w.vsBaseline!)}× baseline`;
  } else if ((w.vsBaseline ?? 0) < cfg.wwRiseMultiple) {
    reason = `Wastewater ${fmt1(w.vsBaseline!)}× baseline, below the ${fmt1(cfg.wwRiseMultiple)}× rise line`;
  } else {
    reason = `Wastewater ${fmt1(w.vsBaseline!)}× baseline, but not up ${word(need)} readings in a row`;
  }
  return { id: "wastewater", passed: w.passed, reason, values };
}

export interface LabEval { passed: boolean; latest: LabPoint | null; previous: LabPoint | null }

export function evaluateLab(reported: readonly LabPoint[], cfg: Config): LabEval {
  const n = reported.length;
  const latest = n > 0 ? reported[n - 1] : null;
  const previous = n > 1 ? reported[n - 2] : null;
  const passed = latest !== null && previous !== null && latest.positivity >= cfg.labOnsetPct && latest.positivity > previous.positivity;
  return { passed, latest, previous };
}

export function labCheck(season: Season, cfg: Config, regionId: RegionId, asOf: string): SignalCheck {
  const reported = visible(season.labReported[regionId], asOf);
  const l = evaluateLab(reported, cfg);
  const values: Record<string, number | string> = {};
  const onset = `${cfg.labOnsetPct}%`;
  let reason: string;
  if (!l.latest) {
    reason = "No lab report published yet";
  } else {
    values.lab_positivity_pct = r1(l.latest.positivity);
    values.report_date = l.latest.date;
    if (l.previous) values.previous_pct = r1(l.previous.positivity);
    const now = `${fmt1(l.latest.positivity)}%`;
    if (l.latest.positivity < cfg.labOnsetPct) reason = `Lab positivity ${now}, below the ${onset} onset line`;
    else if (!l.previous) reason = `Lab positivity ${now}, above the ${onset} onset line, no earlier week to compare`;
    else if (l.passed) reason = `Lab positivity ${now}, above the ${onset} onset line and up from ${fmt1(l.previous.positivity)}% last week`;
    else reason = `Lab positivity ${now}, above the ${onset} onset line but not up from ${fmt1(l.previous.positivity)}% last week`;
  }
  return { id: "lab", passed: l.passed, reason, values };
}

/** Upstream region: another region whose stage was peaking within the neighbour window. */
export interface UpstreamRegion { regionId: RegionId; lastPeakingDate: string }

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** N: passes if any other region has been peaking at any point in the last neighbourWindowDays. */
export function neighbourCheck(upstream: readonly UpstreamRegion[], cfg: Config): SignalCheck {
  const passed = upstream.length > 0;
  const names = upstream.map((u) => REGION_BY_ID[u.regionId].name);
  const reason = passed
    ? `${joinNames(names)} ${upstream.length > 1 ? "have" : "has"} been peaking within the last ${cfg.neighbourWindowDays} days`
    : `No other region has been peaking in the last ${cfg.neighbourWindowDays} days`;
  return {
    id: "neighbour",
    passed,
    reason,
    values: { upstream_regions: upstream.map((u) => u.regionId).join(","), upstream_count: upstream.length },
  };
}
