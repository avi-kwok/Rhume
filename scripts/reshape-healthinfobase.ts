// Reshape the Health Infobase wastewater export to the import schema (DESIGN.md §6):
//   npx tsx scripts/reshape-healthinfobase.ts path/to/wastewater_aggregate.csv out.csv
// Source: https://health-infobase.canada.ca/src/data/wastewater/wastewater_aggregate.csv
// (linked from https://health-infobase.canada.ca/wastewater/). One city-level aggregate per region.
// Each row is a weekly average over the week starting `weekstart` (a Sunday). It is dated at the
// END of that week (weekstart + 6): the average cannot exist before its last sample, so this is the
// earliest honest sample date. Publication lag comes on top (Settings).

import { readFileSync, writeFileSync } from "node:fs";
import { addDays } from "../lib/engine/dates";
import type { RegionId } from "../lib/engine/types";

export const HEALTH_INFOBASE_LOCATION: Record<RegionId, string> = {
  BC: "Metro Vancouver",
  AB: "Edmonton",
  ON: "Toronto",
  QC: "Montreal",
  ATL: "Halifax",
};

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Usage: npx tsx scripts/reshape-healthinfobase.ts wastewater_aggregate.csv out.csv");
  process.exit(1);
}

const lines = readFileSync(input, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
const header = lines[0].split(",");
const col = (name: string) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`Export is missing column ${name}`);
  return i;
};
const [iLoc, iMeasure, iWeek, iAvg] = [col("Location"), col("measureid"), col("weekstart"), col("w_avg")];
const regionByLocation = new Map(Object.entries(HEALTH_INFOBASE_LOCATION).map(([id, loc]) => [loc, id as RegionId]));

const out = ["date,region,pathogen,value"];
const counts: Partial<Record<RegionId, number>> = {};
for (const line of lines.slice(1)) {
  const c = line.split(",");
  if (c[iMeasure] !== "fluA") continue;
  const region = regionByLocation.get(c[iLoc]);
  if (!region || c[iAvg] === "" || c[iAvg] === "NA") continue;
  const week = c[iWeek];
  if (week < "2023-09-01" || week > "2024-04-30") continue;
  out.push(`${addDays(week, 6)},${region},fluA,${Number(c[iAvg])}`);
  counts[region] = (counts[region] ?? 0) + 1;
}
writeFileSync(output, out.join("\n") + "\n");
console.log(`wrote ${output}: ${out.length - 1} fluA rows`, counts);
