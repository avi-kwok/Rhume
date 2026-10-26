import type { Season } from "@/lib/engine/types";

// Provenance labels (PRD §9). Reconstructed or simulated data is never called real.

export type DataSource = "wastewater" | "lab" | "stock" | "demand" | "sales" | "sap";

export const LAB_LABEL = "Reconstructed; lag is an assumption";
export const SIMULATED_LABEL = "Simulated";
export const SAP_LABEL = "Simulated, no SAP connection";

const SOURCE_NAME: Record<DataSource, string> = {
  wastewater: "Wastewater",
  lab: "Reported lab positivity",
  stock: "Store and DC stock",
  demand: "Demand",
  sales: "Sales",
  sap: "SAP documents",
};

/** Header badge / scoreboard footer data mode. */
export function dataModeLabel(season: Season): string {
  return season.mode === "real" ? "Real data: Health Infobase export" : "Reconstructed data";
}

/** "Real data: Health Infobase export, downloaded [date]" in real mode; the season's sourceNote otherwise. */
export function wastewaterLabel(season: Season): string {
  if (season.mode !== "real") return season.sourceNote;
  const m = /downloaded (.+?)\.(?:\s|$)/.exec(season.sourceNote);
  return `Real data: Health Infobase export, downloaded ${m ? m[1] : "date unknown"}`;
}

export function provenanceText(source: DataSource, season: Season): string {
  switch (source) {
    case "wastewater":
      return wastewaterLabel(season);
    case "lab":
      return LAB_LABEL;
    case "sap":
      return SAP_LABEL;
    default:
      return SIMULATED_LABEL;
  }
}

export default function ProvenanceLabel({
  source,
  season,
  name,
  className = "",
}: {
  source: DataSource;
  season: Season;
  /** Overrides the source name, e.g. "Stock, demand and sales". */
  name?: string;
  className?: string;
}) {
  return (
    <span className={className}>
      <span className="font-medium text-ink">{name ?? SOURCE_NAME[source]}:</span> {provenanceText(source, season)}
    </span>
  );
}
