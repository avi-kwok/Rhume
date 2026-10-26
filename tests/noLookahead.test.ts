import { describe, expect, it } from "vitest";
import { loadReconstructedSeason } from "../lib/data/loadSeason";
import { DEFAULT_CONFIG } from "../lib/engine/config";
import { addDays, eachDay, mondaysBetween } from "../lib/engine/dates";
import { evidencePackFor } from "../lib/engine/evidence";
import { mulberry32 } from "../lib/engine/rng";
import { wastewaterCheck } from "../lib/engine/signals";
import { simulate } from "../lib/engine/simulate";
import { computeStates } from "../lib/engine/stage";
import type { RegionId, Season } from "../lib/engine/types";
import { published } from "../lib/engine/visible";

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

describe("wastewater publication lag", () => {
  const lag = 5;
  const lagged = { ...cfg, wwPublicationLagDays: lag };

  it("a reading becomes visible to the engine only once date + lag <= replay date", () => {
    const series = season.wastewater.ATL;
    const reading = series[20];
    const prior = series[19];
    expect(published(series, addDays(reading.date, lag - 1), lag).at(-1)).toEqual(prior);
    expect(published(series, addDays(reading.date, lag), lag).at(-1)).toEqual(reading);
    expect(published(series, reading.date, 0).at(-1)).toEqual(reading);

    const before = wastewaterCheck(season, lagged, "ATL", addDays(reading.date, lag - 1));
    const on = wastewaterCheck(season, lagged, "ATL", addDays(reading.date, lag));
    expect(before.values.latest_date).toBe(prior.date);
    expect(on.values.latest_date).toBe(reading.date);
    // Lag 0 is the unchanged default: the reading is usable on its sample date.
    expect(wastewaterCheck(season, cfg, "ATL", reading.date).values.latest_date).toBe(reading.date);
  });

  it.each(dates)("with a %s replay date, wastewater sampled in the last lag days is ignored", (d) => {
    // Mutate only wastewater readings sampled after d − lag (published after d): nothing as of d changes.
    const cut = addDays(d, -lag);
    const m = structuredClone(season);
    for (const id of Object.keys(m.wastewater) as RegionId[]) for (const p of m.wastewater[id]) if (p.date > cut) p.value *= 10;
    for (const x of [...mondaysBetween(season.startDate, d), d]) {
      expect(computeStates(m, lagged, x)).toEqual(computeStates(season, lagged, x));
    }
    const base = simulate(season, lagged, "rhume", "auto").proposals.filter((p) => p.asOf <= d);
    const mut = simulate(m, lagged, "rhume", "auto").proposals.filter((p) => p.asOf <= d);
    expect(mut).toEqual(base);
    expect(mut.map((p) => evidencePackFor(p, { season: m, cfg: lagged }).hash)).toEqual(
      base.map((p) => evidencePackFor(p, { season, cfg: lagged }).hash),
    );
  });
});
