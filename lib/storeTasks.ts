// Store tasks on arrival (DESIGN.md §12, F12). Pure helpers for the Store view and the SAP modal preview.

import type { Proposal, RegionId, SimResult } from "./engine/types";
import { formatInt } from "./format";

export type StoreTaskId = "receive" | "endcap" | "backroom";

export interface StoreTask {
  id: StoreTaskId;
  label: string;
  /** Minutes after the shift cap is applied. */
  minutes: number;
  /** Minutes before the cap (8 / 7 / 5). */
  baseMinutes: number;
  /** True when the cap shortened this task. */
  trimmed: boolean;
}

export const STORE_TASK_FOOTER = "Capped to fit one shift. The owner can reorder or decline.";

/**
 * The three arrival tasks in order, with the total capped at `capMinutes`: tasks keep their
 * minutes while they fit, the task that crosses the cap is shortened to fit, later tasks are dropped.
 */
export function storeTasksFor(cases: number, capMinutes: number): StoreTask[] {
  const base: { id: StoreTaskId; label: string; minutes: number }[] = [
    { id: "receive", label: `Receive ${formatInt(cases)} cases of children's fever and cold medicine`, minutes: 8 },
    { id: "endcap", label: "Set the cold-and-flu endcap", minutes: 7 },
    { id: "backroom", label: "Move backroom stock to the shelf", minutes: 5 },
  ];
  let left = Math.max(0, Math.floor(capMinutes));
  const out: StoreTask[] = [];
  for (const t of base) {
    if (left <= 0) break;
    const minutes = Math.min(t.minutes, left);
    left -= minutes;
    out.push({ id: t.id, label: t.label, minutes, baseMinutes: t.minutes, trimmed: minutes < t.minutes });
  }
  return out;
}

export function totalMinutes(tasks: readonly StoreTask[]): number {
  return tasks.reduce((s, t) => s + t.minutes, 0);
}

export interface StoreArrival {
  proposal: Proposal;
  cases: number;
  arrivalDate: string;
}

/**
 * The most recent executed store move for a region that has arrived on or before asOf.
 * Never returns a future arrival.
 */
export function latestStoreArrival(rh: SimResult, regionId: RegionId, asOf: string): StoreArrival | null {
  const byId = new Map(rh.proposals.map((p) => [p.id, p]));
  let best: StoreArrival | null = null;
  for (const e of rh.executed) {
    const p = byId.get(e.proposalId);
    if (!p || p.regionId !== regionId || p.kind !== "store_move" || e.cases <= 0) continue;
    if (e.arrivalDate > asOf) continue;
    if (!best || e.arrivalDate > best.arrivalDate) best = { proposal: p, cases: e.cases, arrivalDate: e.arrivalDate };
  }
  return best;
}
