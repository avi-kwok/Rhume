"use client";

import { useState } from "react";
import type { RegionState, Stage } from "@/lib/engine/types";
import { REGION_TILE_LABEL } from "@/lib/data/regions";
import { selectAsOf, useRhume } from "@/lib/store";
import { STAGE_LABEL } from "./Badge";

const STAGES: Stage[] = ["quiet", "watch", "rising", "peaking", "falling"];

/**
 * F16: the planner can dispute the engine's stage for the selected region this week. The override
 * is display-only (the engine, cards and simulation are unchanged), needs a reason, is logged and
 * shows on the tile as "Overridden".
 */
export default function StageDispute({ state }: { state: RegionState }) {
  const asOf = useRhume(selectAsOf);
  const key = `${state.regionId}:${asOf}`;
  const override = useRhume((s) => s.stageOverrides[key]);
  const setOverride = useRhume((s) => s.setStageOverride);
  const clearOverride = useRhume((s) => s.clearStageOverride);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage | "">("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);

  if (override && !open) {
    return (
      <span className="flex items-center gap-1.5 text-xs">
        <span className="font-semibold text-accent">Overridden: {STAGE_LABEL[override.stage]}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => clearOverride(key)} title={`Planner reason: ${override.reason}`}>
          Clear
        </button>
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} title="Dispute the engine's stage (logged)">
        Dispute stage
      </button>
    );
  }

  const error = !stage ? "Choose a stage." : stage === state.stage ? "Choose a stage different from the engine's." : !reason.trim() ? "A reason is required." : null;

  return (
    <form
      aria-label={`Dispute the stage of ${REGION_TILE_LABEL[state.regionId]}`}
      className="flex flex-wrap items-center gap-1.5 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (error || !stage) return;
        setOverride({ regionId: state.regionId, replayDate: asOf, engineStage: state.stage, stage, reason: reason.trim() });
        setOpen(false);
        setStage("");
        setReason("");
        setTried(false);
      }}
    >
      <select
        aria-label="Planner stage"
        value={stage}
        onChange={(e) => setStage(e.target.value as Stage)}
        className="rounded-[4px] border border-line bg-bg px-1.5 py-0.5 text-xs text-ink"
      >
        <option value="">Stage…</option>
        {STAGES.filter((s) => s !== state.stage).map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </select>
      <input
        aria-label="Reason"
        placeholder="Reason (required)"
        value={reason}
        maxLength={200}
        onChange={(e) => setReason(e.target.value)}
        className="w-44 rounded-[4px] border border-line px-1.5 py-0.5 text-xs text-ink"
      />
      <button type="submit" className="btn btn-secondary btn-sm">
        Save
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {tried && error && (
        <span role="alert" className="text-accent">
          {error}
        </span>
      )}
    </form>
  );
}
