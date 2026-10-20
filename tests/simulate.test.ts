import { describe, expect, it } from "vitest";
import { loadReconstructedSeason, loadSeason } from "../lib/data/loadSeason";
import { DEFAULT_CONFIG } from "../lib/engine/config";
import { computeOutcomes } from "../lib/engine/outcomes";
import { simulate, simulateDetailed } from "../lib/engine/simulate";
import type { Decision } from "../lib/engine/types";

const season = loadReconstructedSeason();
const cfg = DEFAULT_CONFIG;

function expectConserved(ledger: ReturnType<typeof simulateDetailed>["ledger"]) {
  const lhs = ledger.initialUnits + ledger.suppliedUnits;
  const rhs = ledger.salesUnits + ledger.finalUnits;
  expect(Math.abs(lhs - rhs)).toBeLessThan(1e-6 * lhs);
}

describe("simulate", () => {
  it("conserves stock for both policies: supplied + initial = sales + final on-hand", () => {
    expectConserved(simulateDetailed(season, cfg, "status_quo", "auto").ledger);
    expectConserved(simulateDetailed(season, cfg, "rhume", "auto").ledger);
    expectConserved(simulateDetailed(season, { ...cfg, supplyCapped: true }, "rhume", "auto").ledger);
    expectConserved(simulateDetailed(loadSeason("2024-25"), cfg, "rhume", "auto").ledger);
  });

  it("conserves stock with interactive decisions (approve, edit, reject)", () => {
    const auto = simulate(season, cfg, "rhume", "auto");
    const decisions: Record<string, Decision> = {};
    auto.proposals.forEach((p, i) => {
      const action = (["approve", "edit_approve", "reject"] as const)[i % 3];
      decisions[p.id] = { proposalId: p.id, action, cases: action === "edit_approve" ? 10 : undefined, decidedAt: p.asOf, briefSource: "template", evidenceHash: "x" };
    });
    const { result, ledger } = simulateDetailed(season, cfg, "rhume", decisions);
    expectConserved(ledger);
    expect(result.proposals.length).toBeGreaterThan(0);
  });

  it("status quo has at least as many stockout region-days as Rhume with auto-approve", () => {
    const sq = computeOutcomes(simulate(season, cfg, "status_quo", "auto"), cfg);
    const rh = computeOutcomes(simulate(season, cfg, "rhume", "auto"), cfg);
    expect(sq.stockoutRegionDays).toBeGreaterThanOrEqual(rh.stockoutRegionDays);
  });

  it("gives identical output when re-run with the same inputs", () => {
    for (const policy of ["status_quo", "rhume"] as const) {
      const a = JSON.stringify(simulate(season, cfg, policy, "auto"));
      const b = JSON.stringify(simulate(season, { ...cfg }, policy, "auto"));
      expect(a).toBe(b);
    }
  });

  it("rejecting everything executes nothing and costs nothing", () => {
    const r = simulate(season, cfg, "rhume", {});
    expect(r.executed).toHaveLength(0);
    expect(r.transferCostCad).toBe(0);
    expect(r.proposals.length).toBeGreaterThan(0);
  });
});
