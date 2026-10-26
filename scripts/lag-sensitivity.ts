// Wastewater publication-lag sensitivity: `npx tsx scripts/lag-sensitivity.ts`.
// For lag = 0, 3, 5, 7 days and both seasons, with default assumptions otherwise.

import { REGION_IDS } from "../lib/data/regions";
import { lagSensitivity, type LagCard } from "../lib/lagSensitivity";

const cad = (x: number) => (x < 0 ? "−" : "") + "C$" + Math.abs(Math.round(x)).toLocaleString("en-CA");
const n = (x: number | null) => (x === null ? "—" : String(x));
const card = (c: LagCard | null) => (c ? `${c.asOf} ${c.cases} cs, EV ${cad(c.evCad)}` : "does not appear");

const rows = lagSensitivity();
const cols = ["Season", "Lag", "ATL lead watch", "ATL lead rising", ...REGION_IDS.map((id) => `${id} lead`), "Stockout days SQ → Rhume", "Net benefit", "Cards"];
const widths = [10, 5, 16, 17, 9, 9, 9, 9, 9, 26, 14, 6];
const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("");

console.log("Wastewater publication lag sensitivity (default assumptions; lead = lab onset − first flag, days)\n");
console.log(line(cols));
for (const r of rows) {
  console.log(
    line([
      r.seasonLabel, `${r.lagDays}d`, n(r.atlLeadWatch), n(r.atlLeadRising), ...REGION_IDS.map((id) => n(r.leads[id])),
      `${r.stockoutStatusQuo} → ${r.stockoutRhume}`, cad(r.netBenefitCad), String(r.cards),
    ]),
  );
}

console.log("\nAtlantic cards:");
for (const r of rows) {
  const demo = r.seasonId === "2023-24" ? `Jan 8 card: ${card(r.demoCard)}; ` : "";
  console.log(`  ${r.seasonLabel.padEnd(8)} lag ${String(r.lagDays).padStart(2)}d  ${demo}first ATL store move: ${card(r.firstAtlStoreMove)}`);
}
