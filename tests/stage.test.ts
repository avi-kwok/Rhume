import { describe, expect, it } from "vitest";
import { REGION_IDS } from "../lib/data/regions";
import { DEFAULT_CONFIG } from "../lib/engine/config";
import { addDays } from "../lib/engine/dates";
import { computeStates } from "../lib/engine/stage";
import type { RegionId, Season } from "../lib/engine/types";

const START = "2024-01-01"; // a Monday
const FLAT = Array(13).fill(1.0);
const BASE8 = Array(8).fill(1.0);
const PEAKING = [...BASE8, 1.0, 1.6, 2.4, 3.6, 3.7]; // W passes at 3.6, then a flat reading near the max
const RISING = [...BASE8, 1.0, 1.2, 1.6, 2.0, 2.5]; // 2.5× baseline, up two readings in a row

/** Hand-built season: daily wastewater readings from START, weekly lab reports on Mondays. */
function makeSeason(ww: Partial<Record<RegionId, number[]>>, lab: Partial<Record<RegionId, number[]>> = {}): Season {
  const n = 13;
  const series = <K extends "value" | "positivity">(key: K, values: number[], step: number) =>
    values.map((v, i) => ({ date: addDays(START, i * step), [key]: v }) as { date: string } & Record<K, number>);
  const s = { id: "test", label: "test", mode: "reconstructed", sourceNote: "test", startDate: START, endDate: addDays(START, n - 1) } as Season;
  s.wastewater = {} as Season["wastewater"];
  s.labTrue = {} as Season["labTrue"];
  s.labReported = {} as Season["labReported"];
  for (const id of REGION_IDS) {
    s.wastewater[id] = series("value", ww[id] ?? FLAT, 1);
    s.labTrue[id] = series("positivity", Array(n).fill(2), 1);
    s.labReported[id] = series("positivity", lab[id] ?? [2, 2], 7);
  }
  return s;
}

const LAST = addDays(START, 12);
const stateOf = (season: Season, id: RegionId = "ATL") => computeStates(season, DEFAULT_CONFIG, LAST)[id];

describe("stage", () => {
  it("W + L → rising, medium", () => {
    const st = stateOf(makeSeason({ ATL: RISING }, { ATL: [3, 6] }));
    expect(st.checks.map((c) => c.passed)).toEqual([true, true, false]);
    expect(st.stage).toBe("rising");
    expect(st.confidence).toBe("medium");
  });

  it("W + L + N → rising, high", () => {
    const st = stateOf(makeSeason({ ATL: RISING, AB: PEAKING }, { ATL: [3, 6] }));
    expect(computeStates(makeSeason({ AB: PEAKING }), DEFAULT_CONFIG, LAST).AB.stage).toBe("peaking");
    expect(st.agreeCount).toBe(3);
    expect(st.stage).toBe("rising");
    expect(st.confidence).toBe("high");
  });

  it("N only → watch", () => {
    const st = stateOf(makeSeason({ AB: PEAKING }));
    expect(st.checks.map((c) => c.passed)).toEqual([false, false, true]);
    expect(st.stage).toBe("watch");
    expect(st.confidence).toBe("low");
  });

  it("L only → quiet", () => {
    const st = stateOf(makeSeason({}, { ATL: [3, 6] }));
    expect(st.checks.map((c) => c.passed)).toEqual([false, true, false]);
    expect(st.stage).toBe("quiet");
  });

  it("post-peak decline → falling", () => {
    // W passes at 2.4 and 3.6; the max 4.0 is reached; then 3.0 < 0.8 × 4.0.
    const st = stateOf(makeSeason({ ATL: [...BASE8, 1.6, 2.4, 3.6, 4.0, 3.0] }));
    expect(st.stage).toBe("falling");
  });

  it("baseline noise before any surge is not read as falling", () => {
    const st = stateOf(makeSeason({ ATL: [1.0, 1.3, 1.0, 0.9, 1.1, 1.0, 1.2, 0.9, 1.0, 1.25, 0.95, 1.0, 0.9] }));
    expect(st.stage).toBe("quiet");
  });

  it("explains every check in plain English", () => {
    const st = stateOf(makeSeason({ ATL: RISING, AB: PEAKING }, { ATL: [3, 6] }));
    expect(st.checks[0].reason).toBe("Wastewater up two readings in a row, 2.5× baseline");
    expect(st.checks[1].reason).toMatch(/^Lab positivity 6\.0%, above the 5% onset line/);
    expect(st.checks[2].reason).toBe("Alberta has been peaking within the last 28 days");
    expect(stateOf(makeSeason({}, { ATL: [2, 3.1] })).checks[1].reason).toBe("Lab positivity 3.1%, below the 5% onset line");
  });
});
