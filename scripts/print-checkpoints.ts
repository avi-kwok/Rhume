// Checkpoints for DESIGN.md §14 steps 3–4: run with `npx tsx scripts/print-checkpoints.ts [2023-24|2024-25]`.

import { loadSeason, type SeasonId } from "../lib/data/loadSeason";
import { REGION_BY_ID, REGION_IDS } from "../lib/data/regions";
import { DEFAULT_CONFIG } from "../lib/engine/config";
import { mondaysBetween } from "../lib/engine/dates";
import { cardPrecision, compareOutcomes, leadTable } from "../lib/engine/outcomes";
import { getStageEngine } from "../lib/engine/stage";
import { simulate } from "../lib/engine/simulate";

const seasonId = (process.argv[2] ?? "2023-24") as SeasonId;
const verbose = process.argv.includes("--stages");
const season = loadSeason(seasonId);
const cfg = DEFAULT_CONFIG;

console.log(`Season ${season.label} (${season.mode})\n`);

if (verbose) {
  const engine = getStageEngine(season, cfg);
  const mondays = mondaysBetween(season.startDate, season.endDate);
  console.log("Monday stages (q=quiet w=watch R=rising P=peaking f=falling):");
  console.log("        " + mondays.map((d) => d.slice(5)).join(" "));
  for (const id of REGION_IDS) {
    const code = { quiet: "q", watch: "w", rising: "R", peaking: "P", falling: "f" } as const;
    console.log(id.padEnd(8) + mondays.map((d) => code[engine.stateAt(id, d).stage].padEnd(5)).join(" "));
  }
  console.log();
}

const lead = leadTable(season, cfg);
console.log("Lead table (stage flags on Mondays; lab onset = first Monday reported lab ≥ 5%):");
console.log(["Region", "First watch", "First rising", "Lab onset", "Lead (watch)", "Lead (rising)"].map((s) => s.padEnd(14)).join(""));
for (const r of lead) {
  console.log(
    [r.regionId, r.firstWatch ?? "—", r.firstRising ?? "—", r.labOnset ?? "—", String(r.leadDaysWatch ?? "—"), String(r.leadDaysRising ?? "—")]
      .map((s) => s.padEnd(14)).join(""),
  );
}
const atl = lead.find((r) => r.regionId === "ATL")!;
const atlOk = !!atl.firstWatch && !!atl.firstRising && atl.firstWatch < atl.firstRising;
console.log(`\nAtlantic first watch (${atl.firstWatch}) precedes first rising (${atl.firstRising}): ${atlOk ? "PASS" : "FAIL"}`);

const sq = simulate(season, cfg, "status_quo", "auto");
const rh = simulate(season, cfg, "rhume", "auto");
const cmp = compareOutcomes(sq, rh, cfg);
const cad = (x: number) => "C$" + Math.round(x).toLocaleString("en-CA");
console.log("\nOutcome table (status quo vs Rhume, auto-approve):");
const rows: [string, string, string][] = [
  ["Stockout region-days", String(cmp.statusQuo.stockoutRegionDays), String(cmp.rhume.stockoutRegionDays)],
  ["Lost sales", cad(cmp.statusQuo.lostSalesCad), cad(cmp.rhume.lostSalesCad)],
  ["Lost gross profit", cad(cmp.statusQuo.lostGpCad), cad(cmp.rhume.lostGpCad)],
  ["Transfer cost", cad(cmp.statusQuo.transferCostCad), cad(cmp.rhume.transferCostCad)],
  ["Season-end excess", cad(cmp.statusQuo.seasonEndExcessCad), cad(cmp.rhume.seasonEndExcessCad)],
  ["Net benefit", "—", cad(cmp.netBenefitCad)],
];
console.log("".padEnd(24) + "Status quo".padEnd(16) + "Rhume auto");
for (const [k, a, b] of rows) console.log(k.padEnd(24) + a.padEnd(16) + b);

const prec = cardPrecision(rh.proposals, season, cfg);
console.log(`\nCards: ${rh.proposals.length}, executed ${rh.executed.length}; card precision ${prec.hits}/${prec.total} = ${prec.precision === null ? "—" : (prec.precision * 100).toFixed(0) + "%"}`);

console.log("\nCards per region (auto-approve):");
let perRegionOk = true;
for (const id of REGION_IDS) {
  const cards = rh.proposals.filter((p) => p.regionId === id);
  const firstWatchCard = cards.find((p) => p.kind === "dc_preposition")?.asOf ?? null;
  const firstStoreCard = cards.find((p) => p.kind === "store_move")?.asOf ?? null;
  if (cards.length === 0) perRegionOk = false;
  console.log(
    `  ${id.padEnd(4)} ${String(cards.length).padStart(2)} cards  first DC pre-position ${firstWatchCard ?? "—"}  first store move ${firstStoreCard ?? "—"}  (${REGION_BY_ID[id].name})`,
  );
}
const atlCards = rh.proposals.filter((p) => p.regionId === "ATL");
const atlWatchCard = atlCards.find((p) => p.stage === "watch");
const atlRisingCard = atlCards.find((p) => p.stage === "rising");
const atlCardOk = !!atlWatchCard && !!atlRisingCard && atlWatchCard.asOf < atlRisingCard.asOf;
console.log(`\nPRD §11 (default-season criteria): at least one card per region: ${perRegionOk ? "PASS" : "FAIL"}`);
console.log(`PRD §11: Atlantic first watch card (${atlWatchCard?.asOf ?? "—"}) before first rising card (${atlRisingCard?.asOf ?? "—"}): ${atlCardOk ? "PASS" : "FAIL"}`);

if (process.argv.includes("--cards")) {
  console.log("\nAll cards:");
  for (const p of rh.proposals) {
    const rec = p.options.find((o) => o.id === p.recommended)!;
    const full = p.options.find((o) => o.id === "full")!;
    console.log(
      `  ${p.id.padEnd(30)} ${p.stage.padEnd(7)} ${p.confidence.padEnd(6)} cover ${p.coverDays.toFixed(1).padStart(5)}d  full ${String(full.cases).padStart(5)} cs EV ${cad(full.expectedValueCad).padStart(10)}  rec ${p.recommended.padEnd(4)} ${String(rec.cases).padStart(5)} cs ${cad(rec.transferCostCad)}  ${p.sourceName}`,
    );
  }
}
