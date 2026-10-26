"use client";

import type { ChartPoint } from "@/lib/chartData";
import { REGION_TILE_LABEL } from "@/lib/data/regions";
import type { RegionId, RegionState } from "@/lib/engine/types";
import { formatDays } from "@/lib/format";
import { ConfidencePip, STAGE_LABEL, StageBadge } from "./Badge";

export interface RegionTileProps {
  regionId: RegionId;
  state: RegionState;
  /** Store cover (days) from the interactive Rhume simulation on the replay date. */
  coverDays: number | undefined;
  /** Visible wastewater readings only (sparklineSeries). */
  sparkline: ChartPoint[];
  /** Fixed x domain (the season), so the line grows left to right as the replay advances. */
  domain: [number, number];
  selected: boolean;
  onSelect: (regionId: RegionId) => void;
  /** F16: planner's disputed stage for this week (display only). */
  overrideStage?: RegionState["stage"];
}

const W = 120;
const H = 28;

function sparkPath(points: ChartPoint[], [t0, t1]: [number, number]): string {
  if (points.length === 0) return "";
  // y from visible data only, with a floor so the quiet baseline sits low.
  const max = Math.max(3, ...points.map((p) => p.value));
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => H - 2 - (Math.max(0, v) / max) * (H - 4);
  return points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
}

export function tileAriaLabel(regionId: RegionId, state: RegionState, coverDays: number | undefined, overrideStage?: RegionState["stage"]): string {
  const name = REGION_TILE_LABEL[regionId];
  const cover = coverDays === undefined ? "cover unknown" : `${formatDays(Math.round(coverDays))} cover`;
  const override = overrideStage ? `, overridden by the planner to ${STAGE_LABEL[overrideStage].toLowerCase()}` : "";
  return `${name}, stage ${STAGE_LABEL[state.stage].toLowerCase()}${override}, ${state.confidence} confidence, ${cover}`;
}

export default function RegionTile({ regionId, state, coverDays, sparkline, domain, selected, onSelect, overrideStage }: RegionTileProps) {
  const path = sparkPath(sparkline, domain);
  const lastPoint = sparkline[sparkline.length - 1];
  const lastX = lastPoint ? ((lastPoint.t - domain[0]) / Math.max(1, domain[1] - domain[0])) * W : 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(regionId)}
      aria-pressed={selected}
      aria-label={tileAriaLabel(regionId, state, coverDays, overrideStage)}
      className={`flex min-w-0 flex-col gap-1.5 rounded-[4px] border bg-bg p-2.5 text-left transition-colors hover:bg-panel ${
        selected ? "border-ink ring-1 ring-ink" : "border-line"
      }`}
    >
      <span className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[13px] leading-4 font-semibold text-ink" title={REGION_TILE_LABEL[regionId]}>{REGION_TILE_LABEL[regionId]}</span>
        {overrideStage && (
          <span className="shrink-0 text-[10px] leading-4 font-semibold text-accent" title={`Planner override: ${STAGE_LABEL[overrideStage]}`}>
            Overridden: {STAGE_LABEL[overrideStage]}
          </span>
        )}
      </span>
      <span className="flex flex-wrap items-center justify-between gap-x-1 gap-y-1">
        <StageBadge stage={state.stage} />
        <ConfidencePip confidence={state.confidence} />
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
        <line x1={0} x2={W} y1={H - 2} y2={H - 2} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {path && <path d={path} fill="none" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        {lastPoint && <line x1={lastX} x2={lastX} y1={0} y2={H} stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      <span className="flex items-baseline justify-between gap-1 text-xs text-muted">
        <span className="whitespace-nowrap">Cover</span>
        <span className="tabular text-sm font-semibold whitespace-nowrap text-ink">
          {coverDays === undefined ? "n/a" : formatDays(Math.round(coverDays))}
        </span>
      </span>
    </button>
  );
}
