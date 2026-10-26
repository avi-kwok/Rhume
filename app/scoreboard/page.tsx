"use client";

import ProvenanceLabel, { dataModeLabel } from "@/components/ProvenanceLabel";
import { useMemo } from "react";
import { FlowSmallMultiples, LeadTable, OutcomeTable, PrecisionTable, SeasonalTable } from "@/components/ScoreboardTables";
import { simulateSeasonal } from "@/lib/engine/simulate";
import { useRhume } from "@/lib/store";

/** Scoreboard (PRD §7.4): an outcome view over the whole season, re-computed on every decision. */
export default function ScoreboardPage() {
  const hydrated = useRhume((s) => s.hydrated);
  const season = useRhume((s) => s.season);
  const cfg = useRhume((s) => s.cfg);
  const { sq, rh, rhAuto } = useRhume((s) => s.results);
  const decided = useRhume((s) => Object.keys(s.decisions).length);
  // Additional comparison against a seasonal pre-build; independent of planner decisions.
  const seasonalCmp = useMemo(() => simulateSeasonal(season, cfg), [season, cfg]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="section-label">Scoreboard</p>
          <h1 className="text-[22px] leading-7 font-semibold text-ink">Season {season.label}: what Rhume changed</h1>
        </div>
        <p className="text-xs text-muted tabular">
          {decided} planner decision{decided === 1 ? "" : "s"} recorded · whole-season outcome view
        </p>
      </div>

      <LeadTable season={season} cfg={cfg} />
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <OutcomeTable sq={sq} rh={rh} rhAuto={rhAuto} cfg={cfg} />
        <PrecisionTable season={season} cfg={cfg} rh={rh} rhAuto={rhAuto} />
      </div>
      <SeasonalTable seasonal={seasonalCmp.seasonal} seasonalRhume={seasonalCmp.seasonalRhume} profile={seasonalCmp.profile} cfg={cfg} />
      {hydrated ? (
        <FlowSmallMultiples season={season} sq={sq} rh={rh} rhAuto={rhAuto} />
      ) : (
        <div className="card h-64 bg-panel" />
      )}

      <footer className="flex flex-col gap-1 border-t border-line pt-2 text-xs text-muted">
        <p>
          Simulated outcome for one product group under stated assumptions. Not the business-case model. Signal curves:{" "}
          {dataModeLabel(season)}.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-0.5">
          <ProvenanceLabel source="wastewater" season={season} />
          <ProvenanceLabel source="lab" season={season} />
          <ProvenanceLabel source="stock" season={season} name="Stock, demand and sales" />
          <span>
            <span className="font-medium text-ink">Assumptions:</span> shown in Settings
          </span>
        </p>
      </footer>
    </div>
  );
}
