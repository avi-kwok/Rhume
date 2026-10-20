"use client";

import { useEffect, useState } from "react";
import { renderSegments } from "@/lib/ai/placeholders";
import { buildRollup, buildSummaryPack } from "@/lib/ai/summaryPack";
import { fetchSummary } from "@/lib/briefClient";
import { proposalsOn } from "@/lib/engine/proposals";
import { formatCad, formatField, formatInt } from "@/lib/format";
import { selectAsOf, selectOpenCards, useRhume } from "@/lib/store";
import { Badge } from "./Badge";
import { Ev, packInfo, Segments } from "./Evidence";

/**
 * Weekly executive summary (F11, DESIGN.md §9.8): one line above the map, expandable. The roll-up
 * is this week's cards; the paragraph comes from /api/exec-summary (AI or template, cached by hash).
 * "Approve all recommended" approves every open card this week after a single confirmation.
 */
export default function ExecSummaryBanner() {
  const asOf = useRhume(selectAsOf);
  const proposals = useRhume((s) => s.results.rh.proposals);
  const cfg = useRhume((s) => s.cfg);
  const summaries = useRhume((s) => s.summaries);
  const setSummary = useRhume((s) => s.setSummary);
  const open = useRhume(selectOpenCards);
  const approveAll = useRhume((s) => s.approveAllRecommended);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [done, setDone] = useState<{ week: string; n: number } | null>(null);

  const rollup = buildRollup(proposalsOn(proposals, asOf), asOf, cfg);
  const pack = buildSummaryPack(rollup);
  const res = summaries[pack.hash];
  const hash = pack.hash;

  useEffect(() => {
    if (useRhume.getState().summaries[hash]) return;
    let live = true;
    // Debounced so scrubbing or autoplay does not fire a request for every week passed.
    const id = window.setTimeout(() => {
      fetchSummary(rollup).then((r) => {
        if (live) setSummary(hash, r);
      });
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
    // The roll-up is a pure function of its hash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, setSummary]);

  const segments = res ? renderSegments(res.summary.paragraph, pack) : null;
  const f = pack.fields;
  const T = (key: string) => <Ev info={packInfo(key, f[key], formatField(f[key]))} />;
  const isConfirming = confirming === asOf;
  const doneNow = done && done.week === asOf ? done.n : null;

  return (
    <section aria-label="Executive summary for this week" className="shrink-0 border-b border-line bg-panel/60 px-4 lg:px-6">
      <div className="flex h-10 items-center gap-3">
        <span className="section-label shrink-0">This week</span>
        {res ? (
          <Badge tone={res.source === "template" ? "neutral" : "ink"} className="shrink-0">
            {res.source === "template" ? "Template" : "AI"}
          </Badge>
        ) : (
          <span className="skeleton h-4 w-14 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:underline"
          title={expanded ? "Collapse" : "Expand the summary"}
        >
          {res ? res.rendered : <span className="skeleton inline-block h-4 w-2/3 align-middle" />}
        </button>
        <dl className="hidden shrink-0 items-baseline gap-3 text-xs text-muted lg:flex">
          <div className="flex gap-1">
            <dt>Cards</dt>
            <dd className="font-semibold text-ink tabular">{formatInt(rollup.open_cards)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Cases</dt>
            <dd className="font-semibold text-ink tabular">{formatInt(rollup.total_cases)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Cost</dt>
            <dd className="font-semibold text-ink tabular">{formatCad(rollup.total_cost_cad)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>EV</dt>
            <dd className="font-semibold text-ink tabular">{formatCad(rollup.total_ev_cad)}</dd>
          </div>
        </dl>
        {isConfirming ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink">
            Approve {open.length} open card{open.length === 1 ? "" : "s"}?
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const n = approveAll();
                setConfirming(null);
                setDone({ week: asOf, n });
              }}
            >
              Confirm
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm shrink-0"
            disabled={open.length === 0}
            onClick={() => setConfirming(asOf)}
            title={open.length === 0 ? "No open cards this week" : "Approve the engine-recommended option on every open card this week"}
          >
            Approve all recommended
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm shrink-0"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse summary" : "Expand summary"}
        >
          {expanded ? "▴" : "▾"}
        </button>
      </div>
      {expanded && (
        <div className="pb-2.5 text-sm leading-5 text-ink">
          <p>{segments ? <Segments segments={segments} /> : <span className="skeleton inline-block h-4 w-full" />}</p>
          <p className="mt-1 text-xs text-muted">
            Totals over the recommended options: {T("open_cards")} cards · {T("total_cases")} cases · cost {T("total_cost_cad")} · expected value{" "}
            {T("total_ev_cad")} · DC reserve {T("reserve_share_pct")}.{" "}
            {res && (res.source === "template" ? "Template summary." : `AI summary · model ${res.model}.`)}
            {doneNow !== null && ` ${doneNow} card${doneNow === 1 ? "" : "s"} approved with the weekly plan.`}
          </p>
        </div>
      )}
    </section>
  );
}
