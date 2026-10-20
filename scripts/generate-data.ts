// npm run gen:data — regenerate data/season-*.json from lib/data/generate.ts.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateSeason2023, generateSeason2024Synchronized, serializeSeason } from "../lib/data/generate";
import { ROOT, writeSeasonIndex } from "./seasonIndex";

const outputs = [
  { file: "season-2023-24.reconstructed.json", season: generateSeason2023() },
  { file: "season-2024-25.synchronized.json", season: generateSeason2024Synchronized() },
];

for (const { file, season } of outputs) {
  const path = join(ROOT, "data", file);
  writeFileSync(path, serializeSeason(season));
  const n = Object.values(season.wastewater).reduce((s, xs) => s + xs.length, 0);
  console.log(`wrote data/${file} (${season.label}; ${n} wastewater readings)`);
}

const hasReal = writeSeasonIndex();
console.log(`wrote lib/data/seasonIndex.generated.ts (real season ${hasReal ? "present" : "absent"})`);
