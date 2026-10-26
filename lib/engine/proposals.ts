// Proposals (DESIGN.md §7.3), generated on Mondays only. Pure: state in, proposal out.

import type { Config, SourceKind } from "./config";
import { addDays, daysBetween, isMonday } from "./dates";
import { buildOptions, recommendOption } from "./ev";
import type { CardKind, Proposal, Region, RegionId, RegionState, Stage } from "./types";
import { REGION_BY_ID, REGION_IDS } from "../data/regions";

/** Stock position of one region at the moment proposals are made. */
export interface InventorySnapshot {
  storeOnHand: number;
  storeInTransit: number;
  dcOnHand: number;
  dcInbound: number;
}

export interface ProposalContext {
  cfg: Config;
  asOf: string;
  states: Record<RegionId, RegionState>;
  inventory: Record<RegionId, InventorySnapshot>;
  /** Proposals already made this season (any date before or on asOf), for the 7-day rule. */
  previous: readonly Proposal[];
}

/** A proposal plus the internal routing the simulation needs to execute it. */
export interface ProposalPlan {
  proposal: Proposal;
  destination: "store" | "dc";
  /** Region whose DC supplies first (own DC for store moves; donor for DC pre-positions). */
  primarySource: RegionId;
  /** Units the primary source can give; the remainder comes from the donor. */
  primaryAvailable: number;
  donor: RegionId | null;
}

export const KIND_LABEL: Record<CardKind, string> = {
  dc_preposition: "DC pre-position",
  store_move: "Store move",
};

export const SCARCE_APPROVAL_REASON = "Children's fever medicine is scarce-sensitive: planner approves every run";
export const ABOVE_THRESHOLD_REASON = "Above the routine value threshold";
export const ROUTINE_REASON = "Routine, within threshold";

/** stores × baseline × stageMultiplier[stage]. */
export function projectedDailyDemand(region: Region, stage: Stage, cfg: Config): number {
  return region.stores * region.baselineUnitsPerStorePerDay * cfg.stageMultiplier[stage];
}

/** Own DC available = dcOnHand − dcReserveShare × dcOnHand. */
export function ownDcAvailable(dcOnHand: number, cfg: Config): number {
  return Math.max(0, dcOnHand - cfg.dcReserveShare * dcOnHand);
}

/** Donor available = donorDcOnHand − donorFloorDays × donor projected daily demand. */
export function donorAvailable(region: Region, stage: Stage, dcOnHand: number, cfg: Config): number {
  return Math.max(0, dcOnHand - cfg.donorFloorDays * projectedDailyDemand(region, stage, cfg));
}

/** Donors are regions in quiet or falling, preferring falling; then the most surplus; ties west → east. */
export function pickDonor(ctx: ProposalContext, exclude: RegionId): { regionId: RegionId; available: number } | null {
  const candidates = REGION_IDS.filter((id) => id !== exclude)
    .map((id) => {
      const stage = ctx.states[id].stage;
      return { regionId: id, stage, available: donorAvailable(REGION_BY_ID[id], stage, ctx.inventory[id].dcOnHand, ctx.cfg) };
    })
    .filter((c) => (c.stage === "falling" || c.stage === "quiet") && c.available >= ctx.cfg.unitsPerCase);
  const pool = candidates.some((c) => c.stage === "falling") ? candidates.filter((c) => c.stage === "falling") : candidates;
  let best: (typeof pool)[number] | null = null;
  for (const c of pool) if (!best || c.available > best.available) best = c;
  return best ? { regionId: best.regionId, available: best.available } : null;
}

export function proposalId(asOf: string, regionId: RegionId, kind: CardKind): string {
  return `${asOf}:${regionId}:${kind}`;
}

export function changeTriggerFor(kind: CardKind, city: string): string {
  return kind === "dc_preposition"
    ? `If ${city} wastewater does not rise at the next two readings, hold the stock at the DC`
    : `If ${city} wastewater falls at the next reading, stop further moves and keep the remainder at the DC`;
}

function recentlyProposed(ctx: ProposalContext, regionId: RegionId, kind: CardKind): boolean {
  return ctx.previous.some(
    (p) => p.regionId === regionId && p.kind === kind && p.asOf <= ctx.asOf && daysBetween(p.asOf, ctx.asOf) < 7,
  );
}

/**
 * Plan the proposal for one region, or null. watch → dc_preposition from the donor DC with the
 * most surplus (lead 4). rising → store_move from own DC (lead 2), topped up from a donor DC
 * (lead 4, sourceKind "other_dc") when own DC available < full quantity. No proposal in quiet,
 * peaking or falling, when full = 0, or when the same kind was proposed for the region in the last 7 days.
 */
export function planProposal(ctx: ProposalContext, regionId: RegionId): ProposalPlan | null {
  const { cfg, asOf } = ctx;
  if (!isMonday(asOf)) return null;
  const state = ctx.states[regionId];
  const stage = state.stage;
  if (stage !== "watch" && stage !== "rising") return null;
  const kind: CardKind = stage === "watch" ? "dc_preposition" : "store_move";
  if (recentlyProposed(ctx, regionId, kind)) return null;

  const region = REGION_BY_ID[regionId];
  const inv = ctx.inventory[regionId];
  const pdd = projectedDailyDemand(region, stage, cfg);
  const upc = cfg.unitsPerCase;

  let current: number;
  let target: number;
  let fullCases: number;
  let sourceKind: SourceKind;
  let sourceName: string;
  let leadDays: number;
  let primarySource: RegionId;
  let primaryAvailable: number;
  let donorId: RegionId | null = null;

  if (kind === "dc_preposition") {
    current = inv.dcOnHand;
    target = cfg.targetCoverDc;
    const needCases = Math.ceil(Math.max(0, target * pdd - current) / upc);
    const donor = pickDonor(ctx, regionId);
    if (!donor) return null;
    fullCases = Math.min(needCases, Math.floor(donor.available / upc));
    sourceKind = "other_dc";
    sourceName = REGION_BY_ID[donor.regionId].dcName;
    leadDays = cfg.transferLeadDcToDcDays;
    primarySource = donor.regionId;
    primaryAvailable = donor.available;
  } else {
    current = inv.storeOnHand + inv.storeInTransit;
    target = cfg.targetCoverStore;
    const needCases = Math.ceil(Math.max(0, target * pdd - current) / upc);
    const own = ownDcAvailable(inv.dcOnHand, cfg);
    primarySource = regionId;
    primaryAvailable = own;
    if (needCases * upc <= own) {
      fullCases = needCases;
    } else {
      const donor = pickDonor(ctx, regionId);
      donorId = donor?.regionId ?? null;
      fullCases = Math.min(needCases, Math.floor((own + (donor?.available ?? 0)) / upc));
    }
    const needsDonor = donorId !== null && fullCases * upc > own;
    if (!needsDonor) donorId = null;
    sourceKind = needsDonor ? "other_dc" : "own_dc";
    sourceName = needsDonor ? `${region.dcName} + ${REGION_BY_ID[donorId!].dcName}` : region.dcName;
    leadDays = needsDonor ? cfg.transferLeadDcToDcDays : cfg.transferLeadOwnToStoresDays;
  }

  if (fullCases <= 0) return null;

  const probability = cfg.probability[state.confidence];
  const options = buildOptions(fullCases, { projectedDailyDemand: pdd, currentCoverUnits: current, leadDays, probability, sourceKind }, cfg);
  const recommended = recommendOption(options);

  let approvalReason: string;
  if (kind === "store_move") {
    approvalReason = SCARCE_APPROVAL_REASON;
  } else {
    const rec = options.find((o) => o.id === recommended)!;
    const cost = recommended === "none" ? options.find((o) => o.id === "full")!.transferCostCad : rec.transferCostCad;
    approvalReason = cost > cfg.autoApproveCostCad ? ABOVE_THRESHOLD_REASON : ROUTINE_REASON;
  }

  const proposal: Proposal = {
    id: proposalId(asOf, regionId, kind),
    asOf,
    regionId,
    kind,
    stage,
    confidence: state.confidence,
    probability,
    sourceKind,
    sourceName,
    leadDays,
    arrivalDate: addDays(asOf, leadDays),
    coverDays: current / pdd,
    targetCoverDays: target,
    projectedDailyDemand: pdd,
    options,
    recommended,
    approvalReason,
    reversible: true,
    changeTrigger: changeTriggerFor(kind, region.city),
  };

  return {
    proposal,
    destination: kind === "store_move" ? "store" : "dc",
    primarySource,
    primaryAvailable,
    donor: donorId,
  };
}

/** The proposal for one region, or null. */
export function buildProposal(ctx: ProposalContext, regionId: RegionId): Proposal | null {
  return planProposal(ctx, regionId)?.proposal ?? null;
}

/** Proposals made on a given date (from a simulation's proposal list). */
export function proposalsOn(proposals: readonly Proposal[], asOf: string): Proposal[] {
  return proposals.filter((p) => p.asOf === asOf);
}

/** Proposals visible as of a date: made on or before asOf. */
export function proposalsAsOf(proposals: readonly Proposal[], asOf: string): Proposal[] {
  return proposals.filter((p) => p.asOf <= asOf);
}

/** Cases for a chosen option or edited quantity, clamped to [0, full]. */
export function casesFor(proposal: Proposal, choice: { optionId?: Proposal["recommended"]; cases?: number }): number {
  const full = proposal.options.find((o) => o.id === "full")!.cases;
  if (choice.cases !== undefined) return Math.max(0, Math.min(full, Math.round(choice.cases)));
  const id = choice.optionId ?? proposal.recommended;
  return proposal.options.find((o) => o.id === id)!.cases;
}
