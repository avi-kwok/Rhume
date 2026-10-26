"use client";

import { useEffect, useRef, useState } from "react";
import { REGION_TILE_LABEL } from "@/lib/data/regions";
import { KIND_LABEL } from "@/lib/engine/proposals";
import type { Proposal } from "@/lib/engine/types";
import { formatDate, formatInt, formatPct } from "@/lib/format";
import {
  allocationTable,
  sapPayload,
  SAP_BANNER,
  stockTransportOrder,
  storeTaskPreview,
} from "@/lib/sap";
import { STORE_TASK_FOOTER, totalMinutes } from "@/lib/storeTasks";
import { findProposal, useRhume, type ApprovalDraft } from "@/lib/store";
import ProvenanceLabel from "./ProvenanceLabel";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="text-sm leading-5 text-ink">{children}</dd>
    </div>
  );
}

function Banner() {
  return (
    <p role="note" className="shrink-0 border-b border-accent/40 bg-stage-watch px-5 py-2 text-xs font-medium text-accent">
      {SAP_BANNER}
    </p>
  );
}

const SECTIONS = [
  { id: "sap-general", label: "General information" },
  { id: "sap-allocation", label: "Allocation table" },
  { id: "sap-tasks", label: "Store tasks" },
] as const;

function OrderPage({ proposal, draft }: { proposal: Proposal; draft: ApprovalDraft }) {
  const cfg = useRhume((s) => s.cfg);
  const season = useRhume((s) => s.season);
  const confirm = useRhume((s) => s.confirmApprove);
  const cancel = useRhume((s) => s.cancelApprove);
  const [view, setView] = useState<"document" | "payload">("document");
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  const cases = draft.cases;
  const region = REGION_TILE_LABEL[proposal.regionId];
  const regionShort = proposal.regionId === "QC" ? "Québec" : region;
  const holdNote = cases <= 0;

  if (holdNote) {
    return (
      <>
        <Banner />
        <div className="border-b border-line bg-panel px-5 py-4">
          <p className="section-label">Decision</p>
          <h2 id="sap-title" className="text-xl leading-7 font-semibold text-ink">
            Hold: no stock transport order
          </h2>
          <p className="text-xs text-muted">
            {region} · {KIND_LABEL[proposal.kind]} · card of {formatDate(proposal.asOf)}
          </p>
        </div>
        <div className="px-5 py-4 text-sm leading-6 text-ink">
          <p>
            The approved option moves 0 cases ({draft.action === "edit_approve" ? "edited to zero" : "the engine recommends doing nothing"}), so Rhume
            creates no order and no allocation table. Confirming records the decision in the log only.
          </p>
        </div>
        <Footer onCancel={cancel} onConfirm={confirm} confirmRef={confirmRef} label="Record decision" season={season} />
      </>
    );
  }

  const sto = stockTransportOrder(proposal, cases, draft.stoNumber, cfg);
  const alloc = proposal.kind === "store_move" ? allocationTable(proposal, cases, cfg) : null;
  const tasks = storeTaskPreview(proposal, cases, cfg);
  const payload = sapPayload(sto, alloc, tasks);
  const atId = alloc?.id ?? `AT-${proposal.regionId}`;

  return (
    <>
      <Banner />
      {/* Object page header */}
      <div className="shrink-0 border-b border-line bg-panel px-5 pt-3 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="section-label">Stock transport order · simulated S/4HANA object page</p>
            <h2 id="sap-title" className="flex flex-wrap items-center gap-2 text-xl leading-7 font-semibold text-ink">
              Stock Transport Order {sto.number}
              <span className="rounded-full border border-ink bg-bg px-2 py-0.5 text-xs font-medium text-ink">{sto.status}</span>
            </h2>
            <p className="text-xs text-muted">
              {region} · {KIND_LABEL[proposal.kind]} · card of {formatDate(proposal.asOf)} ·{" "}
              {draft.action === "edit_approve" ? "edited quantity" : "engine-recommended option"}
            </p>
          </div>
          <dl className="flex gap-6 text-right">
            <Field label="Quantity">
              <span className="font-semibold tabular">{sto.quantityLabel}</span>
            </Field>
            <Field label="Requested delivery">
              <span className="font-semibold tabular">{formatDate(sto.requestedDeliveryDate)}</span>
            </Field>
          </dl>
        </div>
        <div className="mt-2 flex items-end justify-between gap-2">
          {view === "document" ? (
            <nav aria-label="Sections" className="flex gap-4 text-xs">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="border-b-2 border-transparent pb-1 text-muted hover:border-accent hover:text-ink"
                  onClick={() => document.getElementById(s.id)?.scrollIntoView({ block: "start", behavior: "smooth" })}
                >
                  {s.label}
                </button>
              ))}
            </nav>
          ) : (
            <span className="pb-1 text-xs text-muted">JSON that would be posted (simulated)</span>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm mb-1"
            aria-pressed={view === "payload"}
            onClick={() => setView(view === "payload" ? "document" : "payload")}
          >
            View payload
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "payload" ? (
          <pre className="m-0 bg-bg px-5 py-3 font-mono text-[11px] leading-4 whitespace-pre-wrap text-ink" aria-label="Payload JSON">
            {JSON.stringify(payload, null, 2)}
          </pre>
        ) : (
          <>
            <section id="sap-general" className="border-b border-line px-5 py-3">
              <h3 className="section-label mb-2">General information</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-3">
                <Field label="Document type">UB (stock transport order)</Field>
                <Field label="Supplying plant">{sto.supplyingPlant}</Field>
                <Field label="Receiving plant">{sto.receivingPlant}</Field>
                <Field label="Material group">{sto.materialGroup}</Field>
                <Field label="Quantity">
                  <span className="tabular">{sto.quantityLabel}</span>
                </Field>
                <Field label="Requested delivery date">
                  <span className="tabular">{formatDate(sto.requestedDeliveryDate)}</span>
                </Field>
                <Field label="Created by">{sto.createdBy}</Field>
                <Field label="Status">{sto.status}</Field>
              </dl>
            </section>

            <section id="sap-allocation" className="border-b border-line px-5 py-3">
              <h3 className="section-label mb-1">Allocation table</h3>
              {alloc ? (
                <>
                  <p className="mb-2 text-sm font-medium text-ink">{alloc.title}</p>
                  <table className="w-full border-collapse text-sm">
                    <thead className="border-b border-line text-[11px] tracking-[0.08em] text-muted uppercase">
                      <tr>
                        <th className="px-2 py-1 text-left font-semibold">Sub-area ({regionShort})</th>
                        <th className="px-2 py-1 text-right font-semibold">Stores</th>
                        <th className="px-2 py-1 text-right font-semibold">Child-share index</th>
                        <th className="px-2 py-1 text-right font-semibold">Share of need</th>
                        <th className="px-2 py-1 text-right font-semibold">Cases</th>
                        <th className="px-2 py-1 text-right font-semibold">Units</th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {alloc.rows.map((r) => (
                        <tr key={r.subArea} className="border-b border-line">
                          <td className="px-2 py-1">{r.subArea}</td>
                          <td className="px-2 py-1 text-right">{formatInt(r.stores)}</td>
                          <td className="px-2 py-1 text-right">{r.childIndex.toFixed(2)}</td>
                          <td className="px-2 py-1 text-right">{formatPct(r.needShare * 100)}</td>
                          <td className="px-2 py-1 text-right">{formatInt(r.cases)}</td>
                          <td className="px-2 py-1 text-right">{formatInt(r.units)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="px-2 py-1">Total</td>
                        <td className="px-2 py-1 text-right">{formatInt(alloc.rows.reduce((s, r) => s + r.stores, 0))}</td>
                        <td className="px-2 py-1" />
                        <td className="px-2 py-1 text-right">100%</td>
                        <td className="px-2 py-1 text-right">{formatInt(alloc.totalCases)}</td>
                        <td className="px-2 py-1 text-right">{formatInt(alloc.totalUnits)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-1 text-[11px] text-muted">Simulated: {alloc.note}</p>
                </>
              ) : (
                <>
                  <p className="mb-2 text-sm font-medium text-ink">
                    {`Allocation table ${atId}: held at ${sto.receivingPlant} until a store move`}
                  </p>
                  <p className="text-xs text-muted">
                    A DC pre-position lands at the region&apos;s DC. One aggregate line: {sto.quantityLabel} to {sto.receivingPlant}. The store split is made when a
                    store move is approved.
                  </p>
                </>
              )}
            </section>

            <section id="sap-tasks" className="px-5 py-3">
              <h3 className="section-label mb-1">Store tasks preview</h3>
              {tasks.length > 0 ? (
                <>
                  <p className="mb-1.5 text-xs text-muted">
                    Appears in each store&apos;s Store view on {formatDate(proposal.arrivalDate)}. Total {totalMinutes(tasks)} of {cfg.storeTaskCapMinutes} minutes.
                  </p>
                  <ul className="flex flex-col gap-1 text-sm text-ink">
                    {tasks.map((t) => (
                      <li key={t.id} className="flex justify-between gap-3 border-b border-line pb-1 last:border-b-0">
                        <span>{t.label}</span>
                        <span className="shrink-0 text-muted tabular">{t.minutes} min</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-muted">{STORE_TASK_FOOTER}</p>
                </>
              ) : (
                <p className="text-xs text-muted">No store tasks: stock stays at the DC.</p>
              )}
            </section>
          </>
        )}
      </div>
      <Footer onCancel={cancel} onConfirm={confirm} confirmRef={confirmRef} label="Confirm" season={season} />
    </>
  );
}

function Footer({
  onCancel,
  onConfirm,
  confirmRef,
  label,
  season,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmRef: React.RefObject<HTMLButtonElement | null>;
  label: string;
  season: ReturnType<typeof useRhume.getState>["season"];
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-panel px-5 py-2.5">
      <span className="text-[11px] text-muted">
        <ProvenanceLabel source="sap" season={season} /> · A or Enter confirms · Esc cancels
      </span>
      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button ref={confirmRef} type="button" className="btn btn-primary" onClick={onConfirm}>
          {label}
        </button>
      </div>
    </div>
  );
}

/** Approve → simulated SAP stock transport order (DESIGN.md §11, PRD §7.3). */
export default function SapOrderModal() {
  const draft = useRhume((s) => s.approval);
  const proposal = useRhume((s) => findProposal(s, s.approval?.proposalId ?? null));
  const cancel = useRhume((s) => s.cancelApprove);
  if (!draft || !proposal) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden className="absolute inset-0 bg-ink/30" onClick={cancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sap-title"
        className="card relative flex max-h-full w-full max-w-[900px] flex-col overflow-hidden"
      >
        <OrderPage key={`${draft.proposalId}:${draft.cases}`} proposal={proposal} draft={draft} />
      </div>
    </div>
  );
}
