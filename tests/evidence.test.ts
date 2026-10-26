import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_ID, loadRealSeason, loadSeason } from "../lib/data/loadSeason";
import { DEFAULT_CONFIG } from "../lib/engine/config";
import { simulate } from "../lib/engine/simulate";
import { firstSustainedRise, shareOfPeak, weekly } from "../lib/evidenceData";
import { DEMO_CARD_ID, lagRow } from "../lib/lagSensitivity";

describe("evidence and lag sensitivity", () => {
  it("the replay season stays reconstructed even when the real export is imported", () => {
    expect(loadSeason(DEFAULT_SEASON_ID).mode).toBe("reconstructed");
    const real = loadRealSeason();
    if (real) expect(real.mode).toBe("real");
  });

  it("default demo card is unchanged at lag 0 (831 cases, EV C$10,149)", () => {
    const rh = simulate(loadSeason(DEFAULT_SEASON_ID), DEFAULT_CONFIG, "rhume", "auto");
    const card = rh.proposals.find((p) => p.id === DEMO_CARD_ID)!;
    const rec = card.options.find((o) => o.id === card.recommended)!;
    expect(rec.cases).toBe(831);
    expect(Math.round(rec.expectedValueCad)).toBe(10149);
    expect(lagRow("2023-24", 0).demoCard).toMatchObject({ cases: 831 });
  });

  it("weekly averaging, share of peak and first rise", () => {
    const w = weekly([
      { date: "2023-10-02", value: 1 }, { date: "2023-10-05", value: 3 }, // week ending Oct 7
      { date: "2023-10-09", value: 2 },
    ]);
    expect(w).toEqual([{ date: "2023-10-07", value: 2 }, { date: "2023-10-14", value: 2 }]);
    const s = shareOfPeak([0, 0, 0, 0, 1, 5, 10, 5].map((value, i) => ({ date: `2023-11-${String(i + 1).padStart(2, "0")}`, value })));
    expect(s.map((p) => p.value)).toEqual([0, 0, 0, 0, 0.1, 0.5, 1, 0.5]);
    expect(firstSustainedRise(s)).toBe("2023-11-06");
  });
});
