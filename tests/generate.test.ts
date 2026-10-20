import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateSeason, generateSeason2023, generateSeason2024Synchronized, serializeSeason, solveSigma, wastewaterCurve } from "../lib/data/generate";
import { REGION_IDS, SEASON_2023_24, SEASON_2024_25 } from "../lib/data/regions";
import { daysBetween, isMonday, isThursday } from "../lib/engine/dates";

const DATA = join(__dirname, "..", "data");

describe("generate", () => {
  it("gives byte-identical output for the same seed", () => {
    expect(serializeSeason(generateSeason2023())).toBe(serializeSeason(generateSeason2023()));
    expect(serializeSeason(generateSeason2024Synchronized())).toBe(serializeSeason(generateSeason2024Synchronized()));
    expect(serializeSeason(generateSeason(SEASON_2023_24, 1))).not.toBe(serializeSeason(generateSeason2023()));
  });

  it("matches the committed season JSON files", () => {
    expect(readFileSync(join(DATA, "season-2023-24.reconstructed.json"), "utf8")).toBe(serializeSeason(generateSeason2023()));
    expect(readFileSync(join(DATA, "season-2024-25.synchronized.json"), "utf8")).toBe(serializeSeason(generateSeason2024Synchronized()));
  });

  for (const [season, params] of [
    [generateSeason2023(), SEASON_2023_24],
    [generateSeason2024Synchronized(), SEASON_2024_25],
  ] as const) {
    it(`${season.label}: each region's wastewater first crosses 1.5× within ±4 days of its onset`, () => {
      for (const id of REGION_IDS) {
        const first = season.wastewater[id].find((r) => r.value >= 1.5);
        expect(first, id).toBeDefined();
        expect(Math.abs(daysBetween(params.regions[id].onset, first!.date)), id).toBeLessThanOrEqual(4);
      }
    });
  }

  it("solves σ so the noise-free curve crosses 1.5 exactly at the onset", () => {
    for (const id of REGION_IDS) {
      const p = SEASON_2023_24.regions[id];
      expect(solveSigma(p)).toBeGreaterThan(0);
      expect(wastewaterCurve(p.onset, p)).toBeCloseTo(1.5, 10);
    }
  });

  it("puts wastewater on Mondays and Thursdays, lab reports on Mondays, true lab daily", () => {
    const s = generateSeason2023();
    const days = daysBetween(s.startDate, s.endDate) + 1;
    for (const id of REGION_IDS) {
      expect(s.wastewater[id].every((r) => isMonday(r.date) || isThursday(r.date))).toBe(true);
      expect(s.labReported[id].every((r) => isMonday(r.date))).toBe(true);
      expect(s.labReported[id].every((r) => r.positivity >= 0.5)).toBe(true);
      expect(s.labTrue[id]).toHaveLength(days);
    }
  });
});
