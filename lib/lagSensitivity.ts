// Wastewater publication-lag sensitivity. The Ottawa lead is measured by sample date, but public
// dashboards publish days later. For each lag, re-run the engine and both simulations with
// default assumptions and report what warning and benefit remain. Used by
// scripts/lag-sensitivity.ts and the /evidence page.

import { loadSeason, type SeasonId } from "./data/loadSeason";
import { REGION_IDS } from "./data/regions";
import { DEFAULT_CONFIG, type Config } from "./engine/config";
import { compareOutcomes, leadTable } from "./engine/outcomes";
import { simulate } from "./engine/simulate";
import type { RegionId } from "./engine/types";

export const LAG_DAYS = [0, 3, 5, 7] as const;
export const LAG_SEASONS: readonly SeasonId[] = ["2023-24", "2024-25"];

/** The demo's headline card: Atlantic's first store move in the default 2023–24 replay. */
export const DEMO_CARD_ID = "2024-01-08:ATL:store_move";

export interface LagCard { id: string; asOf: string; cases: number; evCad: number }

export interface LagRow {
  seasonId: SeasonId;
  seasonLabel: string;
  lagDays: number;
  /** Atlantic lead over lab onset (days, positive = Rhume first), from first watch and first rising. */
  atlLeadWatch: number | null;
  atlLeadRising: number | null;
  /** Lead from the earlier flag, every region. */
  leads: Record<RegionId, number | null>;
  stockoutStatusQuo: number;
  stockoutRhume: number;
  netBenefitCad: number;
  cards: number;
  /** 2023–24: the Jan 8 Atlantic card if it still appears. */
  demoCard: LagCard | null;
  /** First Atlantic store-move card (any date). */
  firstAtlStoreMove: LagCard | null;
}

function cardOf(p: { id: string; asOf: string; recommended: string; options: { id: string; cases: number; expectedValueCad: number }[] } | undefined): LagCard | null {
  if (!p) return null;
  const rec = p.options.find((o) => o.id === p.recommended)!;
  return { id: p.id, asOf: p.asOf, cases: rec.cases, evCad: rec.expectedValueCad };
}

export function lagRow(seasonId: SeasonId, lagDays: number, base: Config = DEFAULT_CONFIG): LagRow {
  const season = loadSeason(seasonId);
  const cfg: Config = { ...base, wwPublicationLagDays: lagDays };
  const lead = leadTable(season, cfg);
  const atl = lead.find((r) => r.regionId === "ATL")!;
  const sq = simulate(season, cfg, "status_quo", "auto");
  const rh = simulate(season, cfg, "rhume", "auto");
  const cmp = compareOutcomes(sq, rh, cfg);
  return {
    seasonId,
    seasonLabel: season.label,
    lagDays,
    atlLeadWatch: atl.leadDaysWatch,
    atlLeadRising: atl.leadDaysRising,
    leads: Object.fromEntries(REGION_IDS.map((id) => [id, lead.find((r) => r.regionId === id)!.leadDays])) as Record<RegionId, number | null>,
    stockoutStatusQuo: cmp.statusQuo.stockoutRegionDays,
    stockoutRhume: cmp.rhume.stockoutRegionDays,
    netBenefitCad: cmp.netBenefitCad,
    cards: rh.proposals.length,
    demoCard: cardOf(rh.proposals.find((p) => p.id === DEMO_CARD_ID)),
    firstAtlStoreMove: cardOf(rh.proposals.find((p) => p.regionId === "ATL" && p.kind === "store_move")),
  };
}

export function lagSensitivity(base: Config = DEFAULT_CONFIG): LagRow[] {
  return LAG_SEASONS.flatMap((s) => LAG_DAYS.map((lag) => lagRow(s, lag, base)));
}
