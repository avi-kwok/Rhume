"use client";

import { REGION_TILE_LABEL } from "@/lib/data/regions";
import { formatDate, formatInt } from "@/lib/format";
import { latestStoreArrival, STORE_TASK_FOOTER, storeTasksFor, totalMinutes } from "@/lib/storeTasks";
import { selectAsOf, useRhume } from "@/lib/store";
import ProvenanceLabel from "./ProvenanceLabel";

/**
 * Store view (F12, DESIGN.md §12): on or after the arrival date of an executed store move for the
 * selected region, the associate-owner's three tasks, capped to one shift, each declinable (logged).
 * Only the most recent arrival as of the replay date is shown, never a future one.
 */
export default function StoreTasks() {
  const regionId = useRhume((s) => s.selectedRegion);
  const rh = useRhume((s) => s.results.rh);
  const asOf = useRhume(selectAsOf);
  const cap = useRhume((s) => s.cfg.storeTaskCapMinutes);
  const season = useRhume((s) => s.season);
  const declines = useRhume((s) => s.storeTaskDeclines);
  const sapOrders = useRhume((s) => s.sapOrders);
  const decline = useRhume((s) => s.declineStoreTask);

  const arrival = latestStoreArrival(rh, regionId, asOf);
  const region = REGION_TILE_LABEL[regionId];

  if (!arrival) {
    return (
      <div role="tabpanel" className="flex flex-1 flex-col items-center justify-center gap-1 rounded-[4px] border border-dashed border-line p-6 text-center text-sm text-muted">
        <p>No approved store move has arrived in {region} as of {formatDate(asOf)}.</p>
        <p className="text-xs">Tasks appear here on the arrival date of an approved store move.</p>
      </div>
    );
  }

  const tasks = storeTasksFor(arrival.cases, cap);
  const sto = sapOrders[arrival.proposal.id];
  const isDeclined = (taskId: string) => declines.some((d) => d.id === `${arrival.proposal.id}:${taskId}`);
  const active = tasks.filter((t) => !isDeclined(t.id));

  return (
    <div role="tabpanel" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-ink">
          <span className="font-semibold">Associate-owner tasks, {region} stores</span> · arrived {formatDate(arrival.arrivalDate)} ·{" "}
          <span className="tabular">{formatInt(arrival.cases)} cases</span>
          {sto && <span className="text-muted"> · STO {sto}</span>}
        </p>
        <p className="text-xs text-muted tabular">
          {totalMinutes(active)} of {cap} minutes
        </p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {tasks.map((t, i) => {
          const declined = isDeclined(t.id);
          return (
            <li key={t.id} className={`card flex items-center gap-3 px-3 py-2 ${declined ? "bg-panel" : ""}`}>
              <span className="w-5 shrink-0 text-xs text-muted tabular">{i + 1}.</span>
              <span className={`min-w-0 flex-1 text-sm ${declined ? "text-muted line-through" : "text-ink"}`}>{t.label}</span>
              <span className="shrink-0 text-xs text-muted tabular">
                {t.minutes} min{t.trimmed ? ` (of ${t.baseMinutes}, capped)` : ""}
              </span>
              {declined ? (
                <span className="w-[76px] shrink-0 text-right text-xs font-medium text-muted">Declined</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm w-[76px] shrink-0"
                  onClick={() =>
                    decline({
                      proposalId: arrival.proposal.id,
                      regionId,
                      taskId: t.id,
                      task: t.label,
                      minutes: t.minutes,
                      replayDate: asOf,
                      arrivalDate: arrival.arrivalDate,
                    })
                  }
                >
                  Decline
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">{STORE_TASK_FOOTER}</p>
      <p className="text-[11px] text-muted">
        <ProvenanceLabel source="stock" season={season} name="Store tasks" />. Declines are written to the decision log.
      </p>
    </div>
  );
}
