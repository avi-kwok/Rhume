"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { renderBriefSegments } from "@/lib/ai/placeholders";
import type { BriefResponse } from "@/lib/ai/schema";
import { fetchBrief } from "@/lib/briefClient";
import { REGION_TILE_LABEL } from "@/lib/data/regions";
import { breakdownForCases, fullCases } from "@/lib/editEv";
import { evidencePackFor, type EvidencePack } from "@/lib/engine/evidence";
import { KIND_LABEL, ROUTINE_REASON } from "@/lib/engine/proposals";
import type { Proposal } from "@/lib/engine/types";
import { latestVisible } from "@/lib/engine/visible";
import { formatCad, formatDate, formatField, formatInt } from "@/lib/format";
import { findProposal, useRhume } from "@/lib/store";
import { ConfidencePip, StageBadge, Badge } from "./Badge";
import { Ev, packInfo, rawText, Segments, type EvidenceInfo } from "./Evidence";
import OptionsTable from "./OptionsTable";
import ProvenanceLabel from "./ProvenanceLabel";
import { decisionLabel } from "./SurgeCard";

const CONFIDENCE_TONE = { high: "ink", medium: "outline", low: "neutral" } as const;

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`brief-s${n}`} className="border-b border-line px-5 py-3 last:border-b-0">
      <h3 id={`brief-s${n}`} className="section-label mb-1.5">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-4 text-sm leading-5 text-ink marker:text-muted">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading brief" className="flex flex-col gap-4 px-5 py-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="skeleton h-3 w-28" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** Short hash with the full value on hover. */
function Hash({ hash }: { hash: string }) {
  return (
    <span title={hash} className="font-mono text-[11px] text-ink">
      {hash.slice(0, 10)}…
    </span>
  );
}

export function ProvenanceBadge({ brief }: { brief: BriefResponse }) {
  if (brief.source === "template") return <Badge tone="neutral">Template brief</Badge>;
  return <Badge tone="ink">AI brief · Critic: {brief.critic === "revised" ? "revised" : "pass"}</Badge>;
}

/** Edit (F10): slider from 0 to full cases, EV recomputed client-side with lib/engine/ev.ts. */
function EditPanel({ proposal, onCancel }: { proposal: Proposal; onCancel: () => void }) {
  const cfg = useRhume((s) => s.cfg);
  const requestApprove = useRhume((s) => s.requestApprove);
  const full = fullCases(proposal);
  const rec = proposal.options.find((o) => o.id === proposal.recommended)!;
  const [cases, setCases] = useState(rec.cases);
  const ref = useRef<HTMLDivElement>(null);
  const b = breakdownForCases(proposal, cases, cfg);

  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
    ref.current?.querySelector<HTMLInputElement>("input[type=range]")?.focus();
  }, []);

  const engine = (key: string, raw: number, display: string, source: string): EvidenceInfo => ({
    key,
    display,
    raw: Math.round(raw * 100) / 100,
    type: "engine",
    source,
    inPack: false,
  });

  return (
    <div ref={ref} className="mt-3 rounded-[4px] border border-ink p-3" aria-label="Edit quantity">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Edit quantity</p>
        <p className="text-[11px] text-muted">Expected value recomputed with the engine&apos;s formula</p>
      </div>
      <label className="mt-2 flex items-center gap-3 text-xs text-muted">
        <span className="shrink-0 tabular">0</span>
        <input
          type="range"
          min={0}
          max={full}
          step={1}
          value={cases}
          onChange={(e) => setCases(Number(e.target.value))}
          aria-label="Cases to move"
          aria-valuetext={`${formatInt(cases)} cases`}
          className="w-full"
        />
        <span className="shrink-0 tabular">{formatInt(full)}</span>
      </label>
      <dl className="mt-2 grid grid-cols-4 gap-2 text-xs">
        <div>
          <dt className="text-muted">Cases</dt>
          <dd className="text-sm text-ink">
            <Ev info={engine("edit.cases", cases, formatInt(cases), "Planner edit (slider)")} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Units</dt>
          <dd className="text-sm text-ink">
            <Ev info={engine("edit.units", cases * cfg.unitsPerCase, formatInt(cases * cfg.unitsPerCase), "Cases × units per case (Settings)")} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Cost</dt>
          <dd className="text-sm text-ink">
            <Ev info={engine("edit.transferCost", b.transferCost, formatCad(b.transferCost), "Engine: ev.ts transfer cost; cost per case is an assumption")} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Expected value</dt>
          <dd className="text-sm text-ink">
            <Ev info={engine("edit.ev", b.ev, formatCad(b.ev), "Engine: ev.ts expected value from stated assumptions")} />
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => requestApprove(proposal.id, { action: "edit_approve", cases })}>
          Approve {formatInt(cases)} cases
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancel edit
        </button>
      </div>
    </div>
  );
}

function Inspector({ info, onClose }: { info: EvidenceInfo; onClose: () => void }) {
  return (
    <div className="shrink-0 border-t border-line bg-panel px-5 py-2 text-xs leading-4" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0">
          <span className="section-label mr-2">{info.inPack ? "Evidence-pack field" : "Engine value, not in the pack"}</span>
          <span className="font-mono text-ink">{info.key}</span>
          <span className="text-muted"> = </span>
          <span className="font-mono break-all text-ink">{rawText(info.raw)}</span>
          <span className="text-muted">
            {" "}
            ({info.type}) · shown as <span className="text-ink">{info.display}</span>
          </span>
        </p>
        <button type="button" className="btn btn-ghost btn-sm -mt-0.5 shrink-0" onClick={onClose} aria-label="Close field inspector">
          ×
        </button>
      </div>
      <p className="text-muted">Source: {info.source}</p>
    </div>
  );
}

function BriefBody({ proposal, pack, brief, onInspect, editing, onCancelEdit }: {
  proposal: Proposal;
  pack: EvidencePack;
  brief: BriefResponse;
  onInspect: (info: EvidenceInfo) => void;
  editing: boolean;
  onCancelEdit: () => void;
}) {
  const season = useRhume((s) => s.season);
  const seg = renderBriefSegments(brief.brief, pack);
  const f = pack.fields;
  const P = (key: string) => <Ev info={packInfo(key, f[key], formatField(f[key]))} onInspect={onInspect} />;

  const ww = latestVisible(season.wastewater[proposal.regionId], proposal.asOf);
  const lab = latestVisible(season.labReported[proposal.regionId], proposal.asOf);
  const asOfInfo = (key: string, date: string | undefined, source: string): EvidenceInfo => ({
    key,
    display: date ? formatDate(date) : "n/a",
    raw: date ?? "n/a",
    type: "engine",
    source,
    inPack: false,
  });
  const who =
    proposal.kind === "store_move"
      ? "Health-category planner"
      : proposal.approvalReason === ROUTINE_REASON
        ? "Health-category planner (routine)"
        : "Health-category planner, above the routine threshold";

  return (
    <>
      <Section n={1} title="Recommendation">
        <p className="text-[15px] leading-6 font-medium text-ink">
          <Segments segments={seg.recommendation} onInspect={onInspect} />
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge tone={CONFIDENCE_TONE[proposal.confidence]}>Confidence: {proposal.confidence}</Badge>
          <StageBadge stage={proposal.stage} />
          <span className="text-xs text-muted">
            {P("signals_agree")} of {P("signals_total")} signals agree
          </span>
        </div>
      </Section>

      <Section n={2} title="Why now">
        <Bullets items={seg.why_now.map((s, i) => <Segments key={i} segments={s} onInspect={onInspect} />)} />
      </Section>

      <Section n={3} title="Options compared">
        <OptionsTable proposal={proposal} pack={pack} onInspect={onInspect} />
        <p className="mt-2 text-sm leading-5 text-ink">
          <Segments segments={seg.options_commentary} onInspect={onInspect} />
        </p>
        <p className="mt-1 text-[11px] text-muted">The engine chose the recommended option (highest expected value). The brief only explains it.</p>
        {editing && <EditPanel key={proposal.id} proposal={proposal} onCancel={onCancelEdit} />}
      </Section>

      <Section n={4} title="Evidence against">
        <Bullets items={seg.evidence_against.map((s, i) => <Segments key={i} segments={s} onInspect={onInspect} />)} />
      </Section>

      <Section n={5} title="What would change this decision">
        <p className="text-sm leading-5 text-ink">
          <Segments segments={seg.what_would_change} onInspect={onInspect} />
        </p>
      </Section>

      <Section n={6} title="Approval needed">
        <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1 text-sm leading-5">
          <dt className="text-muted">Who</dt>
          <dd className="text-ink">{who}</dd>
          <dt className="text-muted">Why</dt>
          <dd className="text-ink">{P("approval_reason")}</dd>
          <dt className="text-muted">Reversible</dt>
          <dd className="text-ink">{P("reversible")}</dd>
        </dl>
      </Section>

      <Section n={7} title="Sources">
        <ul className="flex flex-col gap-2 text-xs leading-4">
          <li>
            <p className="font-medium text-ink">
              Wastewater, {f.city.value as string} · as of{" "}
              <Ev info={asOfInfo("wastewater.latest_reading_date", ww?.date, f.wastewater_check.source)} onInspect={onInspect} />
            </p>
            <p className="text-muted">{P("wastewater_check")}</p>
            <p className="text-muted">Source: {f.wastewater_check.source}</p>
          </li>
          <li>
            <p className="font-medium text-ink">
              Reported lab positivity · as of{" "}
              <Ev info={asOfInfo("lab.latest_report_date", lab?.date, f.lab_check.source)} onInspect={onInspect} />
            </p>
            <p className="text-muted">{P("lab_check")}</p>
            <p className="text-muted">Source: {f.lab_check.source}</p>
          </li>
          <li>
            <p className="font-medium text-ink">Neighbour timing · as of {P("as_of_date")}</p>
            <p className="text-muted">{P("neighbour_check")}</p>
            <p className="text-muted">Source: {f.neighbour_check.source}</p>
          </li>
          <li>
            <p className="font-medium text-ink">Store and DC stock · as of {P("as_of_date")}</p>
            <p className="text-muted">
              Cover {P("cover_days")} against a target of {P("target_cover_days")}.
            </p>
            <p className="text-muted">Source: {f.cover_days.source}</p>
          </li>
          <li>
            <p className="font-medium text-ink">Costs, probability and lead times</p>
            <p className="text-muted">
              Surge probability {P("probability_pct")} · lead time {P("lead_days")} · arrival {P("arrival_date")}
            </p>
            <p className="text-muted">Source: assumptions shown in Settings</p>
          </li>
        </ul>
        <p className="mt-2 text-[11px] text-muted">Click any number to see its evidence-pack field and value.</p>
        <div className="mt-2 flex flex-col gap-0.5 border-t border-line pt-2 text-[11px] leading-4 text-muted">
          <ProvenanceLabel source="wastewater" season={season} />
          <ProvenanceLabel source="lab" season={season} />
          <ProvenanceLabel source="stock" season={season} name="Stock, demand and costs" />
        </div>
      </Section>
    </>
  );
}

/** Right-side, full-height decision brief drawer (PRD §7.2). The only element with a shadow. */
export default function BriefDrawer() {
  const openId = useRhume((s) => s.openProposalId);
  const proposal = useRhume((s) => findProposal(s, s.openProposalId));
  const season = useRhume((s) => s.season);
  const cfg = useRhume((s) => s.cfg);
  const briefs = useRhume((s) => s.briefs);
  const decision = useRhume((s) => (s.openProposalId ? s.decisions[s.openProposalId] : undefined));
  const mode = useRhume((s) => s.briefMode);
  const setBriefMode = useRhume((s) => s.setBriefMode);
  const closeBrief = useRhume((s) => s.closeBrief);
  const requestApprove = useRhume((s) => s.requestApprove);
  const requestReject = useRhume((s) => s.requestReject);
  const setBrief = useRhume((s) => s.setBrief);
  const [inspected, setInspected] = useState<{ id: string; info: EvidenceInfo } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const pack = proposal ? evidencePackFor(proposal, { season, cfg }) : null;
  const brief = pack ? briefs[pack.hash] : undefined;
  const hash = pack?.hash;

  useEffect(() => {
    if (!pack || !hash || useRhume.getState().briefs[hash]) return;
    let live = true;
    fetchBrief(pack).then((res) => {
      if (live) setBrief(hash, res);
    });
    return () => {
      live = false;
    };
    // The pack is a pure function of its hash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, setBrief]);

  useEffect(() => {
    if (openId) closeRef.current?.focus({ preventScroll: true });
  }, [openId]);

  if (!openId) return null;

  const info = inspected && inspected.id === openId ? inspected.info : null;
  const onInspect = (i: EvidenceInfo) => setInspected({ id: openId, info: i });
  const editing = mode === "edit" && !decision;

  return (
    <div className="fixed inset-0 z-40">
      <div aria-hidden className="absolute inset-0 bg-ink/15" onClick={closeBrief} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="brief-title"
        className="drawer-shadow absolute top-0 right-0 flex h-full w-full max-w-[560px] flex-col border-l border-line bg-bg"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <p className="section-label">Decision brief</p>
            <h2 id="brief-title" className="text-xl leading-7 font-semibold text-ink">
              {proposal ? `${REGION_TILE_LABEL[proposal.regionId]} · ${KIND_LABEL[proposal.kind]}` : "Card not found"}
            </h2>
            {proposal && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="tabular">Card of {formatDate(proposal.asOf)}</span>
                <ConfidencePip confidence={proposal.confidence} />
                {decision && <Badge tone="outline">{decisionLabel(decision, proposal)}</Badge>}
              </p>
            )}
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-sm" onClick={closeBrief} aria-label="Close brief (Esc)">
            Close ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!proposal || !pack ? (
            <p className="px-5 py-4 text-sm text-muted">This card is no longer in the replay. Decisions earlier in the season changed the stock picture.</p>
          ) : brief ? (
            <BriefBody
              proposal={proposal}
              pack={pack}
              brief={brief}
              onInspect={onInspect}
              editing={editing}
              onCancelEdit={() => setBriefMode("read")}
            />
          ) : (
            <Skeleton />
          )}
        </div>

        {info && <Inspector info={info} onClose={() => setInspected(null)} />}

        <footer className="shrink-0 border-t border-line">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-1.5 text-[11px] text-muted">
            {brief ? (
              <>
                <ProvenanceBadge brief={brief} />
                <span>
                  Model: <span className="text-ink">{brief.model}</span>
                </span>
                <span>
                  Evidence hash: <Hash hash={brief.hash} />
                </span>
              </>
            ) : (
              <span>Loading brief…</span>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-line px-5 py-2">
            {proposal && !decision ? (
              <>
                <button type="button" className="btn btn-primary" onClick={() => requestApprove(proposal.id)}>
                  Approve
                </button>
                <button type="button" className="btn btn-secondary" aria-pressed={editing} onClick={() => setBriefMode(editing ? "read" : "edit")}>
                  Edit
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => requestReject(proposal.id)}>
                  Reject
                </button>
                <span className="ml-auto text-[11px] text-muted">A approve · R reject · Esc close</span>
              </>
            ) : (
              <span className="text-xs text-muted">{decision && proposal ? `Decided: ${decisionLabel(decision, proposal)}` : ""}</span>
            )}
          </div>
        </footer>
      </aside>
    </div>
  );
}
