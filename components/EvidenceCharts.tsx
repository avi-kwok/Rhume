"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { isoOf, monthLabel, toT } from "@/lib/chartData";
import { REGION_BY_ID, REGION_TILE_LABEL } from "@/lib/data/regions";
import type { RegionEvidence } from "@/lib/evidenceData";
import { formatDate } from "@/lib/format";

const REAL_COLOR = "var(--accent)";
const RECON_COLOR = "var(--muted)";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** One region: real vs reconstructed, both as share of their own season peak (one y-axis). */
function RegionPanel({ e, domain, ticks }: { e: RegionEvidence; domain: [number, number]; ticks: number[] }) {
  const byT = new Map<number, { t: number; real?: number; reconstructed?: number }>();
  for (const p of e.real) byT.set(toT(p.date), { ...(byT.get(toT(p.date)) ?? { t: toT(p.date) }), real: p.value });
  for (const p of e.reconstructed) byT.set(toT(p.date), { ...(byT.get(toT(p.date)) ?? { t: toT(p.date) }), reconstructed: p.value });
  const data = [...byT.values()].sort((a, b) => a.t - b.t);
  const region = REGION_BY_ID[e.regionId];

  return (
    <figure className="card flex flex-col p-3" aria-label={`${region.name}: real vs reconstructed wastewater`}>
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
        <span className="font-semibold text-ink">
          {REGION_TILE_LABEL[e.regionId]} <span className="font-normal text-muted">· {region.city}</span>
        </span>
        <span className="text-muted tabular">
          Rise: real {e.realFirstRise ? formatDate(e.realFirstRise).replace(/, \d{4}$/, "") : "none"} · reconstructed{" "}
          {e.reconstructedFirstRise ? formatDate(e.reconstructedFirstRise).replace(/, \d{4}$/, "") : "none"}
        </span>
      </figcaption>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={domain}
              ticks={ticks}
              tickFormatter={monthLabel}
              allowDataOverflow
              height={18}
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--line)" }}
            />
            <YAxis
              width={40}
              domain={[0, 1]}
              ticks={[0, 0.5, 1]}
              tickFormatter={pct}
              tick={{ fontSize: 10, fill: "var(--muted)" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              isAnimationActive={false}
              labelFormatter={(t) => `Week ending ${formatDate(isoOf(Number(t)))}`}
              formatter={(v, name) => [pct(Number(v)), name === "real" ? "Real (Health Infobase)" : "Reconstructed"]}
              contentStyle={{ fontSize: 12, borderRadius: 4, borderColor: "var(--line)", boxShadow: "none" }}
            />
            {e.realFirstRise && <ReferenceLine x={toT(e.realFirstRise)} stroke={REAL_COLOR} strokeDasharray="2 3" />}
            {e.reconstructedFirstRise && <ReferenceLine x={toT(e.reconstructedFirstRise)} stroke={RECON_COLOR} strokeDasharray="2 3" />}
            <Line dataKey="real" name="real" type="linear" stroke={REAL_COLOR} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
            <Line
              dataKey="reconstructed"
              name="reconstructed"
              type="linear"
              stroke={RECON_COLOR}
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
            <Legend
              verticalAlign="top"
              height={20}
              iconSize={10}
              formatter={(v) => <span className="text-[11px] text-muted">{v === "real" ? "Real flu A (Health Infobase)" : "Reconstructed"}</span>}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export default function EvidenceCharts({ regions, domain, ticks }: { regions: RegionEvidence[]; domain: [number, number]; ticks: number[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {regions.map((e) => (
        <RegionPanel key={e.regionId} e={e} domain={domain} ticks={ticks} />
      ))}
    </div>
  );
}
