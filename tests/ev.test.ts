import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../lib/engine/config";
import { buildOptions, evBreakdown, expectedValue, recommendOption, type EvInput } from "../lib/engine/ev";

const cfg = DEFAULT_CONFIG;
const base: Omit<EvInput, "units"> = {
  projectedDailyDemand: 1440, // ATL rising: 120 stores × 6 × 2.0
  currentCoverUnits: 7 * 1440,
  leadDays: 2,
  probability: 0.65,
  sourceKind: "own_dc",
};

describe("ev", () => {
  it("EV of none is 0", () => {
    expect(expectedValue({ ...base, units: 0 }, cfg)).toBe(0);
    expect(buildOptions(500, base, cfg).find((o) => o.id === "none")!.expectedValueCad).toBe(0);
  });

  it("EV increases with probability", () => {
    const units = 600 * cfg.unitsPerCase;
    const evs = [0.4, 0.65, 0.85].map((probability) => expectedValue({ ...base, units, probability }, cfg));
    expect(evs[1]).toBeGreaterThan(evs[0]);
    expect(evs[2]).toBeGreaterThan(evs[1]);
  });

  it("recommends none when shortfall = 0", () => {
    const covered = { ...base, currentCoverUnits: base.projectedDailyDemand * cfg.evHorizonDays };
    expect(evBreakdown({ ...covered, units: 1000 }, cfg).shortfall).toBe(0);
    expect(recommendOption(buildOptions(200, covered, cfg))).toBe("none");
  });

  it("follows the §7.4 formula", () => {
    const units = 840 * 24;
    const b = evBreakdown({ ...base, units }, cfg);
    const shortfall = 1440 * 21 - 7 * 1440;
    expect(b.shortfall).toBe(shortfall);
    expect(b.avoidedUnits).toBeCloseTo((Math.min(units, shortfall) * 19) / 21, 9);
    expect(b.avoidedGP).toBeCloseTo(b.avoidedUnits * 0.4 * 12 * 0.35 * 0.65, 9);
    expect(b.transferCost).toBe(840 * 3.5);
    expect(b.carrying).toBeCloseTo((units - shortfall) * 12 * 0.65 * 0.15 * (21 / 365), 9);
    expect(b.ev).toBeCloseTo(b.avoidedGP - b.transferCost - b.carrying, 9);
  });

  it("breaks ties toward the smaller quantity", () => {
    const opts = [
      { id: "none" as const, cases: 0, units: 0, transferCostCad: 0, expectedValueCad: 0 },
      { id: "half" as const, cases: 5, units: 120, transferCostCad: 1, expectedValueCad: 100 },
      { id: "full" as const, cases: 10, units: 240, transferCostCad: 2, expectedValueCad: 100 },
    ];
    expect(recommendOption(opts)).toBe("half");
  });
});
