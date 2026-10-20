import { describe, expect, it } from "vitest";
import { loadSeason } from "../lib/data/loadSeason";
import { REGION_BY_ID } from "../lib/data/regions";
import { defaultConfig } from "../lib/engine/config";
import { simulate } from "../lib/engine/simulate";
import { fullCases, optionForCases } from "../lib/editEv";
import { buildDecision } from "../lib/replay";
import { allocationTable, isoWeekLabel, sapPayload, splitProportional, stockTransportOrder, stoNumber } from "../lib/sap";
import { latestStoreArrival, storeTasksFor, totalMinutes } from "../lib/storeTasks";

const season = loadSeason("2023-24");
const cfg = defaultConfig();
const rh0 = simulate(season, cfg, "rhume", {});
const atlMove = rh0.proposals.find((p) => p.regionId === "ATL" && p.kind === "store_move")!;

describe("edit (F10): EV recomputed client-side with lib/engine/ev.ts", () => {
  it("matches the engine's options at none, half and full", () => {
    for (const p of rh0.proposals) {
      for (const o of p.options) {
        const e = optionForCases(p, o.cases, cfg);
        expect(e.cases).toBe(o.cases);
        expect(e.transferCostCad).toBeCloseTo(o.transferCostCad, 6);
        expect(e.expectedValueCad).toBeCloseTo(o.expectedValueCad, 4);
      }
    }
  });

  it("clamps to 0 … full", () => {
    expect(optionForCases(atlMove, -5, cfg).cases).toBe(0);
    expect(optionForCases(atlMove, 1e6, cfg).cases).toBe(fullCases(atlMove));
  });

  it("simulate() honours decision.cases for edit_approve", () => {
    const cases = Math.max(1, Math.min(100, fullCases(atlMove) - 1));
    const d = buildDecision(atlMove, { season, cfg }, { action: "edit_approve", cases });
    const rh = simulate(season, cfg, "rhume", { [atlMove.id]: d });
    const ex = rh.executed.find((e) => e.proposalId === atlMove.id)!;
    expect(ex.cases).toBe(cases);
    // Zero cases executes nothing.
    const none = simulate(season, cfg, "rhume", { [atlMove.id]: buildDecision(atlMove, { season, cfg }, { action: "edit_approve", cases: 0 }) });
    expect(none.executed.find((e) => e.proposalId === atlMove.id)).toBeUndefined();
  });
});

describe("store tasks (F12)", () => {
  it("three tasks of 8, 7 and 5 minutes fit the default 20-minute cap", () => {
    const t = storeTasksFor(831, 20);
    expect(t.map((x) => x.minutes)).toEqual([8, 7, 5]);
    expect(t[0].label).toBe("Receive 831 cases of children's fever and cold medicine");
    expect(totalMinutes(t)).toBe(20);
  });

  it("a smaller cap shortens and drops tasks; the total never exceeds the cap", () => {
    expect(storeTasksFor(10, 18).map((x) => x.minutes)).toEqual([8, 7, 3]);
    expect(storeTasksFor(10, 12).map((x) => x.minutes)).toEqual([8, 4]);
    for (let cap = 0; cap <= 40; cap++) expect(totalMinutes(storeTasksFor(10, cap))).toBeLessThanOrEqual(cap);
  });

  it("latest arrival is never in the future", () => {
    const rh = simulate(season, cfg, "rhume", "auto");
    const arrival = rh.executed.find((e) => e.proposalId === atlMove.id)!.arrivalDate;
    expect(latestStoreArrival(rh, "ATL", "2024-01-08")).toBeNull();
    const a = latestStoreArrival(rh, "ATL", arrival)!;
    expect(a.arrivalDate).toBe(arrival);
    expect(a.proposal.id).toBe(atlMove.id);
    const later = latestStoreArrival(rh, "ATL", "2024-03-25")!;
    expect(later.arrivalDate <= "2024-03-25").toBe(true);
  });
});

describe("simulated SAP documents", () => {
  it("numbers, week labels and the STO fields", () => {
    expect(stoNumber(1)).toBe("4500000001");
    expect(isoWeekLabel("2024-01-08")).toBe("2024W02");
    expect(isoWeekLabel("2023-01-01")).toBe("2022W52");
    const sto = stockTransportOrder(atlMove, 1840, stoNumber(12345), cfg);
    expect(sto.quantityLabel).toBe("1,840 CS (44,160 EA)");
    expect(sto.documentType).toBe("UB");
    expect(sto.receivingPlant).toBe("Region stores via allocation table");
    expect(sto.requestedDeliveryDate).toBe(atlMove.arrivalDate);
  });

  it("allocation splits cases and stores exactly across five sub-areas, deterministically", () => {
    const a = allocationTable(atlMove, 831, cfg);
    expect(a.id).toBe("AT-ATL-2024W02");
    expect(a.rows).toHaveLength(5);
    expect(a.rows.reduce((s, r) => s + r.cases, 0)).toBe(831);
    expect(a.rows.reduce((s, r) => s + r.stores, 0)).toBe(REGION_BY_ID.ATL.stores);
    expect(allocationTable(atlMove, 831, cfg)).toEqual(a);
    expect(splitProportional(7, [1, 1, 1])).toEqual([3, 2, 2]);
    const payload = sapPayload(stockTransportOrder(atlMove, 831, stoNumber(1), cfg), a, storeTasksFor(831, 20));
    expect(payload.simulated).toBe(true);
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });
});
