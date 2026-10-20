"use client";

import CardQueue from "@/components/CardQueue";
import ExecSummaryBanner from "@/components/ExecSummaryBanner";
import ProvenanceLabel from "@/components/ProvenanceLabel";
import RegionDetail from "@/components/RegionDetail";
import RegionTileMap from "@/components/RegionTileMap";
import TimelineBar from "@/components/TimelineBar";
import { useRhume } from "@/lib/store";

/**
 * Workspace (DESIGN.md §10.2). Fits the viewport with no page scroll at 1280×720 and 1920×1080;
 * only the card queue scrolls. Usable down to 1024 px wide.
 */
export default function WorkspacePage() {
  const season = useRhume((s) => s.season);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ExecSummaryBanner />

      <TimelineBar />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 lg:p-4">
          <RegionTileMap />
          <RegionDetail className="flex-1" />
        </div>

        <aside className="flex min-h-0 w-[300px] shrink-0 flex-col border-l border-line bg-panel/40 xl:w-[360px]">
          <CardQueue />
        </aside>
      </div>

      <footer className="flex shrink-0 flex-wrap gap-x-4 gap-y-0.5 border-t border-line px-4 py-1.5 text-[11px] leading-4 text-muted lg:px-6">
        <ProvenanceLabel source="wastewater" season={season} />
        <ProvenanceLabel source="lab" season={season} />
        <ProvenanceLabel source="stock" season={season} name="Stock, demand and sales" />
      </footer>
    </div>
  );
}
