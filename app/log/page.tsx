"use client";

import { Badge } from "@/components/Badge";
import ProvenanceLabel from "@/components/ProvenanceLabel";
import { REGION_TILE_LABEL } from "@/lib/data/regions";
import type { Decision, Proposal } from "@/lib/engine/types";
import { formatDate, formatInt } from "@/lib/format";
import { decisionCases, findProposal, isAutoDecision, useRhume, APPROVE_ALL_REASON, type RhumeData } from "@/lib/store";

const th = "px-3 py-2 text-left text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-muted uppercase";
const td = "px-3 py-1.5 text-xs text-ink align-top";

const ACTION_LABEL: Record<Decision["action"], string> = {
  approve: "Approve",
  edit_approve: "Edit + approve",
  reject: "Reject",
};

/** "2023-11-13:ON:store_move" → "2023-11-13". */
function replayDateOf(proposalId: string): string {
  return proposalId.split(":")[0] ?? "";
}

/** Local timestamp, ISO-like and stable: "2026-10-19 18:40:12". */
function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function quantity(s: RhumeData, d: Decision): { cases: number | null; proposal: Proposal | undefined } {
  const p = findProposal(s, d.proposalId);
  if (d.action === "reject") return { cases: 0, proposal: p };
  if (d.action === "edit_approve") return { cases: d.cases ?? 0, proposal: p };
  return { cases: p ? decisionCases(p, d) : null, proposal: p };
}

function exportJson(s: RhumeData) {
  const data = {
    exportedAt: new Date().toISOString(),
    note: "Rhume prototype decision log. Simulated, no SAP connection. Stock, demand and sales are simulated.",
    season: { id: s.season.id, label: s.season.label, mode: s.season.mode, sourceNote: s.season.sourceNote },
    decisions: Object.values(s.decisions)
      .sort((a, b) => (a.decidedAt < b.decidedAt ? -1 : a.decidedAt > b.decidedAt ? 1 : 0))
      .map((d) => ({ ...d, replayDate: replayDateOf(d.proposalId), quantityCases: quantity(s, d).cases, sapOrder: s.sapOrders[d.proposalId] ?? null })),
    storeTaskDeclines: s.storeTaskDeclines,
    stageOverrides: Object.values(s.stageOverrides),
    config: s.cfg,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rhume-decision-log-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Decision log (F15, PRD §7.5): every decision plus store-task declines, with a JSON export. */
export default function LogPage() {
  const state = useRhume((s) => s);
  const decisions = Object.values(state.decisions).sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : a.decidedAt > b.decidedAt ? -1 : 0));
  const declines = [...state.storeTaskDeclines].sort((a, b) => (a.declinedAt < b.declinedAt ? 1 : -1));
  const overrides = Object.values(state.stageOverrides).sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1));

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-label">Log</p>
          <h1 className="text-[22px] leading-7 font-semibold text-ink">Decision log</h1>
          <p className="text-sm text-muted">
            Every approve, edit and reject, with the evidence hash of the brief it was based on. Newest first.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => exportJson(useRhume.getState())}>
          Export JSON
        </button>
      </div>

      <section className="card" aria-labelledby="log-decisions">
        <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
          <h2 id="log-decisions" className="section-label">
            Decisions <span className="tabular">({decisions.length})</span>
          </h2>
          <span className="text-[11px] text-muted">Replay date = the card&apos;s Monday</span>
        </div>
        {decisions.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">No decisions yet. Approve, edit or reject a card in the Workspace.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="border-b border-line">
                <tr>
                  <th className={th}>Timestamp</th>
                  <th className={th}>Replay date</th>
                  <th className={th}>Card id</th>
                  <th className={th}>Action</th>
                  <th className={`${th} text-right`}>Quantity</th>
                  <th className={th}>Reason</th>
                  <th className={th}>Brief source</th>
                  <th className={th}>Evidence hash</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {decisions.map((d) => {
                  const q = quantity(state, d);
                  const who = isAutoDecision(d) ? "Auto" : d.reason === APPROVE_ALL_REASON ? "Weekly plan" : null;
                  return (
                    <tr key={d.proposalId} className="border-b border-line last:border-b-0">
                      <td className={`${td} whitespace-nowrap`}>{stamp(d.decidedAt)}</td>
                      <td className={`${td} whitespace-nowrap`}>{formatDate(replayDateOf(d.proposalId))}</td>
                      <td className={`${td} font-mono text-[11px]`}>
                        {d.proposalId}
                        {q.proposal && <span className="block font-sans text-[11px] text-muted">{REGION_TILE_LABEL[q.proposal.regionId]}</span>}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        {ACTION_LABEL[d.action]}
                        {who && <span className="ml-1 text-muted">({who})</span>}
                      </td>
                      <td className={`${td} text-right whitespace-nowrap`}>{q.cases === null ? "—" : `${formatInt(q.cases)} cases`}</td>
                      <td className={`${td} max-w-[320px]`}>{d.reason ?? "—"}</td>
                      <td className={td}>
                        <Badge tone={d.briefSource === "ai" ? "ink" : "neutral"}>{d.briefSource === "ai" ? "AI" : "Template"}</Badge>
                      </td>
                      <td className={`${td} font-mono text-[11px]`} title={d.evidenceHash}>
                        {d.evidenceHash.slice(0, 12)}…
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="log-declines">
        <div className="border-b border-line px-4 py-2.5">
          <h2 id="log-declines" className="section-label">
            Store-task declines <span className="tabular">({declines.length})</span>
          </h2>
        </div>
        {declines.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">No store task has been declined.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="border-b border-line">
                <tr>
                  <th className={th}>Timestamp</th>
                  <th className={th}>Replay date</th>
                  <th className={th}>Region</th>
                  <th className={th}>Card id</th>
                  <th className={th}>Task</th>
                  <th className={`${th} text-right`}>Minutes</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {declines.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-b-0">
                    <td className={`${td} whitespace-nowrap`}>{stamp(d.declinedAt)}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(d.replayDate)}</td>
                    <td className={td}>{REGION_TILE_LABEL[d.regionId]}</td>
                    <td className={`${td} font-mono text-[11px]`}>{d.proposalId}</td>
                    <td className={td}>{d.task}</td>
                    <td className={`${td} text-right`}>{d.minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {overrides.length > 0 && (
        <section className="card" aria-labelledby="log-overrides">
          <div className="border-b border-line px-4 py-2.5">
            <h2 id="log-overrides" className="section-label">
              Stage overrides <span className="tabular">({overrides.length})</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="border-b border-line">
                <tr>
                  <th className={th}>Timestamp</th>
                  <th className={th}>Replay date</th>
                  <th className={th}>Region</th>
                  <th className={th}>Engine stage</th>
                  <th className={th}>Planner stage</th>
                  <th className={th}>Reason</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {overrides.map((o) => (
                  <tr key={`${o.regionId}:${o.replayDate}`} className="border-b border-line last:border-b-0">
                    <td className={`${td} whitespace-nowrap`}>{stamp(o.decidedAt)}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(o.replayDate)}</td>
                    <td className={td}>{REGION_TILE_LABEL[o.regionId]}</td>
                    <td className={td}>{o.engineStage}</td>
                    <td className={td}>{o.stage}</td>
                    <td className={td}>{o.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-line pt-2 text-xs text-muted">
        <ProvenanceLabel source="sap" season={state.season} />
        <ProvenanceLabel source="stock" season={state.season} name="Stock, demand and sales" />
        <span>Decisions are stored in this browser only (localStorage).</span>
      </footer>
    </div>
  );
}
