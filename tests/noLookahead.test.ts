import { describe, expect, it } from "vitest";
import { loadReconstructedSeason } from "../lib/data/loadSeason";
import { DEFAULT_CONFIG } from "../lib/engine/config";
import { eachDay, mondaysBetween } from "../lib/engine/dates";
import { evidencePackFor } from "../lib/engine/evidence";
import { mulberry32 } from "../lib/engine/rng";
import { simulate } from "../lib/engine/simulate";
import { computeStates } from "../lib/engine/stage";
import type { RegionId, Season } from "../lib/engine/types";

const season = loadReconstructedSeason();
const cfg = DEFAULT_CONFIG;

/** Deep copy with every data point dated after d multiplied by 10. */
function mutateAfter(s: Season, d: string): Season {
  const m = structuredClone(s);
  for (const id of Object.keys(m.wastewater) as RegionId[]) {
    for (const p of m.wastewater[id]) if (p.date > d) p.value *= 10;
    for (const p of m.labTrue[id]) if (p.date > d) p.positivity *= 10;
    for (const p of m.labReported[id]) if (p.date > d) p.positivity *= 10;
  }
  return m;
}

const days = eachDay(season.startDate, season.endDate);
const rng = mulberry32(42);
const dates = Array.from({ length: 8 }, () => days[Math.floor(rng() * days.length)]).sort();

describe("no look-ahead", () => {
  const baseline = simulate(season, cfg, "rhume", "auto");

  it.each(dates)("stages, proposals and evidence packs as of %s ignore later data", (d) => {
    const mutated = mutateAfter(season, d);
    expect(mutated.wastewater.ATL.at(-1)!.value).not.toBe(season.wastewater.ATL.at(-1)!.value);

    for (const x of [...mondaysBetween(season.startDate, d), d]) {
      expect(computeStates(mutated, cfg, x)).toEqual(computeStates(season, cfg, x));
    }

    const mutatedSim = simulate(mutated, cfg, "rhume", "auto");
    const before = baseline.proposals.filter((p) => p.asOf <= d);
    const after = mutatedSim.proposals.filter((p) => p.asOf <= d);
    expect(after).toEqual(before);

    const packs = before.map((p) => evidencePackFor(p, { season, cfg }));
    const mutatedPacks = after.map((p) => evidencePackFor(p, { season: mutated, cfg }));
    expect(mutatedPacks).toEqual(packs);
    expect(mutatedPacks.map((p) => p.hash)).toEqual(packs.map((p) => p.hash));

    // The simulated world is causal too: every day up to d is unchanged.
    for (const id of Object.keys(baseline.days) as RegionId[]) {
      expect(mutatedSim.days[id].filter((r) => r.date <= d)).toEqual(baseline.days[id].filter((r) => r.date <= d));
    }
  });
});
