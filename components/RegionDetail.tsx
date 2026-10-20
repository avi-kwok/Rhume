"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { detailSeries, isoOf, monthLabel, monthTicks, niceMax, type ChartPoint } from "@/lib/chartData";
import { REGION_TILE_LABEL } from "@/lib/data/regions";
import { formatDate, formatDays, formatPct } from "@/lib/format";
import { selectAsOf, selectRegionStates, useRhume } from "@/lib/store";
import { ConfidencePip, StageBadge } from "./Badge";
import SignalChecks from "./SignalChecks";
import StageDispute from "./StageDispute";
import StoreTasks from "./StoreTasks";

type Tab = "signals" | "store";

interface PanelProps {
  title: string;
  data: ChartPoint[];
  domain: [number, number];
  ticks: number[];
  today: number;
  yMax: number;
  color: string;
  format: (v: number) => string;
  showX?: boolean;
  showTodayLabel?: boolean;
}

/** One small multiple of the detail chart. One series, one y-axis; all panels share the season x-axis. */
function Panel({ title, data, domain, ticks, today, yMax, color, format, showX = false, showTodayLabel = false }: PanelProps) {
  const pastHalf = today > (domain[0] + domain[1]) / 2;
  return (
    <div className={`flex min-h-0 flex-col ${showX ? "flex-[1.3_1_0%]" : "flex-[1_1_0%]"}`}>
      <div className="flex items-baseline justify-between pl-9 text-[11px] leading-3 text-muted">
        <span>{title}</span>
        <span className="tabular text-ink">{data.length ? format(data[data.length - 1].value) : "n/a"}</span>
      </div>
      {/* Absolutely positioned so the chart's own size never feeds back into the flex layout. */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, bottom: showX ? 0 : 6, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={domain}
                ticks={ticks}
                tickFormatter={monthLabel}
                allowDataOverflow
                hide={!showX}
                height={showX ? 18 : 0}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--line)" }}
              />
              <YAxis
                width={36}
                domain={[0, yMax]}
                ticks={[0, yMax / 2, yMax]}
                interval={0}
                tickFormatter={(v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
                tick={{ fontSize: 10, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                isAnimationActive={false}
                labelFormatter={(t) => formatDate(isoOf(Number(t)))}
                formatter={(v) => [format(Number(v)), title]}
                contentStyle={{ fontSize: 12, borderRadius: 4, borderColor: "var(--line)", boxShadow: "none" }}
              />
              <ReferenceLine
                x={today}
                stroke="var(--accent)"
                strokeWidth={1.5}
                label={
                  showTodayLabel
                    ? { value: "Today", position: pastHalf ? "insideTopRight" : "insideTopLeft", fill: "var(--accent)", fontSize: 10 }
                    : undefined
                }
              />
              <Line
                dataKey="value"
                type="linear"
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/**
 * Region detail: wastewater (× baseline), reported lab positivity (%) and store cover (days, Rhume
 * simulation) for the selected region, up to the replay date only, with a "today" line. Drawn as
 * three aligned small multiples (one y-axis each) rather than one dual-axis chart.
 */
export default function RegionDetail({ className = "" }: { className?: string }) {
  const [tab, setTab] = useState<Tab>("signals");
  const hydrated = useRhume((s) => s.hydrated);
  const season = useRhume((s) => s.season);
  const rh = useRhume((s) => s.results.rh);
  const regionId = useRhume((s) => s.selectedRegion);
  const asOf = useRhume(selectAsOf);
  const state = useRhume(selectRegionStates)[regionId];

  // Every series passes through visible(asOf): no point after the replay date is ever drawn.
  const series = detailSeries(season, rh, regionId, asOf);
  const ticks = monthTicks(season);

  return (
    <section aria-label="Region detail" className={`card flex min-h-0 flex-col p-3 ${className}`}>
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-base leading-5 font-semibold text-ink">{REGION_TILE_LABEL[regionId]}</h2>
        <StageBadge stage={state.stage} />
        <ConfidencePip confidence={state.confidence} />
        <span className="text-xs text-muted tabular">
          {state.agreeCount} of {state.checks.length} signals agree · as of {formatDate(asOf)}
        </span>
        <StageDispute key={`${regionId}:${asOf}`} state={state} />
        <div role="tablist" aria-label="Detail view" className="ml-auto flex gap-1">
          {(
            [
              ["signals", "Signals"],
              ["store", "Store view"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`border-b-2 px-1.5 py-0.5 text-xs ${tab === id ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "signals" ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-1" aria-label={`Signal chart for ${REGION_TILE_LABEL[regionId]}, up to ${formatDate(asOf)}`}>
            {hydrated ? (
              <>
                <Panel
                  title="Wastewater (× baseline)"
                  data={series.wastewater}
                  domain={series.domain}
                  ticks={ticks}
                  today={series.today}
                  yMax={niceMax(series.wastewater, 3)}
                  color="var(--accent)"
                  format={(v) => `${v.toFixed(1)}×`}
                  showTodayLabel
                />
                <Panel
                  title="Reported lab positivity (%)"
                  data={series.lab}
                  domain={series.domain}
                  ticks={ticks}
                  today={series.today}
                  yMax={niceMax(series.lab, 10)}
                  color="var(--ink)"
                  format={formatPct}
                />
                <Panel
                  title="Store cover (days)"
                  data={series.cover}
                  domain={series.domain}
                  ticks={ticks}
                  today={series.today}
                  yMax={niceMax(series.cover, 20)}
                  color="var(--muted)"
                  format={formatDays}
                  showX
                />
              </>
            ) : (
              <div className="flex-1 rounded-[4px] bg-panel" />
            )}
          </div>
          <div className="mt-2 shrink-0">
            <SignalChecks checks={state.checks} />
          </div>
        </>
      ) : (
        <StoreTasks />
      )}
    </section>
  );
}
