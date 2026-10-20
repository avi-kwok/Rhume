// Pure replay helpers shared by the store, the presenter step logic and tests.
// No React, no Zustand: safe to import anywhere.

import type { Config } from "./engine/config";
import { addDays, mondaysBetween } from "./engine/dates";
import { evidencePackFor } from "./engine/evidence";
import { simulate } from "./engine/simulate";
import type { Decision, OptionId, Proposal, Season, SimResult } from "./engine/types";

/** Cards expire after 7 days if not decided (PRD §7.1). */
export const CARD_LIFETIME_DAYS = 7;

/** Reason written on decisions made by auto-approve, so the UI can show them as "Auto". */
export const AUTO_APPROVE_REASON = "Auto-approved: engine-recommended option";

const weeksCache = new WeakMap<Season, string[]>();

/** Season weeks: the Mondays from startDate to endDate (2023–24: Oct 2, 2023 → Mar 25, 2024). */
export function seasonWeeks(season: Season): string[] {
  let weeks = weeksCache.get(season);
  if (!weeks) {
    weeks = mondaysBetween(season.startDate, season.endDate);
    weeksCache.set(season, weeks);
  }
  return weeks;
}

/** A card is open on asOf when it surfaced in the last 7 days (asOf − 7 < card date ≤ asOf). */
export function inCardWindow(proposal: Proposal, asOf: string): boolean {
  return proposal.asOf <= asOf && proposal.asOf > addDays(asOf, -CARD_LIFETIME_DAYS);
}

export function recommendedOption(proposal: Proposal) {
  return proposal.options.find((o) => o.id === proposal.recommended)!;
}

/**
 * Build a Decision for a proposal, stamped with the evidence-pack hash.
 * briefSource defaults to "template" unless the caller passes the loaded brief's source.
 */
export function buildDecision(
  proposal: Proposal,
  ctx: { season: Season; cfg: Config },
  input: {
    action: Decision["action"];
    optionId?: OptionId;
    cases?: number;
    reason?: string;
    briefSource?: Decision["briefSource"];
  },
): Decision {
  const decision: Decision = {
    proposalId: proposal.id,
    action: input.action,
    decidedAt: new Date().toISOString(),
    briefSource: input.briefSource ?? "template",
    evidenceHash: evidencePackFor(proposal, ctx).hash,
  };
  if (input.action === "approve") decision.optionId = input.optionId ?? proposal.recommended;
  if (input.optionId !== undefined && input.action !== "approve") decision.optionId = input.optionId;
  if (input.cases !== undefined) decision.cases = input.cases;
  if (input.reason !== undefined) decision.reason = input.reason;
  return decision;
}

export function isAutoDecision(decision: Decision | undefined): boolean {
  return decision?.reason === AUTO_APPROVE_REASON;
}

/**
 * Auto-approve the recommended option for every undecided card that surfaced after `fromExclusive`
 * (or is still open on asOf), one at a time in engine order, re-simulating after each, because an
 * approval can change later proposals (DC stock, donors). Never decides an id in `skip`
 * (presenter pause points).
 */
export function autoDecide(
  season: Season,
  cfg: Config,
  decisions: Record<string, Decision>,
  rh: SimResult,
  asOf: string,
  fromExclusive: string,
  skip: readonly string[],
): { decisions: Record<string, Decision>; rh: SimResult } {
  let ds = decisions;
  let result = rh;
  const lower = fromExclusive < addDays(asOf, -CARD_LIFETIME_DAYS) ? fromExclusive : addDays(asOf, -CARD_LIFETIME_DAYS);
  for (let guard = 0; guard < 500; guard++) {
    const next = result.proposals.find(
      (p) => p.asOf <= asOf && p.asOf > lower && !ds[p.id] && !skip.includes(p.id),
    );
    if (!next) break;
    ds = { ...ds, [next.id]: buildDecision(next, { season, cfg }, { action: "approve", reason: AUTO_APPROVE_REASON }) };
    result = simulate(season, cfg, "rhume", ds);
  }
  return { decisions: ds, rh: result };
}
