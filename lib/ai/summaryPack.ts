// Executive-summary roll-up (DESIGN.md §9.8). The roll-up is typed into a pack with the same
// Field type as evidence packs, so summaries share the placeholder renderer and validator.
// Pure: safe to import from client components (buildRollup) and from the API route (buildSummaryPack).

import type { Config } from "../engine/config";
import { hashFields, type EvidencePack, type Field } from "../engine/evidence";
import type { Proposal } from "../engine/types";
import { REGION_BY_ID, REGION_IDS } from "../data/regions";
import { SUMMARY_PROMPT_VERSION } from "./prompts";
import type { Rollup } from "./schema";

export const SUMMARY_KEYS = [
  "week_of", "open_cards", "regions_acting", "regions_holding", "total_cases",
  "total_cost_cad", "total_ev_cad", "reserve_share_pct", "highest_risk_region",
] as const;

/** Type the roll-up into a pack. proposalId is `summary:<week_of>`; hash covers fields + "summary-v1". */
export function buildSummaryPack(rollup: Rollup): EvidencePack {
  const src = "Engine: this week's open cards, recommended options";
  const fields: Record<(typeof SUMMARY_KEYS)[number], Field> = {
    week_of: { value: rollup.week_of, type: "date", source: "Replay date (week starting Monday)" },
    open_cards: { value: rollup.open_cards, type: "int", source: src },
    regions_acting: { value: rollup.regions_acting, type: "list", source: src },
    regions_holding: { value: rollup.regions_holding, type: "list", source: src },
    total_cases: { value: Math.round(rollup.total_cases), type: "int", source: src },
    total_cost_cad: { value: Math.round(rollup.total_cost_cad), type: "cad", source: "Assumption: cost per case (Settings)" },
    total_ev_cad: { value: Math.round(rollup.total_ev_cad), type: "cad", source: "Engine: expected value from stated assumptions (Settings)" },
    reserve_share_pct: { value: rollup.reserve_share_pct, type: "pct", source: "Assumption: DC reserve share (Settings)" },
    highest_risk_region: { value: rollup.highest_risk_region, type: "text", source: "Engine: open card with the lowest days of cover" },
  };
  return { proposalId: `summary:${rollup.week_of}`, hash: hashFields(fields, SUMMARY_PROMPT_VERSION), fields };
}

/**
 * Build the roll-up from this week's open cards (the proposals shown in the queue).
 * - regions_acting: regions with a card whose recommended option is not "none" (west → east).
 * - regions_holding: every other region.
 * - totals: sums over the recommended options.
 * - highest_risk_region: region of the open card with the lowest cover (store moves first), or "none".
 */
export function buildRollup(openProposals: readonly Proposal[], weekOf: string, cfg: Pick<Config, "dcReserveShare">): Rollup {
  const actingIds = new Set(openProposals.filter((p) => p.recommended !== "none").map((p) => p.regionId));
  let cases = 0;
  let cost = 0;
  let ev = 0;
  for (const p of openProposals) {
    const o = p.options.find((x) => x.id === p.recommended);
    if (!o || p.recommended === "none") continue;
    cases += o.cases;
    cost += o.transferCostCad;
    ev += o.expectedValueCad;
  }
  const ranked = [...openProposals].sort(
    (a, b) => (a.kind === b.kind ? 0 : a.kind === "store_move" ? -1 : 1) || a.coverDays - b.coverDays || a.regionId.localeCompare(b.regionId),
  );
  return {
    week_of: weekOf,
    open_cards: openProposals.length,
    regions_acting: REGION_IDS.filter((id) => actingIds.has(id)).map((id) => REGION_BY_ID[id].name),
    regions_holding: REGION_IDS.filter((id) => !actingIds.has(id)).map((id) => REGION_BY_ID[id].name),
    total_cases: cases,
    total_cost_cad: Math.round(cost),
    total_ev_cad: Math.round(ev),
    reserve_share_pct: Math.round(cfg.dcReserveShare * 1000) / 10,
    highest_risk_region: ranked.length ? REGION_BY_ID[ranked[0].regionId].name : "none",
  };
}
