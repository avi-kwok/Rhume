// Presenter step logic (PRD §7.7, DESIGN.md §10.4). Pure: state in, next state out.
//
// One step = "advance from week i to week i + 1":
//   1. Settle: auto-approve the recommended option of every card already surfaced (up to week i)
//      that is still undecided, except pause points. A pause card the presenter left undecided
//      stays undecided (it expires as "do nothing"); pause points are never auto-decided.
//   2. Look at week i + 1. Its proposals are auto-approved one at a time in engine order
//      (re-simulating after each, because an approval changes later proposals), skipping any
//      proposal that matches a pause rule. There is one: "first_atl_store_move", the first
//      Atlantic store move (week of Jan 8, 2024 on the default season). Atlantic is the region of
//      the demo persona, Mia Lily; every other card, including the season's first, is auto-approved.
//   3. If a pause candidate exists on week i + 1, stop there and highlight it. Otherwise advance.
//   At the last week, a step returns "end" (the controller navigates to the Scoreboard).

import type { Config } from "./engine/config";
import { addDays } from "./engine/dates";
import type { Decision, Proposal, Season, SimResult } from "./engine/types";
import { AUTO_APPROVE_REASON, autoDecide, buildDecision, seasonWeeks } from "./replay";
import { simulate } from "./engine/simulate";

export type PauseRule = "first_atl_store_move";

export const PAUSE_RULES: readonly PauseRule[] = ["first_atl_store_move"];

export const PAUSE_RULE_LABEL: Record<PauseRule, string> = {
  first_atl_store_move: "First Atlantic store move",
};

export interface PresenterInput {
  season: Season;
  cfg: Config;
  weekIndex: number;
  decisions: Record<string, Decision>;
  /** The interactive Rhume run for `decisions`. */
  rh: SimResult;
  /** Proposal ids already used as pause points (never auto-decided). */
  pauseAt: readonly string[];
  /** Rules that have already fired this run. */
  rulesHit: readonly PauseRule[];
}

export interface PauseCandidate {
  proposal: Proposal;
  rule: PauseRule;
}

interface StepBase {
  weekIndex: number;
  decisions: Record<string, Decision>;
  rh: SimResult;
}

export type PresenterStep =
  | (StepBase & { kind: "end" })
  | (StepBase & { kind: "advance" })
  | (StepBase & { kind: "pause"; pause: PauseCandidate; /** Every candidate on that week (normally one). */ candidates: PauseCandidate[] });

/** Proposals on `weekAsOf` that match a pause rule not yet hit, in rule order. */
export function pauseCandidates(proposals: readonly Proposal[], weekAsOf: string, rulesHit: readonly PauseRule[]): PauseCandidate[] {
  const out: PauseCandidate[] = [];
  if (!rulesHit.includes("first_atl_store_move")) {
    const atl = proposals.find((p) => p.regionId === "ATL" && p.kind === "store_move");
    if (atl && atl.asOf === weekAsOf) out.push({ proposal: atl, rule: "first_atl_store_move" });
  }
  return out;
}

/** Advance one week under presenter rules. Never decides an id in `pauseAt` or a pause candidate. */
export function presenterStep(input: PresenterInput): PresenterStep {
  const { season, cfg, rulesHit } = input;
  const weeks = seasonWeeks(season);
  const last = weeks.length - 1;
  const index = Math.max(0, Math.min(last, input.weekIndex));
  const asOf = weeks[index];

  // 1. Settle everything surfaced so far (whole season up to asOf), except pause points.
  const settled = autoDecide(season, cfg, input.decisions, input.rh, asOf, addDays(season.startDate, -1), input.pauseAt);
  let decisions = settled.decisions;
  let rh = settled.rh;

  if (index >= last) return { kind: "end", weekIndex: index, decisions, rh };

  // 2. Next week: auto-approve its proposals one at a time, skipping pause candidates.
  const next = index + 1;
  const nextAsOf = weeks[next];
  for (let guard = 0; guard < 100; guard++) {
    const candidates = pauseCandidates(rh.proposals, nextAsOf, rulesHit);
    const skip = new Set([...input.pauseAt, ...candidates.map((c) => c.proposal.id)]);
    const todo = rh.proposals.find((p) => p.asOf === nextAsOf && !decisions[p.id] && !skip.has(p.id));
    if (!todo) break;
    decisions = { ...decisions, [todo.id]: buildDecision(todo, { season, cfg }, { action: "approve", reason: AUTO_APPROVE_REASON }) };
    rh = simulate(season, cfg, "rhume", decisions);
  }

  // 3. Pause on the first remaining candidate, if any.
  const candidates = pauseCandidates(rh.proposals, nextAsOf, rulesHit).filter((c) => !decisions[c.proposal.id]);
  if (candidates.length > 0) return { kind: "pause", weekIndex: next, decisions, rh, pause: candidates[0], candidates };
  return { kind: "advance", weekIndex: next, decisions, rh };
}
