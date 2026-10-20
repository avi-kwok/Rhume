"use client";

import { seasonDomain, sparklineSeries } from "@/lib/chartData";
import { REGION_IDS } from "@/lib/data/regions";
import { selectAsOf, selectDayRecords, selectRegionStates, useRhume } from "@/lib/store";
import RegionTile from "./RegionTile";

/** Five tiles, west → east (BC, AB, ON, QC, ATL). Click selects the region. */
export default function RegionTileMap() {
  const season = useRhume((s) => s.season);
  const asOf = useRhume(selectAsOf);
  const states = useRhume(selectRegionStates);
  const days = useRhume(selectDayRecords);
  const selected = useRhume((s) => s.selectedRegion);
  const selectRegion = useRhume((s) => s.selectRegion);
  const overrides = useRhume((s) => s.stageOverrides);
  const domain = seasonDomain(season);

  return (
    <section aria-label="Region tile map" className="shrink-0">
      <div className="mb-1.5 flex items-baseline justify-between">
        <h2 className="section-label">Regions · west to east</h2>
        <span className="text-[11px] text-muted">Sparkline: wastewater to date</span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {REGION_IDS.map((id) => (
          <RegionTile
            key={id}
            regionId={id}
            state={states[id]}
            coverDays={days[id]?.coverDays}
            sparkline={sparklineSeries(season, id, asOf)}
            domain={domain}
            selected={selected === id}
            overrideStage={overrides[`${id}:${asOf}`]?.stage}
            onSelect={selectRegion}
          />
        ))}
      </div>
    </section>
  );
}
