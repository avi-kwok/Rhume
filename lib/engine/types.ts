// Data model. Mirrors DESIGN.md §4 exactly.

export type RegionId = "BC" | "AB" | "ON" | "QC" | "ATL";
export type Stage = "quiet" | "watch" | "rising" | "peaking" | "falling";
export type Confidence = "high" | "medium" | "low";
export type CardKind = "dc_preposition" | "store_move";
export type OptionId = "none" | "half" | "full";
/** status_quo / rhume: the default demo pair. seasonal / seasonal_rhume: national seasonal pre-build baseline (seasonal.ts). */
export type Policy = "status_quo" | "rhume" | "seasonal" | "seasonal_rhume";

export interface Region {
  id: RegionId; name: string; city: string;     // e.g. "Atlantic", "Halifax"
  dcName: string; stores: number; childShare: number; // childShare: share of national children (simulated)
  baselineUnitsPerStorePerDay: number;
}

export interface Season {
  id: string; label: string;                    // "2023–24"
  mode: "reconstructed" | "real";
  sourceNote: string;                           // shown in provenance label
  startDate: string; endDate: string;           // ISO dates
  wastewater: Record<RegionId, { date: string; value: number }[]>;    // ~2 readings/week
  labTrue: Record<RegionId, { date: string; positivity: number }[]>;  // daily, unlagged (drives demand)
  labReported: Record<RegionId, { date: string; positivity: number }[]>; // weekly, as published (lagged)
}

export interface SignalCheck { id: "wastewater" | "lab" | "neighbour"; passed: boolean; reason: string; values: Record<string, number | string>; }

export interface RegionState {
  regionId: RegionId; asOf: string; stage: Stage; confidence: Confidence;
  checks: SignalCheck[]; agreeCount: number;
}

export interface Option { id: OptionId; cases: number; units: number; transferCostCad: number; expectedValueCad: number; }

export interface Proposal {
  id: string;                                   // `${asOf}:${regionId}:${kind}`
  asOf: string; regionId: RegionId; kind: CardKind;
  stage: Stage; confidence: Confidence; probability: number;
  sourceKind: "own_dc" | "other_dc"; sourceName: string; leadDays: number; arrivalDate: string;
  coverDays: number; targetCoverDays: number; projectedDailyDemand: number;
  options: Option[]; recommended: OptionId;
  approvalReason: string; reversible: boolean;
  changeTrigger: string;                        // engine-written condition, e.g. "Halifax wastewater falls at the next reading"
}

export interface Decision {
  proposalId: string; action: "approve" | "reject" | "edit_approve";
  optionId?: OptionId; cases?: number; reason?: string;
  decidedAt: string; briefSource: "ai" | "template"; evidenceHash: string;
}

export interface DayRecord {                    // one per region per day per policy
  date: string; demand: number; sales: number; unmet: number;
  storeOnHand: number; storeInTransit: number; dcOnHand: number; dcInbound: number;
  arrivedUnits: number; coverDays: number;
}

export interface SimResult {
  policy: Policy;
  days: Record<RegionId, DayRecord[]>;
  proposals: Proposal[];                        // rhume and seasonal_rhume only
  executed: { proposalId: string; cases: number; arrivalDate: string }[];
  transferCostCad: number;
}
