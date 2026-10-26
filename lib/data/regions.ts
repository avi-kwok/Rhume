// Regions and season parameters (DESIGN.md §5). Store counts and child shares are simulated.

import type { Region, RegionId, Season } from "../engine/types";

/** West → east, the order used everywhere (tile map, loops, tie-breaks). */
export const REGION_IDS: readonly RegionId[] = ["BC", "AB", "ON", "QC", "ATL"] as const;

export const BASELINE_UNITS_PER_STORE_PER_DAY = 6;

export const REGIONS: readonly Region[] = [
  { id: "BC", name: "British Columbia", city: "Metro Vancouver", dcName: "Pacific DC", stores: 180, childShare: 0.13, baselineUnitsPerStorePerDay: BASELINE_UNITS_PER_STORE_PER_DAY },
  { id: "AB", name: "Alberta", city: "Edmonton", dcName: "Prairie DC", stores: 150, childShare: 0.13, baselineUnitsPerStorePerDay: BASELINE_UNITS_PER_STORE_PER_DAY },
  { id: "ON", name: "Ontario", city: "Toronto", dcName: "Ontario DC", stores: 560, childShare: 0.39, baselineUnitsPerStorePerDay: BASELINE_UNITS_PER_STORE_PER_DAY },
  { id: "QC", name: "Québec", city: "Montréal", dcName: "Québec DC", stores: 290, childShare: 0.22, baselineUnitsPerStorePerDay: BASELINE_UNITS_PER_STORE_PER_DAY },
  { id: "ATL", name: "Atlantic", city: "Halifax", dcName: "Atlantic DC", stores: 120, childShare: 0.06, baselineUnitsPerStorePerDay: BASELINE_UNITS_PER_STORE_PER_DAY },
];

export const REGION_BY_ID: Readonly<Record<RegionId, Region>> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r]),
) as Record<RegionId, Region>;

export function getRegion(id: RegionId): Region {
  return REGION_BY_ID[id];
}

/** Tile labels. Québec stores trade as Pharmaprix. */
export const REGION_TILE_LABEL: Readonly<Record<RegionId, string>> = {
  BC: "British Columbia",
  AB: "Alberta",
  ON: "Ontario",
  QC: "Québec (Pharmaprix)",
  ATL: "Atlantic",
};

/** Per-region curve parameters for one reconstructed season. */
export interface RegionCurveParams {
  onset: string;          // wastewater crosses 1.5 (baseline 1.0) on this date
  peakOffsetDays: number; // peak = onset + this
  wwPeakMultiple: number; // M
  labPeakPct: number;     // lab true positivity at its peak (%)
  labLagDays: number;     // lab peak lag vs wastewater peak (assumption)
}

export interface SeasonParams {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  sourceNote: string;
  regions: Record<RegionId, RegionCurveParams>;
}

export const RECONSTRUCTED_SOURCE_NOTE =
  "Reconstructed from published onset timing (Statistics Canada, 2023–24). Curve shapes and lab lag are assumptions.";

/** Not given verbatim in DESIGN.md; written in the same style for the P1 scenario. */
export const SYNCHRONIZED_SOURCE_NOTE =
  "Reconstructed scenario: all regions onset within three days of Dec 30, 2024 (synchronized peaks). Curve shapes and lab lag are assumptions.";

export const SEASON_2023_24: SeasonParams = {
  id: "2023-24",
  label: "2023–24",
  startDate: "2023-10-02",
  endDate: "2024-03-31",
  sourceNote: RECONSTRUCTED_SOURCE_NOTE,
  regions: {
    AB: { onset: "2023-11-06", peakOffsetDays: 28, wwPeakMultiple: 9, labPeakPct: 28, labLagDays: 7 },
    ON: { onset: "2023-11-06", peakOffsetDays: 30, wwPeakMultiple: 8, labPeakPct: 26, labLagDays: 7 },
    BC: { onset: "2023-11-27", peakOffsetDays: 28, wwPeakMultiple: 8, labPeakPct: 25, labLagDays: 7 },
    QC: { onset: "2023-11-30", peakOffsetDays: 30, wwPeakMultiple: 7, labPeakPct: 24, labLagDays: 7 },
    ATL: { onset: "2024-01-08", peakOffsetDays: 28, wwPeakMultiple: 8, labPeakPct: 25, labLagDays: 7 },
  },
};

/** 2024–25 synchronized: same generator, onset 2024-12-30 with AB −3, ON 0, BC +1, QC +2, ATL +3 days. */
export const SEASON_2024_25: SeasonParams = {
  id: "2024-25",
  label: "2024–25 (synchronized peaks, reconstructed)",
  startDate: "2024-10-07",
  endDate: "2025-03-31",
  sourceNote: SYNCHRONIZED_SOURCE_NOTE,
  regions: {
    AB: { ...SEASON_2023_24.regions.AB, onset: "2024-12-27" },
    ON: { ...SEASON_2023_24.regions.ON, onset: "2024-12-30" },
    BC: { ...SEASON_2023_24.regions.BC, onset: "2024-12-31" },
    QC: { ...SEASON_2023_24.regions.QC, onset: "2025-01-01" },
    ATL: { ...SEASON_2023_24.regions.ATL, onset: "2025-01-02" },
  },
};

export const SEASON_PARAMS: Readonly<Record<string, SeasonParams>> = {
  [SEASON_2023_24.id]: SEASON_2023_24,
  [SEASON_2024_25.id]: SEASON_2024_25,
};

/**
 * The region's own lab peak (%), used by the demand model (DESIGN.md §7.5 labNorm).
 * Taken from the season parameters, not from the series, so demand on day d never
 * depends on data after d. Falls back to the series maximum for unknown seasons.
 */
export function labPeakPct(season: Season, regionId: RegionId): number {
  const params = SEASON_PARAMS[season.id];
  if (params) return params.regions[regionId].labPeakPct;
  return season.labTrue[regionId].reduce((m, p) => Math.max(m, p.positivity), 0);
}
