"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { isoOf, monthLabel, monthTicks, seasonDomain, weeklyFlows } from "@/lib/chartData";
import { REGION_IDS, REGION_TILE_LABEL } from "@/lib/data/regions";
import type { Config } from "@/lib/engine/config";
import { cardPrecision, compareOutcomes, leadTable, type OutcomeComparison, type PolicyOutcome } from "@/lib/engine/outcomes";
import type { SeasonalProfile } from "@/lib/engine/seasonal";
import type { Season, SimResult } from "@/lib/engine/types";
import { formatCad, formatDate, formatDays, formatInt, formatPct, formatWeekOf } from "@/lib/format";

const th = "px-3 py-2 text-left text-[11px] font-semibold tracking-[0.08em] text-muted uppercase";
const td = "px-3 py-2 text-sm text-ink tabular";

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-label">{title}</h2>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const dateOrDash = (iso: string | null) => (iso ? formatDate(iso) : "—");
const leadOrDash = (n: number | null) => (n === null ? "—" : formatDays(n));

/** Lead table: first watch, first rising, lab onset, lead in days (PRD §7.4). */
export function LeadTable({ season, cfg }: { season: Season; cfg: Config }) {
  const rows = leadTable(season, cfg);
  return (
    <Section
      title="Lead over the lab signal"
      note={`Lab onset = first Monday reported lab positivity ≥ ${formatPct(cfg.labOnsetPct)}. Lead = lab onset − Rhume flag.`}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>Region</th>
              <th className={th}>First watch</th>
              <th className={th}>First rising</th>
              <th className={th}>Lab onset</th>
              <th className={`${th} text-right`}>Lead (watch)</th>
              <th className={`${th} text-right`}>Lead (rising)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.regionId} className="border-b border-line last:border-b-0">
                <td className={`${td} font-medium`}>{REGION_TILE_LABEL[r.regionId]}</td>
                <td className={td}>{dateOrDash(r.firstWatch)}</td>
                <td className={td}>{dateOrDash(r.firstRising)}</td>
                <td className={td}>{dateOrDash(r.labOnset)}</td>
                <td className={`${td} text-right`}>{leadOrDash(r.leadDaysWatch)}</td>
                <td className={`${td} text-right font-semibold`}>{leadOrDash(r.leadDaysRising)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

type OutcomeRow = { label: string; get: (o: PolicyOutcome) => number; fmt: (n: number) => string };

const OUTCOME_ROWS: OutcomeRow[] = [
  { label: "Stockout region-days", get: (o) => o.stockoutRegionDays, fmt: formatInt },
  { label: "Lost sales", get: (o) => o.lostSalesCad, fmt: formatCad },
  { label: "Lost gross profit", get: (o) => o.lostGpCad, fmt: formatCad },
  { label: "Transfer cost", get: (o) => o.transferCostCad, fmt: formatCad },
  { label: "Season-end excess", get: (o) => o.seasonEndExcessCad, fmt: formatCad },
];

/** Status quo vs Rhume (current decisions) vs Rhume (all recommendations approved). */
export function OutcomeTable({ sq, rh, rhAuto, cfg }: { sq: SimResult; rh: SimResult; rhAuto: SimResult; cfg: Config }) {
  const current: OutcomeComparison = compareOutcomes(sq, rh, cfg);
  const auto: OutcomeComparison = compareOutcomes(sq, rhAuto, cfg);
  return (
    <Section
      title="Outcome: status quo vs Rhume"
      note="Same simulated stock and demand. Status quo follows last week's sales. Season-end excess is the carrying cost of stock above normal."
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="border-b border-line">
            <tr>
              <th className={th} />
              <th className={`${th} text-right`}>Status quo</th>
              <th className={`${th} text-right`}>Rhume (your decisions)</th>
              <th className={`${th} text-right`}>Rhume (all recommended approved)</th>
            </tr>
          </thead>
          <tbody>
            {OUTCOME_ROWS.map((row) => (
              <tr key={row.label} className="border-b border-line">
                <td className={`${td} font-medium`}>{row.label}</td>
                <td className={`${td} text-right`}>{row.fmt(row.get(current.statusQuo))}</td>
                <td className={`${td} text-right`}>{row.fmt(row.get(current.rhume))}</td>
                <td className={`${td} text-right`}>{row.fmt(row.get(auto.rhume))}</td>
              </tr>
            ))}
            <tr>
              <td className={`${td} font-semibold`}>Net benefit vs status quo</td>
              <td className={`${td} text-right text-muted`}>—</td>
              <td className={`${td} text-right font-semibold`}>{formatCad(current.netBenefitCad)}</td>
              <td className={`${td} text-right font-semibold`}>{formatCad(auto.netBenefitCad)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Net benefit = (lost gross profit avoided) + (season-end excess avoided) − Rhume transfer cost.
      </p>
    </Section>
  );
}

const SEASONAL_ROWS: OutcomeRow[] = [
  { label: "Stockout region-days", get: (o) => o.stockoutRegionDays, fmt: formatInt },
  { label: "Lost gross profit", get: (o) => o.lostGpCad, fmt: formatCad },
  { label: "Transfer cost", get: (o) => o.transferCostCad, fmt: formatCad },
  { label: "Season-end excess", get: (o) => o.seasonEndExcessCad, fmt: formatCad },
];

const seasonName = (id: string) => id.replace("-", "–");

/**
 * Seasonal pre-build baseline vs the same baseline with Rhume layered on top (all recommended approved).
 * A stronger status quo than "last week's sales": every region pre-builds on a national flu-season curve.
 */
export function SeasonalTable({ seasonal, seasonalRhume, profile, cfg }: {
  seasonal: SimResult; seasonalRhume: SimResult; profile: SeasonalProfile; cfg: Config;
}) {
  const cmp = compareOutcomes(seasonal, seasonalRhume, cfg);
  const reference = profile.referenceSeasonId ? `the ${seasonName(profile.referenceSeasonId)} season` : "no earlier season (flat)";
  return (
    <Section title="Against a seasonal pre-build" note="Same simulated stock, demand, lead times, cover days and costs.">
      <p className="mb-3 text-sm text-ink">
        Baseline assumption: every region orders ahead of flu season using one national curve, taken from last year&apos;s
        national demand week by week (here {reference}, standing in for last year). It knows how big the season usually gets
        and roughly when, but not which region the wave reaches first.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" aria-label="Seasonal pre-build vs seasonal pre-build plus Rhume">
          <thead className="border-b border-line">
            <tr>
              <th className={th} />
              <th className={`${th} text-right`}>Seasonal pre-build</th>
              <th className={`${th} text-right`}>Seasonal pre-build + Rhume (all recommended approved)</th>
            </tr>
          </thead>
          <tbody>
            {SEASONAL_ROWS.map((row) => (
              <tr key={row.label} className="border-b border-line">
                <td className={`${td} font-medium`}>{row.label}</td>
                <td className={`${td} text-right`}>{row.fmt(row.get(cmp.statusQuo))}</td>
                <td className={`${td} text-right`}>{row.fmt(row.get(cmp.rhume))}</td>
              </tr>
            ))}
            <tr>
              <td className={`${td} font-semibold`}>Net benefit vs seasonal pre-build</td>
              <td className={`${td} text-right text-muted`}>—</td>
              <td className={`${td} text-right font-semibold`}>{formatCad(cmp.netBenefitCad)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Seasonal orders follow the national curve for the weeks they will cover, never below last week&apos;s sales. Rhume adds its
        stage-aware DC orders and stock moves on top. Net benefit = (lost gross profit avoided) + (season-end excess avoided) − Rhume
        transfer cost.
      </p>
    </Section>
  );
}

/** Card precision: share of cards whose region's reported lab positivity crossed onset within 21 days. */
export function PrecisionTable({ season, cfg, rh, rhAuto }: { season: Season; cfg: Config; rh: SimResult; rhAuto: SimResult }) {
  const rows = [
    { label: "Rhume (your decisions)", p: cardPrecision(rh.proposals, season, cfg) },
    { label: "Rhume (all recommended approved)", p: cardPrecision(rhAuto.proposals, season, cfg) },
  ];
  return (
    <Section
      title="Card precision"
      note={`A card is a hit if reported lab positivity was ≥ ${formatPct(cfg.labOnsetPct)} at the card date or within 21 days after.`}
    >
      <table className="w-full border-collapse">
        <thead className="border-b border-line">
          <tr>
            <th className={th} />
            <th className={`${th} text-right`}>Cards</th>
            <th className={`${th} text-right`}>Hits</th>
            <th className={`${th} text-right`}>Precision</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, p }) => (
            <tr key={label} className="border-b border-line last:border-b-0">
              <td className={`${td} font-medium`}>{label}</td>
              <td className={`${td} text-right`}>{formatInt(p.total)}</td>
              <td className={`${td} text-right`}>{formatInt(p.hits)}</td>
              <td className={`${td} text-right font-semibold`}>{p.precision === null ? "—" : formatPct(p.precision * 100)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

const SERIES = [
  { key: "demand", label: "Demand", color: "var(--muted)", dash: "4 3" },
  { key: "statusQuo", label: "Stock arriving, status quo", color: "var(--ink)", dash: undefined },
  { key: "rhume", label: "Stock arriving, Rhume", color: "var(--accent)", dash: undefined },
] as const;

/** Small multiples per region: weekly demand vs stock arriving at stores under both policies. */
export function FlowSmallMultiples({ season, sq, rh, rhAuto }: { season: Season; sq: SimResult; rh: SimResult; rhAuto: SimResult }) {
  const [which, setWhich] = useState<"current" | "auto">("current");
  const rhume = which === "current" ? rh : rhAuto;
  const domain = seasonDomain(season);
  const ticks = monthTicks(season);

  return (
    <Section title="Demand vs stock arriving at stores, by region (weekly units)">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <svg width="18" height="8" aria-hidden>
                <line x1="0" x2="18" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
        <div className="ml-auto flex gap-1" role="group" aria-label="Rhume series">
          <button type="button" className="btn btn-ghost btn-sm border-line" aria-pressed={which === "current"} onClick={() => setWhich("current")}>
            Your decisions
          </button>
          <button type="button" className="btn btn-ghost btn-sm border-line" aria-pressed={which === "auto"} onClick={() => setWhich("auto")}>
            All recommended approved
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {REGION_IDS.map((id) => {
          const data = weeklyFlows(sq, rhume, id);
          return (
            <figure key={id} className="min-w-0">
              <figcaption className="mb-1 text-xs font-semibold text-ink">{REGION_TILE_LABEL[id]}</figcaption>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis
                      dataKey="t"
                      type="number"
                      scale="time"
                      domain={domain}
                      ticks={ticks}
                      tickFormatter={monthLabel}
                      tick={{ fontSize: 10, fill: "var(--muted)" }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--line)" }}
                      height={18}
                    />
                    <YAxis
                      width={44}
                      tickCount={4}
                      tickFormatter={(v: number) => (v >= 1000 ? `${formatInt(v / 1000)}k` : formatInt(v))}
                      tick={{ fontSize: 10, fill: "var(--muted)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      isAnimationActive={false}
                      labelFormatter={(t) => formatWeekOf(isoOf(Number(t)))}
                      formatter={(v, name) => [`${formatInt(Number(v))} units`, SERIES.find((s) => s.key === name)?.label ?? String(name)]}
                      contentStyle={{ fontSize: 12, borderRadius: 4, borderColor: "var(--line)", boxShadow: "none" }}
                    />
                    {SERIES.map((s) => (
                      <Line
                        key={s.key}
                        dataKey={s.key}
                        name={s.key}
                        type="linear"
                        stroke={s.color}
                        strokeWidth={2}
                        strokeDasharray={s.dash}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </figure>
          );
        })}
      </div>
    </Section>
  );
}
