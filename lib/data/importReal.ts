// Real wastewater import (DESIGN.md §6). Pure: CSV text in, Season out. File I/O lives in scripts/import-real.ts.
// Lab series stay reconstructed (the sourceNote says so).

import { addDays } from "../engine/dates";
import type { RegionId, Season } from "../engine/types";
import { REGION_IDS } from "./regions";

export interface CsvRow { date: string; region: RegionId; pathogen: string; value: number }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_COLUMNS = ["date", "region", "pathogen", "value"] as const;

/** Parse the normalized schema `date,region,pathogen,value`. Throws on malformed rows. */
export function parseWastewaterCsv(csv: string): CsvRow[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error("CSV is empty");
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(REQUIRED_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<(typeof REQUIRED_COLUMNS)[number], number>;
  const missing = REQUIRED_COLUMNS.filter((c) => idx[c] < 0);
  if (missing.length) throw new Error(`CSV is missing column(s): ${missing.join(", ")}`);

  const rows: CsvRow[] = [];
  lines.slice(1).forEach((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    const date = cells[idx.date];
    const region = cells[idx.region] as RegionId;
    const pathogen = cells[idx.pathogen];
    const value = Number(cells[idx.value]);
    const lineNo = i + 2;
    if (!DATE_RE.test(date)) throw new Error(`Line ${lineNo}: bad date "${date}"`);
    if (!REGION_IDS.includes(region)) throw new Error(`Line ${lineNo}: unknown region "${cells[idx.region]}"`);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Line ${lineNo}: bad value "${cells[idx.value]}"`);
    rows.push({ date, region, pathogen, value });
  });
  return rows;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function realSourceNote(downloaded: string): string {
  return `Real data: Health Infobase wastewater export, downloaded ${downloaded}. Lab series reconstructed.`;
}

/**
 * Build the real-mode season: fluA only, within the reconstructed season's window, each region
 * normalized by the median of its first 4 weeks (so baseline ≈ 1.0). Lab series are copied from
 * the reconstructed season.
 */
export function buildRealSeason(csv: string, reconstructed: Season, downloaded: string): Season {
  const rows = parseWastewaterCsv(csv).filter(
    (r) => r.pathogen.toLowerCase() === "flua" && r.date >= reconstructed.startDate && r.date <= reconstructed.endDate,
  );

  const wastewater = {} as Season["wastewater"];
  const missing: RegionId[] = [];
  for (const id of REGION_IDS) {
    // One reading per date (average duplicates), in date order.
    const byDate = new Map<string, number[]>();
    for (const r of rows) if (r.region === id) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r.value]);
    const series = [...byDate.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, vs]) => ({ date, raw: vs.reduce((s, v) => s + v, 0) / vs.length }));
    if (series.length === 0) {
      missing.push(id);
      continue;
    }
    const firstFourWeeksEnd = addDays(series[0].date, 27);
    const base = median(series.filter((p) => p.date <= firstFourWeeksEnd).map((p) => p.raw));
    if (!(base > 0)) throw new Error(`Region ${id}: median of the first 4 weeks is 0, cannot normalize`);
    wastewater[id] = series.map((p) => ({ date: p.date, value: Math.round((p.raw / base) * 1000) / 1000 }));
  }
  if (missing.length) throw new Error(`CSV has no fluA rows in the season window for: ${missing.join(", ")}`);

  return {
    id: reconstructed.id,
    label: reconstructed.label,
    mode: "real",
    sourceNote: realSourceNote(downloaded),
    startDate: reconstructed.startDate,
    endDate: reconstructed.endDate,
    wastewater,
    labTrue: reconstructed.labTrue,
    labReported: reconstructed.labReported,
  };
}
