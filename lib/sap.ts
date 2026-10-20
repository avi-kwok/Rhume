// Simulated SAP documents (DESIGN.md §11, PRD §7.3). Nothing here talks to SAP: it builds the
// stock transport order and allocation table Rhume would post, for display and the payload view.

import type { Config } from "./engine/config";
import { parseISO } from "./engine/dates";
import { REGION_BY_ID } from "./data/regions";
import type { Proposal, RegionId } from "./engine/types";
import { formatInt } from "./format";
import { storeTasksFor, type StoreTask } from "./storeTasks";

export const STO_BASE = 4_500_000_000;
export const SAP_BANNER =
  "Simulated, no SAP connection. In production: Joule Studio agent → S/4HANA allocation table and stock transport order.";
export const MATERIAL_GROUP = "Children's fever & cold medicine (OTC)";
export const STORE_MOVE_RECEIVING = "Region stores via allocation table";
export const CREATED_BY = "Rhume agent, approved by Planner";

/** Document number for the n-th order (n starts at 1): 4500000001, 4500000002, … */
export function stoNumber(n: number): string {
  return String(STO_BASE + Math.max(0, Math.floor(n)));
}

/** ISO-8601 week label, e.g. "2024-01-08" → "2024W02". */
export function isoWeekLabel(iso: string): string {
  const d = parseISO(iso);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const thursday = new Date(d.getTime() + (3 - day) * 86_400_000);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = 1 + Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7);
  return `${year}W${String(week).padStart(2, "0")}`;
}

export function allocationTableId(regionId: RegionId, asOf: string): string {
  return `AT-${regionId}-${isoWeekLabel(asOf)}`;
}

/**
 * Five sub-areas per region (simulated). storeShare splits the region's stores; childIndex is the
 * sub-area's child population per store relative to the region average (1.00 = average).
 */
interface SubAreaDef {
  name: string;
  storeShare: number;
  childIndex: number;
}

export const SUB_AREAS: Record<RegionId, SubAreaDef[]> = {
  BC: [
    { name: "Metro Vancouver", storeShare: 0.5, childIndex: 0.95 },
    { name: "Fraser Valley", storeShare: 0.15, childIndex: 1.15 },
    { name: "Vancouver Island", storeShare: 0.15, childIndex: 0.9 },
    { name: "Okanagan and Interior", storeShare: 0.12, childIndex: 1.0 },
    { name: "Northern BC", storeShare: 0.08, childIndex: 1.1 },
  ],
  AB: [
    { name: "Edmonton", storeShare: 0.36, childIndex: 1.05 },
    { name: "Calgary", storeShare: 0.38, childIndex: 1.0 },
    { name: "Red Deer and Central", storeShare: 0.1, childIndex: 1.05 },
    { name: "Lethbridge and South", storeShare: 0.08, childIndex: 0.95 },
    { name: "Northern Alberta", storeShare: 0.08, childIndex: 1.1 },
  ],
  ON: [
    { name: "Greater Toronto", storeShare: 0.45, childIndex: 1.0 },
    { name: "Ottawa and Eastern", storeShare: 0.15, childIndex: 0.95 },
    { name: "Hamilton and Niagara", storeShare: 0.13, childIndex: 1.0 },
    { name: "Southwestern Ontario", storeShare: 0.17, childIndex: 1.05 },
    { name: "Northern Ontario", storeShare: 0.1, childIndex: 0.9 },
  ],
  QC: [
    { name: "Montréal", storeShare: 0.45, childIndex: 0.95 },
    { name: "Québec City", storeShare: 0.15, childIndex: 0.95 },
    { name: "Montérégie", storeShare: 0.17, childIndex: 1.1 },
    { name: "Laurentides and Lanaudière", storeShare: 0.13, childIndex: 1.1 },
    { name: "Eastern Québec", storeShare: 0.1, childIndex: 0.9 },
  ],
  ATL: [
    { name: "Halifax", storeShare: 0.3, childIndex: 1.0 },
    { name: "Nova Scotia (rest)", storeShare: 0.2, childIndex: 0.9 },
    { name: "New Brunswick", storeShare: 0.25, childIndex: 1.0 },
    { name: "Newfoundland and Labrador", storeShare: 0.17, childIndex: 1.05 },
    { name: "Prince Edward Island", storeShare: 0.08, childIndex: 1.05 },
  ],
};

/** Largest-remainder rounding of `total` into integers proportional to `weights`. Deterministic. */
export function splitProportional(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k].i]++;
  return out;
}

export interface AllocationRow {
  subArea: string;
  stores: number;
  childIndex: number;
  /** Share of expected need (0–1): stores × child index, normalized. */
  needShare: number;
  cases: number;
  units: number;
}

export interface AllocationTable {
  id: string;
  title: string;
  rows: AllocationRow[];
  totalCases: number;
  totalUnits: number;
  note: string;
}

export const ALLOCATION_NOTE =
  "Sub-areas, store counts and child-share indices are simulated. Expected need = stores × child-share index; cases split by largest remainder.";

/** Allocation table for a store move: five sub-areas proportional to childShare-weighted need. */
export function allocationTable(proposal: Proposal, cases: number, cfg: Pick<Config, "unitsPerCase">): AllocationTable {
  const region = REGION_BY_ID[proposal.regionId];
  const defs = SUB_AREAS[proposal.regionId];
  const stores = splitProportional(region.stores, defs.map((d) => d.storeShare));
  const need = defs.map((d, i) => stores[i] * d.childIndex);
  const needSum = need.reduce((s, x) => s + x, 0);
  const split = splitProportional(cases, need);
  const id = allocationTableId(proposal.regionId, proposal.asOf);
  return {
    id,
    title: `Allocation table ${id}: split by expected need`,
    rows: defs.map((d, i) => ({
      subArea: d.name,
      stores: stores[i],
      childIndex: d.childIndex,
      needShare: needSum > 0 ? need[i] / needSum : 0,
      cases: split[i],
      units: split[i] * cfg.unitsPerCase,
    })),
    totalCases: cases,
    totalUnits: cases * cfg.unitsPerCase,
    note: ALLOCATION_NOTE,
  };
}

export interface StockTransportOrder {
  number: string;
  documentType: "UB";
  documentTypeLabel: string;
  status: "Created";
  supplyingPlant: string;
  receivingPlant: string;
  materialGroup: string;
  cases: number;
  units: number;
  quantityLabel: string;
  requestedDeliveryDate: string;
  createdBy: string;
  regionId: RegionId;
  proposalId: string;
}

export function stockTransportOrder(proposal: Proposal, cases: number, number: string, cfg: Pick<Config, "unitsPerCase">): StockTransportOrder {
  const region = REGION_BY_ID[proposal.regionId];
  const units = cases * cfg.unitsPerCase;
  return {
    number,
    documentType: "UB",
    documentTypeLabel: "Stock transport order",
    status: "Created",
    supplyingPlant: proposal.sourceName,
    receivingPlant: proposal.kind === "store_move" ? STORE_MOVE_RECEIVING : region.dcName,
    materialGroup: MATERIAL_GROUP,
    cases,
    units,
    quantityLabel: `${formatInt(cases)} CS (${formatInt(units)} EA)`,
    requestedDeliveryDate: proposal.arrivalDate,
    createdBy: CREATED_BY,
    regionId: proposal.regionId,
    proposalId: proposal.id,
  };
}

export interface SapPayload {
  simulated: true;
  note: string;
  stockTransportOrder: Record<string, unknown>;
  allocationTable: Record<string, unknown> | null;
  storeTasks: { task: string; minutes: number }[];
}

/** The JSON that would be posted (shown in "View payload"). */
export function sapPayload(sto: StockTransportOrder, alloc: AllocationTable | null, tasks: readonly StoreTask[]): SapPayload {
  return {
    simulated: true,
    note: SAP_BANNER,
    stockTransportOrder: {
      PurchaseOrder: sto.number,
      PurchaseOrderType: sto.documentType,
      Status: sto.status,
      SupplyingPlant: sto.supplyingPlant,
      ReceivingPlant: sto.receivingPlant,
      MaterialGroup: sto.materialGroup,
      OrderQuantity: sto.cases,
      OrderQuantityUnit: "CS",
      BaseUnitQuantity: sto.units,
      BaseUnit: "EA",
      RequestedDeliveryDate: sto.requestedDeliveryDate,
      CreatedBy: sto.createdBy,
      RhumeProposalId: sto.proposalId,
    },
    allocationTable: alloc
      ? {
          AllocationTable: alloc.id,
          Basis: "Expected need (stores × child-share index), simulated sub-areas",
          Items: alloc.rows.map((r) => ({ SubArea: r.subArea, Stores: r.stores, Cases: r.cases, Units: r.units })),
        }
      : null,
    storeTasks: tasks.map((t) => ({ task: t.label, minutes: t.minutes })),
  };
}

/** Store-task preview for a store move (empty for DC pre-positions). */
export function storeTaskPreview(proposal: Proposal, cases: number, cfg: Pick<Config, "storeTaskCapMinutes">): StoreTask[] {
  return proposal.kind === "store_move" && cases > 0 ? storeTasksFor(cases, cfg.storeTaskCapMinutes) : [];
}
