// Evidence pack (DESIGN.md §9.1): every number the AI brief may mention, typed for its formatter,
// with a source. Hash = SHA-256 of a stable JSON of the fields plus the prompt version.
// Runs in the browser and Node (pure-JS SHA-256).

import type { Config } from "./config";
import { weeksBetween } from "./dates";
import { KIND_LABEL } from "./proposals";
import { sha256Hex } from "./sha256";
import { SIGNALS_TOTAL } from "./signals";
import { getStageEngine } from "./stage";
import type { Proposal, RegionState, Season, SignalCheck } from "./types";
import { published } from "./visible";
import { REGION_BY_ID } from "../data/regions";
import { LAB_REPORT_WINDOW } from "../data/generate";

export const PROMPT_VERSION = "brief-v1";

export type FieldType = "int" | "pct" | "cad" | "date" | "days" | "text" | "list" | "bool";
export type Field = { value: number | string | boolean | string[]; type: FieldType; source: string };
export type EvidencePack = { proposalId: string; hash: string; fields: Record<string, Field> };

/** Required keys: the placeholder whitelist. */
export const EVIDENCE_KEYS = [
  "region_name", "city", "dc_name", "source_name", "as_of_date", "stage", "confidence", "signals_agree", "signals_total",
  "wastewater_check", "lab_check", "neighbour_check", "wastewater_change_pct", "wastewater_vs_baseline",
  "lab_positivity_pct", "lab_reporting_lag_days", "upstream_regions", "upstream_peak_weeks_ago", "cover_days",
  "target_cover_days", "move_cases", "move_units", "arrival_date", "lead_days", "option_none_ev", "option_half_cases",
  "option_half_ev", "option_full_cases", "option_full_ev", "recommended_option", "expected_value_cad",
  "transfer_cost_cad", "probability_pct", "approval_reason", "reversible", "change_trigger", "disagreeing_signals",
  "season_caveat", "kind_label",
] as const;
export type EvidenceKey = (typeof EVIDENCE_KEYS)[number];

export const SEASON_CAVEAT =
  "In the 2024–25 season, the five long-running wastewater cities peaked together, so neighbour timing gave little warning.";

/** One-week reporting delay: Monday D publishes the mean over D−13 … D−7. */
export const LAB_REPORTING_LAG_DAYS = LAB_REPORT_WINDOW.toDaysBack;

const r1 = (x: number): number => Math.round(x * 10) / 10;
const cad = (x: number): number => Math.round(x);

/** JSON with object keys sorted at every level, so equal data always hashes equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function hashFields(fields: Record<string, Field>, promptVersion: string = PROMPT_VERSION): string {
  return sha256Hex(stableStringify({ fields, promptVersion }));
}

function checkLabel(check: SignalCheck, city: string): string {
  if (check.id === "wastewater") return `${city} wastewater`;
  if (check.id === "lab") return "reported lab positivity";
  return "neighbour timing";
}

/**
 * Build the evidence pack for a proposal and the region's state on the proposal's date.
 * Only reads data visible on proposal.asOf.
 */
export function buildEvidencePack(proposal: Proposal, state: RegionState, ctx: { season: Season; cfg: Config }): EvidencePack {
  if (state.regionId !== proposal.regionId || state.asOf !== proposal.asOf) {
    throw new Error(`State ${state.regionId}@${state.asOf} does not match proposal ${proposal.id}`);
  }
  const { season, cfg } = ctx;
  const region = REGION_BY_ID[proposal.regionId];
  const asOf = proposal.asOf;
  const byId = (id: SignalCheck["id"]) => state.checks.find((c) => c.id === id)!;
  const W = byId("wastewater");
  const L = byId("lab");
  const N = byId("neighbour");
  const opt = (id: Proposal["recommended"]) => proposal.options.find((o) => o.id === id)!;
  const rec = opt(proposal.recommended);

  const engine = getStageEngine(season, cfg);
  const upstream = engine.upstreamAt(proposal.regionId, asOf);
  const peakWeeksAgo = upstream.map((u) => {
    const readings = published(season.wastewater[u.regionId], asOf, cfg.wwPublicationLagDays);
    const peak = readings.reduce((best, r) => (r.value > best.value ? r : best), readings[0]);
    return weeksBetween(peak.date, asOf);
  });

  const wwSource = `Wastewater, ${region.city}: ${season.sourceNote}`;
  const labSource = "Reported lab positivity: reconstructed; lag is an assumption";
  const stockSource = "Store and DC stock: simulated";
  const evSource = "Engine: expected value from stated assumptions (Settings)";
  const ruleSource = "Engine: stage rules";

  const num = (v: number | string | undefined): number => (typeof v === "number" ? v : NaN);
  const wwChange = num(W.values.wastewater_change_pct);
  const wwVs = num(W.values.wastewater_vs_baseline);
  const labPct = num(L.values.lab_positivity_pct);

  const fields: Record<EvidenceKey, Field> = {
    region_name: { value: region.name, type: "text", source: "Region table (simulated store network)" },
    city: { value: region.city, type: "text", source: "Region table: wastewater site" },
    dc_name: { value: region.dcName, type: "text", source: "Region table (simulated store network)" },
    source_name: { value: proposal.sourceName, type: "text", source: "Engine: proposal source DC" },
    as_of_date: { value: asOf, type: "date", source: "Replay date" },
    stage: { value: state.stage, type: "text", source: ruleSource },
    confidence: { value: state.confidence, type: "text", source: ruleSource },
    signals_agree: { value: state.agreeCount, type: "int", source: ruleSource },
    signals_total: { value: SIGNALS_TOTAL, type: "int", source: ruleSource },
    wastewater_check: { value: W.reason, type: "text", source: wwSource },
    lab_check: { value: L.reason, type: "text", source: labSource },
    neighbour_check: { value: N.reason, type: "text", source: "Engine: neighbour check (other regions' stages)" },
    wastewater_change_pct: Number.isFinite(wwChange)
      ? { value: r1(wwChange), type: "pct", source: wwSource }
      : { value: "n/a", type: "text", source: wwSource },
    wastewater_vs_baseline: Number.isFinite(wwVs)
      ? { value: `${wwVs.toFixed(1)}×`, type: "text", source: wwSource }
      : { value: "n/a", type: "text", source: wwSource },
    lab_positivity_pct: Number.isFinite(labPct)
      ? { value: r1(labPct), type: "pct", source: labSource }
      : { value: "n/a", type: "text", source: labSource },
    lab_reporting_lag_days: { value: LAB_REPORTING_LAG_DAYS, type: "days", source: "Assumption: one-week reporting delay (reconstructed)" },
    upstream_regions: { value: upstream.map((u) => REGION_BY_ID[u.regionId].name), type: "list", source: "Engine: neighbour check" },
    upstream_peak_weeks_ago: peakWeeksAgo.length
      ? { value: Math.min(...peakWeeksAgo), type: "int", source: "Engine: weeks since the most recent upstream wastewater peak" }
      : { value: "n/a", type: "text", source: "Engine: no upstream region peaking" },
    cover_days: { value: r1(proposal.coverDays), type: "days", source: stockSource },
    target_cover_days: { value: proposal.targetCoverDays, type: "days", source: "Assumption: target cover (Settings)" },
    move_cases: { value: rec.cases, type: "int", source: "Engine: recommended option" },
    move_units: { value: rec.units, type: "int", source: "Engine: recommended option" },
    arrival_date: { value: proposal.arrivalDate, type: "date", source: "Engine: replay date + transfer lead time" },
    lead_days: { value: proposal.leadDays, type: "days", source: "Assumption: transfer lead time (Settings)" },
    option_none_ev: { value: cad(opt("none").expectedValueCad), type: "cad", source: evSource },
    option_half_cases: { value: opt("half").cases, type: "int", source: "Engine: half of the full move" },
    option_half_ev: { value: cad(opt("half").expectedValueCad), type: "cad", source: evSource },
    option_full_cases: { value: opt("full").cases, type: "int", source: "Engine: full move to target cover" },
    option_full_ev: { value: cad(opt("full").expectedValueCad), type: "cad", source: evSource },
    recommended_option: { value: proposal.recommended, type: "text", source: "Engine: highest expected value" },
    expected_value_cad: { value: cad(rec.expectedValueCad), type: "cad", source: evSource },
    transfer_cost_cad: { value: cad(rec.transferCostCad), type: "cad", source: "Assumption: cost per case (Settings)" },
    probability_pct: { value: Math.round(proposal.probability * 100), type: "pct", source: "Assumption: surge probability by confidence (Settings)" },
    approval_reason: { value: proposal.approvalReason, type: "text", source: "Engine: governance rules" },
    reversible: { value: proposal.reversible, type: "bool", source: "Engine: governance rules" },
    change_trigger: { value: proposal.changeTrigger, type: "text", source: "Engine: change trigger" },
    disagreeing_signals: {
      value: state.checks.filter((c) => !c.passed).map((c) => checkLabel(c, region.city)),
      type: "list",
      source: "Engine: signal checks",
    },
    season_caveat: { value: SEASON_CAVEAT, type: "text", source: "Team evidence: 2024–25 season timing" },
    kind_label: { value: KIND_LABEL[proposal.kind], type: "text", source: "Engine: card kind" },
  };

  return { proposalId: proposal.id, hash: hashFields(fields), fields };
}

/** Convenience: build the pack using the memoized stage engine for the region state. */
export function evidencePackFor(proposal: Proposal, ctx: { season: Season; cfg: Config }): EvidencePack {
  const state = getStageEngine(ctx.season, ctx.cfg).stateAt(proposal.regionId, proposal.asOf);
  return buildEvidencePack(proposal, state, ctx);
}
