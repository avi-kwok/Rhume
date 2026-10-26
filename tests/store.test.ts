import { beforeEach, describe, expect, it } from "vitest";
import { detailSeries, sparklineSeries, weeklyFlows } from "../lib/chartData";
import { REGION_IDS } from "../lib/data/regions";
import { defaultConfig } from "../lib/engine/config";
import { addDays } from "../lib/engine/dates";
import {
  AUTO_APPROVE_REASON,
  buildDecision,
  selectAsOf,
  selectDecidedThisWeek,
  selectExpiredCards,
  selectOpenCards,
  selectWeeks,
  useRhume,
} from "../lib/store";

const initial = useRhume.getState();

beforeEach(() => {
  useRhume.setState(
    {
      ...initial,
      decisions: {},
      autoApprove: false,
      currentWeekIndex: 0,
      results: initial.results,
    },
    true,
  );
});

describe("store: season weeks", () => {
  it("2023–24 weeks are the Mondays Oct 2, 2023 → Mar 25, 2024", () => {
    const weeks = selectWeeks(useRhume.getState());
    expect(weeks[0]).toBe("2023-10-02");
    expect(weeks[weeks.length - 1]).toBe("2024-03-25");
    useRhume.getState().setWeek(5);
    expect(selectAsOf(useRhume.getState())).toBe("2023-11-06");
    useRhume.getState().setWeek(999);
    expect(selectAsOf(useRhume.getState())).toBe("2024-03-25");
  });
});

describe("store: no chart series has a date after asOf", () => {
  it("for every week and region, sparkline and detail series stop at asOf", () => {
    const n = selectWeeks(useRhume.getState()).length;
    for (let i = 0; i < n; i++) {
      useRhume.getState().setWeek(i);
      const s = useRhume.getState();
      const asOf = selectAsOf(s);
      for (const id of REGION_IDS) {
        const spark = sparklineSeries(s.season, id, asOf);
        const d = detailSeries(s.season, s.results.rh, id, asOf);
        for (const series of [spark, d.wastewater, d.lab, d.cover]) {
          for (const p of series) expect(p.date <= asOf).toBe(true);
        }
        // The cover series reaches today; the domain is the fixed season.
        expect(d.cover[d.cover.length - 1].date).toBe(asOf);
        expect(d.today).toBeLessThanOrEqual(d.domain[1]);
      }
    }
  });

  it("scoreboard flows cover the whole season (outcome view)", () => {
    const s = useRhume.getState();
    const rows = weeklyFlows(s.results.sq, s.results.rh, "ATL");
    expect(rows.length).toBe(selectWeeks(s).length);
  });
});

describe("store: cards", () => {
  it("open cards are undecided proposals from the last 7 days, newest first; they expire after 7 days", () => {
    const st = useRhume.getState();
    const first = st.results.rh.proposals[0];
    const idx = selectWeeks(st).indexOf(first.asOf);
    useRhume.getState().setWeek(idx);
    let open = selectOpenCards(useRhume.getState());
    expect(open.map((p) => p.id)).toContain(first.id);
    for (const p of open) {
      expect(p.asOf <= first.asOf).toBe(true);
      expect(p.asOf > addDays(first.asOf, -7)).toBe(true);
    }
    useRhume.getState().setWeek(idx + 1);
    open = selectOpenCards(useRhume.getState());
    expect(open.map((p) => p.id)).not.toContain(first.id);
    expect(selectExpiredCards(useRhume.getState()).map((p) => p.id)).toContain(first.id);
  });

  it("deciding moves the card to 'Decided this week' and re-runs the simulation", () => {
    const st = useRhume.getState();
    const first = st.results.rh.proposals[0];
    useRhume.getState().setWeek(selectWeeks(st).indexOf(first.asOf));
    const before = useRhume.getState().results.rh;
    useRhume.getState().decide(buildDecision(first, { season: st.season, cfg: st.cfg }, { action: "approve" }));
    const after = useRhume.getState();
    expect(after.results.rh).not.toBe(before);
    expect(after.results.rh.executed.map((e) => e.proposalId)).toContain(first.id);
    expect(selectOpenCards(after).map((p) => p.id)).not.toContain(first.id);
    expect(selectDecidedThisWeek(after).map((d) => d.proposal.id)).toContain(first.id);
  });

  it("auto-approve decides each newly surfaced card with the template source and pack hash", () => {
    useRhume.getState().setAutoApprove(true);
    const last = selectWeeks(useRhume.getState()).length - 1;
    for (let i = 1; i <= last; i++) useRhume.getState().step(1);
    const s = useRhume.getState();
    expect(s.playing).toBe(false);
    for (const p of s.results.rh.proposals) {
      const d = s.decisions[p.id];
      expect(d, p.id).toBeDefined();
      expect(d.action).toBe("approve");
      expect(d.briefSource).toBe("template");
      expect(d.reason).toBe(AUTO_APPROVE_REASON);
      expect(d.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
    }
    // Same executed set as the engine's own auto mode.
    expect(s.results.rh.executed).toEqual(s.results.rhAuto.executed);
  });

  it("setCfg and resetCfg re-run all three results", () => {
    const before = useRhume.getState().results;
    useRhume.getState().setCfg({ ...defaultConfig(), labOnsetPct: 6 });
    expect(useRhume.getState().results.sq).not.toBe(before.sq);
    useRhume.getState().resetCfg();
    expect(useRhume.getState().cfg.labOnsetPct).toBe(5);
  });

  it("setSeason switches to the 2024–25 synchronized scenario and resets the replay", () => {
    useRhume.getState().setWeek(10);
    useRhume.getState().setSeason("2024-25");
    const s = useRhume.getState();
    expect(s.currentWeekIndex).toBe(0);
    expect(selectAsOf(s)).toBe("2024-10-07");
    expect(s.results.sq.days.ATL[0].date).toBe("2024-10-07");
    useRhume.getState().setSeason("2023-24");
  });
});
