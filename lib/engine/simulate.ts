// Simulation of both policies (DESIGN.md §7.5). Pure: same inputs → identical output.

import type { Config } from "./config";
import { addDays, eachDay, isMonday } from "./dates";
import { casesFor, planProposal, projectedDailyDemand, type InventorySnapshot, type ProposalPlan } from "./proposals";
import { getStageEngine } from "./stage";
import type { Decision, DayRecord, Policy, Proposal, RegionId, Season, SimResult } from "./types";
import { latestVisible } from "./visible";
import { labPeakPct, REGION_BY_ID, REGION_IDS } from "../data/regions";
import { LAB_BASELINE_PCT } from "../data/generate";

export const INITIAL_STORE_DAYS = 14;
export const INITIAL_DC_DAYS = 35;

export type Decisions = Record<string, Decision> | "auto";

interface Shipment { arrival: string; units: number }

interface RegionSim {
  storeOnHand: number;
  dcOnHand: number;
  toStore: Shipment[];
  toDc: Shipment[];
  sales: number[];            // daily sales history (for avgSales7)
  days: DayRecord[];
}

/** Unit ledger for the conservation invariant (§7.5). */
export interface SimLedger {
  initialUnits: number;
  suppliedUnits: number;      // supplier → DC fills (including those still in transit)
  salesUnits: number;
  finalUnits: number;         // stores + DCs + in transit, all regions
}

const sum = (xs: readonly Shipment[]): number => xs.reduce((s, x) => s + x.units, 0);

function land(queue: Shipment[], date: string): { remaining: Shipment[]; units: number } {
  let units = 0;
  const remaining: Shipment[] = [];
  for (const s of queue) {
    if (s.arrival <= date) units += s.units;
    else remaining.push(s);
  }
  return { remaining, units };
}

function avgLast7(sales: readonly number[]): number {
  const last = sales.slice(-7);
  return last.length ? last.reduce((s, x) => s + x, 0) / last.length : 0;
}

/** labNorm = clip((labTrue − 2) / (peakPct − 2), 0, 1), using the region's own peak. */
export function labNorm(labTruePct: number, peakPct: number): number {
  const span = peakPct - LAB_BASELINE_PCT;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, (labTruePct - LAB_BASELINE_PCT) / span));
}

function chosenCases(proposal: Proposal, decisions: Decisions): number {
  if (decisions === "auto") return casesFor(proposal, { optionId: proposal.recommended });
  const d = decisions[proposal.id];
  if (!d || d.action === "reject") return 0;
  if (d.action === "edit_approve") return casesFor(proposal, { cases: d.cases ?? 0 });
  return casesFor(proposal, { optionId: d.optionId ?? proposal.recommended });
}

/** Full simulation with its unit ledger. */
export function simulateDetailed(
  season: Season, cfg: Config, policy: Policy, decisions: Decisions,
): { result: SimResult; ledger: SimLedger } {
  const engine = policy === "rhume" ? getStageEngine(season, cfg) : null;
  const sims = {} as Record<RegionId, RegionSim>;
  let initialUnits = 0;

  for (const id of REGION_IDS) {
    const r = REGION_BY_ID[id];
    const base = r.stores * r.baselineUnitsPerStorePerDay;
    sims[id] = { storeOnHand: INITIAL_STORE_DAYS * base, dcOnHand: INITIAL_DC_DAYS * base, toStore: [], toDc: [], sales: [], days: [] };
    initialUnits += (INITIAL_STORE_DAYS + INITIAL_DC_DAYS) * base;
  }

  const proposals: Proposal[] = [];
  const executed: SimResult["executed"] = [];
  let transferCostCad = 0;
  let suppliedUnits = 0;
  let salesUnits = 0;

  for (const d of eachDay(season.startDate, season.endDate)) {
    const arrivedToStore = {} as Record<RegionId, number>;

    // 1–2. Land arrivals; true demand and sales.
    for (const id of REGION_IDS) {
      const s = sims[id];
      const r = REGION_BY_ID[id];
      const toStore = land(s.toStore, d);
      const toDc = land(s.toDc, d);
      s.toStore = toStore.remaining;
      s.toDc = toDc.remaining;
      s.storeOnHand += toStore.units;
      s.dcOnHand += toDc.units;
      arrivedToStore[id] = toStore.units;

      // True positivity today drives demand (the simulated world); never a later point.
      const truth = latestVisible(season.labTrue[id], d);
      const labTrue = truth && truth.date === d ? truth.positivity : LAB_BASELINE_PCT;
      const demand = r.stores * r.baselineUnitsPerStorePerDay * (1 + cfg.surgeAmplitude * labNorm(labTrue, labPeakPct(season, id)));
      const sales = Math.min(demand, s.storeOnHand);
      s.storeOnHand -= sales;
      s.sales.push(sales);
      salesUnits += sales;
      s.days.push({
        date: d, demand, sales, unmet: demand - sales,
        storeOnHand: 0, storeInTransit: 0, dcOnHand: 0, dcInbound: 0, arrivedUnits: toStore.units, coverDays: 0,
      });
    }

    // 3. Mondays.
    if (isMonday(d)) {
      const states = engine ? engine.statesAt(d) : null;

      // Store replenishment (both policies), filled from own DC.
      for (const id of REGION_IDS) {
        const s = sims[id];
        const order = Math.max(0, avgLast7(s.sales) * cfg.storeCoverDays - s.storeOnHand - sum(s.toStore));
        const fill = Math.min(order, s.dcOnHand);
        if (fill > 0) {
          s.dcOnHand -= fill;
          s.toStore.push({ arrival: addDays(d, cfg.dcToStoreLeadDays), units: fill });
        }
      }

      // DC replenishment from supplier (optionally supply-capped, pro rata).
      const requested = {} as Record<RegionId, number>;
      let totalRequested = 0;
      for (const id of REGION_IDS) {
        const s = sims[id];
        const avg = avgLast7(s.sales);
        const rate = states ? Math.max(avg, projectedDailyDemand(REGION_BY_ID[id], states[id].stage, cfg)) : avg;
        requested[id] = Math.max(0, rate * cfg.dcCoverDays - s.dcOnHand - sum(s.toDc));
        totalRequested += requested[id];
      }
      // Capped at supplyCapShare × total requested, shared pro rata, so every region gets the same share.
      const capShare = cfg.supplyCapped && totalRequested > 0 ? Math.min(1, cfg.supplyCapShare) : 1;
      for (const id of REGION_IDS) {
        const fill = requested[id] * capShare;
        if (fill > 0) {
          sims[id].toDc.push({ arrival: addDays(d, cfg.supplierLeadDays), units: fill });
          suppliedUnits += fill;
        }
      }

      // Rhume only: stages and proposals as of d; decide; execute.
      if (states) {
        for (const id of REGION_IDS) {
          const inventory = {} as Record<RegionId, InventorySnapshot>;
          for (const rid of REGION_IDS) {
            const s = sims[rid];
            inventory[rid] = { storeOnHand: s.storeOnHand, storeInTransit: sum(s.toStore), dcOnHand: s.dcOnHand, dcInbound: sum(s.toDc) };
          }
          const plan = planProposal({ cfg, asOf: d, states, inventory, previous: proposals }, id);
          if (!plan) continue;
          proposals.push(plan.proposal);
          const cases = chosenCases(plan.proposal, decisions);
          if (cases > 0) {
            transferCostCad += execute(plan, cases, sims, cfg);
            executed.push({ proposalId: plan.proposal.id, cases, arrivalDate: plan.proposal.arrivalDate });
          }
        }
      }
    }

    // 4. Record end-of-day positions.
    for (const id of REGION_IDS) {
      const s = sims[id];
      const rec = s.days[s.days.length - 1];
      rec.storeOnHand = s.storeOnHand;
      rec.storeInTransit = sum(s.toStore);
      rec.dcOnHand = s.dcOnHand;
      rec.dcInbound = sum(s.toDc);
      rec.coverDays = s.storeOnHand / Math.max(1, avgLast7(s.sales));
      rec.arrivedUnits = arrivedToStore[id];
    }
  }

  let finalUnits = 0;
  const days = {} as Record<RegionId, DayRecord[]>;
  for (const id of REGION_IDS) {
    const s = sims[id];
    days[id] = s.days;
    finalUnits += s.storeOnHand + s.dcOnHand + sum(s.toStore) + sum(s.toDc);
  }

  return {
    result: {
      policy,
      days,
      proposals: policy === "rhume" ? proposals : [],
      executed,
      transferCostCad,
    },
    ledger: { initialUnits, suppliedUnits, salesUnits, finalUnits },
  };
}

/** Execute an approved quantity: deduct from source DC(s) now, ship to destination. Returns transfer cost. */
function execute(plan: ProposalPlan, cases: number, sims: Record<RegionId, RegionSim>, cfg: Config): number {
  const p = plan.proposal;
  const units = cases * cfg.unitsPerCase;
  const primary = sims[plan.primarySource];
  const fromPrimary = Math.min(units, plan.primaryAvailable, primary.dcOnHand);
  primary.dcOnHand -= fromPrimary;
  let shipped = fromPrimary;
  if (plan.donor && units > fromPrimary) {
    const donor = sims[plan.donor];
    const fromDonor = Math.min(units - fromPrimary, donor.dcOnHand);
    donor.dcOnHand -= fromDonor;
    shipped += fromDonor;
  }
  const dest = sims[p.regionId];
  const shipment = { arrival: p.arrivalDate, units: shipped };
  if (plan.destination === "store") dest.toStore.push(shipment);
  else dest.toDc.push(shipment);
  return Math.ceil(shipped / cfg.unitsPerCase) * cfg.costPerCase[p.sourceKind];
}

/** simulate(season, cfg, policy, decisions | "auto") → SimResult. */
export function simulate(season: Season, cfg: Config, policy: Policy, decisions: Decisions): SimResult {
  return simulateDetailed(season, cfg, policy, decisions).result;
}

/** The three results the UI needs: status quo, Rhume with current decisions, Rhume with auto-approve. */
export function simulateAll(season: Season, cfg: Config, decisions: Record<string, Decision>): { sq: SimResult; rh: SimResult; rhAuto: SimResult } {
  return {
    sq: simulate(season, cfg, "status_quo", "auto"),
    rh: simulate(season, cfg, "rhume", decisions),
    rhAuto: simulate(season, cfg, "rhume", "auto"),
  };
}
