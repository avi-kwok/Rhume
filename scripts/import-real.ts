// npm run import:real -- path/to/export.csv
// Builds data/season-2023-24.real.json from a normalized Health Infobase CSV export (DESIGN.md §6).

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateSeason2023, serializeSeason } from "../lib/data/generate";
import { buildRealSeason } from "../lib/data/importReal";
import { REAL_SEASON_PATH, writeSeasonIndex } from "./seasonIndex";

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: npm run import:real -- path/to/export.csv");
  process.exit(1);
}

const csvPath = resolve(process.cwd(), arg);
const csv = readFileSync(csvPath, "utf8");
const mtime = statSync(csvPath).mtime;
// Local calendar date of the file's modification time (when the team downloaded it).
const downloaded = [mtime.getFullYear(), mtime.getMonth() + 1, mtime.getDate()].map((n) => String(n).padStart(2, "0")).join("-");

const season = buildRealSeason(csv, generateSeason2023(), downloaded);
writeFileSync(REAL_SEASON_PATH, serializeSeason(season));
writeSeasonIndex();

const n = Object.values(season.wastewater).reduce((s, xs) => s + xs.length, 0);
console.log(`wrote data/season-2023-24.real.json (${n} wastewater readings, downloaded ${downloaded})`);
console.log("lib/data/seasonIndex.generated.ts now points at the real season; restart the dev server.");
