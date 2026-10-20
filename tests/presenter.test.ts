import { describe, expect, it } from "vitest";
import { loadSeason } from "../lib/data/loadSeason";
import { defaultConfig } from "../lib/engine/config";
import { simulate } from "../lib/engine/simulate";
import type { Decision } from "../lib/engine/types";
import { pauseCandidates, presenterStep, type PauseRule, type PresenterInput } from "../lib/presenter";
import { AUTO_APPROVE_REASON, buildDecision, seasonWeeks } from "../lib/replay";
import { selectAsOf, useRhume } from "../lib/store";

const season = loadSeason("2023-24");
const cfg = defaultConfig();
const weeks = seasonWeeks(season);

interface Stop {
  rule: PauseRule;
  proposalId: string;
  asOf: string;
  regionId: string;
  kind: string;
}

/** Drive presenterStep from week 0 to the end. At each pause, `onPause` may decide the paused card. */
function run(onPause: (input: PresenterInput, proposalId: string) => Record<string, Decision>) {
  let state: PresenterInput = { season, cfg, weekIndex: 0, decisions: {}, rh: simulate(season, cfg, "rhume", {}), pauseAt: [], rulesHit: [] };
  const stops: Stop[] = [];
  const visited: number[] = [0];
  for (let guard = 0; guard < 200; guard++) {
    const step = presenterStep(state);
    if (step.kind === "end") return { stops, visited, final: { ...state, decisions: step.decisions, rh: step.rh, weekIndex: step.weekIndex } };
    visited.push(step.weekIndex);
    state = { ...state, weekIndex: step.weekIndex, decisions: step.decisions, rh: step.rh };
    if (step.kind === "pause") {
      const p = step.pause.proposal;
      stops.push({ rule: step.pause.rule, proposalId: p.id, asOf: p.asOf, regionId: p.regionId, kind: p.kind });
      // Pause points are never auto-decided.
      expect(step.decisions[p.id]).toBeUndefined();
      state = {
        ...state,
        pauseAt: [...state.pauseAt, ...step.candidates.map((c) => c.proposal.id)],
        rulesHit: [...state.rulesHit, ...step.candidates.map((c) => c.rule)],
      };
      const decisions = onPause(state, p.id);
      if (decisions !== state.decisions) state = { ...state, decisions, rh: simulate(season, cfg, "rhume", decisions) };
    }
  }
  throw new Error("presenter run did not end");
}

describe("presenter step logic", () => {
  it("full run, presenter approves at each pause: both pause points in order, ends at the last week", () => {
    const { stops, visited, final } = run((s, id) => {
      const p = s.rh.proposals.find((x) => x.id === id)!;
      return { ...s.decisions, [id]: buildDecision(p, s, { action: "approve" }) };
    });

    expect(stops.map((s) => s.rule)).toEqual(["first_card", "first_atl_store_move"]);
    // Pause 1: the first card of the season, Ontario or Alberta in November 2023.
    expect(["ON", "AB"]).toContain(stops[0].regionId);
    expect(stops[0].asOf >= "2023-11-01" && stops[0].asOf <= "2023-11-30").toBe(true);
    expect(stops[0].proposalId).toBe(simulate(season, cfg, "rhume", {}).proposals[0].id);
    // Pause 2: the first Atlantic store move, Jan 8, 2024.
    expect(stops[1]).toMatchObject({ regionId: "ATL", kind: "store_move", asOf: "2024-01-08" });

    // Every week visited once, in order, ending at the last week.
    expect(visited).toEqual(weeks.map((_, i) => i));
    expect(final.weekIndex).toBe(weeks.length - 1);

    // Every card is decided; non-pause cards are auto-approved with the recommended option.
    for (const p of final.rh.proposals) {
      const d = final.decisions[p.id];
      expect(d, p.id).toBeDefined();
      expect(d.action).toBe("approve");
      if (!stops.some((s) => s.proposalId === p.id)) expect(d.reason).toBe(AUTO_APPROVE_REASON);
      else expect(d.reason).toBeUndefined();
    }
    // Approving at the pauses reproduces the engine's own auto-approve run.
    expect(final.rh.executed).toEqual(simulate(season, cfg, "rhume", "auto").executed);
  });

  it("pause points left undecided are never auto-decided", () => {
    const { stops, final } = run((s) => s.decisions);
    expect(stops.map((s) => s.rule)).toEqual(["first_card", "first_atl_store_move"]);
    for (const s of stops) expect(final.decisions[s.proposalId]).toBeUndefined();
    // Every other card is decided.
    for (const p of final.rh.proposals) {
      if (stops.some((s) => s.proposalId === p.id)) continue;
      expect(final.decisions[p.id], p.id).toBeDefined();
    }
  });

  it("a rule fires once: stepping again from a pause week does not stop on the same rule", () => {
    const rh = simulate(season, cfg, "rhume", {});
    const first = rh.proposals[0];
    expect(pauseCandidates(rh.proposals, first.asOf, []).map((c) => c.rule)).toContain("first_card");
    expect(pauseCandidates(rh.proposals, first.asOf, ["first_card"]).map((c) => c.rule)).not.toContain("first_card");
  });

  it("store: startPresenter + presenterTick stop at both pauses and end; highlight and region follow the pause", () => {
    const st = useRhume.getState();
    st.setSeason("2024-25");
    st.startPresenter();
    let s = useRhume.getState();
    expect(s.seasonId).toBe("2023-24");
    expect(s.currentWeekIndex).toBe(0);
    expect(s.playing).toBe(true);
    expect(Object.keys(s.decisions)).toHaveLength(0);

    const pauses: { asOf: string; id: string; region: string }[] = [];
    for (let guard = 0; guard < 200; guard++) {
      const kind = useRhume.getState().presenterTick();
      s = useRhume.getState();
      if (kind === "end") break;
      if (kind === "pause") {
        expect(s.playing).toBe(false);
        const id = s.presenter.highlightedProposalId!;
        pauses.push({ asOf: selectAsOf(s), id, region: s.selectedRegion });
        expect(s.decisions[id]).toBeUndefined();
        // The presenter approves through the SAP modal.
        s.requestApprove(id);
        expect(useRhume.getState().approval?.proposalId).toBe(id);
        useRhume.getState().confirmApprove();
        expect(useRhume.getState().decisions[id].action).toBe("approve");
      }
    }
    expect(pauses).toHaveLength(2);
    expect(pauses[0].asOf >= "2023-11-01" && pauses[0].asOf <= "2023-11-30").toBe(true);
    expect(["ON", "AB"]).toContain(pauses[0].region);
    expect(pauses[1].asOf).toBe("2024-01-08");
    expect(pauses[1].region).toBe("ATL");
    expect(s.currentWeekIndex).toBe(weeks.length - 1);
    expect(s.stoCounter).toBe(2);
    useRhume.getState().stopPresenter();
  });
});
