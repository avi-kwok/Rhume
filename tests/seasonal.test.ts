import { describe, expect, it } from "vitest";
import { loadSeason } from "../lib/data/loadSeason";
import { REGION_BY_ID, REGION_IDS } from "../lib/data/regions";
import { DEFAULT_CONFIG } from "../lib/engine/config";
import { addDays } from "../lib/engine/dates";
import { compareOutcomes } from "../lib/engine/outcomes";
import { nationalSeasonalIndex, seasonalProfileFor } from "../lib/engine/seasonal";
import { simulate, simulateDetailed, simulateSeasonal } from "../lib/engine/simulate";
import type { Season } from "../lib/engine/types";

const cfg = DEFAULT_CONFIG;
const SEASONS = ["2023-24", "2024-25"] as const;

function expectConserved(ledger: ReturnType<typeof simulateDetailed>["ledger"]) {
  const lhs = ledger.initialUnits + ledger.suppliedUnits;
  const rhs = ledger.salesUnits + ledger.finalUnits;
  expect(Math.abs(lhs - rhs)).toBeLessThan(1e-6 * lhs);
}

describe("seasonal pre-build policies", () => {
  it("conserve stock: supplied + initial = sales + final on-hand (both seasons, capped and uncapped)", () => {
    for (const id of SEASONS) {
      for (const supplyCapped of [false, true]) {
        const c = { ...cfg, supplyCapped };
        expectConserved(simulateDetailed(loadSeason(id), c, "seasonal", "auto").ledger);
        expectConserved(simulateDetailed(loadSeason(id), c, "seasonal_rhume", "auto").ledger);
      }
    }
  });

  it("seasonal + Rhume has no more stockout region-days than seasonal on the default season", () => {
    const { seasonal, seasonalRhume } = simulateSeasonal(loadSeason("2023-24"), cfg);
    const cmp = compareOutcomes(seasonal, seasonalRhume, cfg);
    expect(cmp.rhume.stockoutRegionDays).toBeLessThanOrEqual(cmp.statusQuo.stockoutRegionDays);
  });

  it("only seasonal + Rhume produces proposals", () => {
    const { seasonal, seasonalRhume } = simulateSeasonal(loadSeason("2023-24"), cfg);
    expect(seasonal.proposals).toHaveLength(0);
    expect(seasonal.transferCostCad).toBe(0);
    expect(seasonalRhume.proposals.length).toBeGreaterThan(0);
  });

  it("plans each season with the other season's national shape, never the current season's", () => {
    expect(seasonalProfileFor(loadSeason("2023-24"), cfg).referenceSeasonId).toBe("2024-25");
    expect(seasonalProfileFor(loadSeason("2024-25"), cfg).referenceSeasonId).toBe("2023-24");

    // Wiping the current season's signals leaves the profile (and so the seasonal orders' forecast) unchanged.
    const season = loadSeason("2023-24");
    const flat = Object.fromEntries(REGION_IDS.map((id) => [id, season.labTrue[id].map((p) => ({ ...p, positivity: 0 }))]));
    const blind: Season = { ...season, labTrue: flat as Season["labTrue"] };
    expect(seasonalProfileFor(blind, cfg).index).toEqual(seasonalProfileFor(season, cfg).index);
  });

  it("the national index equals the reference season's simulated national demand over national baseline", () => {
    const reference = loadSeason("2024-25");
    const index = nationalSeasonalIndex(reference, cfg);
    const sim = simulate(reference, cfg, "status_quo", "auto"); // demand does not depend on the policy
    const base = REGION_IDS.reduce((s, id) => s + REGION_BY_ID[id].stores * REGION_BY_ID[id].baselineUnitsPerStorePerDay, 0);
    index.forEach((x, k) => {
      const from = addDays(reference.startDate, 7 * k);
      const to = addDays(from, 6);
      let demand = 0;
      for (const id of REGION_IDS) for (const d of sim.days[id]) if (d.date >= from && d.date <= to) demand += d.demand;
      expect(x).toBeCloseTo(demand / (7 * base), 9);
    });
    expect(Math.max(...index)).toBeGreaterThan(1.5); // the reference season has a real flu wave
  });

  it("gives identical output when re-run with the same inputs", () => {
    const season = loadSeason("2023-24");
    for (const policy of ["seasonal", "seasonal_rhume"] as const) {
      expect(JSON.stringify(simulate(season, cfg, policy, "auto"))).toBe(JSON.stringify(simulate(season, { ...cfg }, policy, "auto")));
    }
  });
});
