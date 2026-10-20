// npm run prewarm — generate and cache AI briefs for the default season (DESIGN.md §9.9).
//
// 1. Run the default season in auto mode and build a pack for every proposal.
// 2. Simulate interactive (presenter) mode up to the two pause points and add those packs:
//    - pause 1: the first proposal of the season (nothing decided yet);
//    - pause 2: the first Atlantic store move, with every earlier proposal auto-approved (how
//      presenter mode reaches it), plus the variant where the pause-1 card was rejected.
// 3. Add the weekly executive-summary roll-ups for every week with cards.
// 4. Call the pipeline sequentially (polite to rate limits). AI results are appended to
//    data/briefs-cache.json keyed by hash; template fallbacks are never written to the file.
// Without ANTHROPIC_API_KEY it says so and exits 0 without writing anything.

import { cachedAiCount, cacheGet, ensureCacheFile, CACHE_FILE } from "../lib/ai/cache";
import { configuredModel, getBrief, getSummary, hasApiKey } from "../lib/ai/client";
import { buildRollup, buildSummaryPack } from "../lib/ai/summaryPack";
import type { Rollup } from "../lib/ai/schema";
import { DEFAULT_SEASON_ID, loadSeason } from "../lib/data/loadSeason";
import { DEFAULT_CONFIG, type Config } from "../lib/engine/config";
import { mondaysBetween } from "../lib/engine/dates";
import { evidencePackFor, type EvidencePack } from "../lib/engine/evidence";
import { proposalsOn } from "../lib/engine/proposals";
import { simulate } from "../lib/engine/simulate";
import type { Decision, Proposal, Season } from "../lib/engine/types";

const season = loadSeason(DEFAULT_SEASON_ID);
const cfg: Config = DEFAULT_CONFIG;

function approve(p: Proposal): Decision {
  return { proposalId: p.id, action: "approve", optionId: p.recommended, decidedAt: p.asOf, briefSource: "template", evidenceHash: "" };
}

/**
 * Interactive mode up to a pause point: approve (recommended option) every proposal that comes
 * before the pause card, re-simulating until stable (decisions change later proposals).
 * `before(p)` says whether p precedes the pause; `isPause(p)` finds the pause card.
 */
function interactiveUntil(
  s: Season,
  isPause: (p: Proposal) => boolean,
  before: (p: Proposal, pause: Proposal | undefined) => boolean,
  overrides: Record<string, Decision["action"]> = {},
): Proposal | undefined {
  const decisions: Record<string, Decision> = {};
  for (let i = 0; i < 60; i++) {
    const proposals = simulate(s, cfg, "rhume", decisions).proposals;
    const pause = proposals.find(isPause);
    let changed = false;
    for (const p of proposals) {
      if (pause && p.id === pause.id) break;
      if (!before(p, pause) || decisions[p.id]) continue;
      const action = overrides[p.id] ?? "approve";
      decisions[p.id] = action === "reject" ? { ...approve(p), action: "reject", optionId: undefined } : approve(p);
      changed = true;
    }
    if (!changed) return pause;
  }
  throw new Error("interactive simulation did not settle");
}

function collectPacks(): { label: string; pack: EvidencePack }[] {
  const out: { label: string; pack: EvidencePack }[] = [];
  const seen = new Set<string>();
  const add = (label: string, p: Proposal | undefined) => {
    if (!p) return;
    const pack = evidencePackFor(p, { season, cfg });
    if (seen.has(pack.hash)) return;
    seen.add(pack.hash);
    out.push({ label, pack });
  };

  const auto = simulate(season, cfg, "rhume", "auto");
  for (const p of auto.proposals) add("auto", p);

  // Pause 1: first proposal of the season, nothing decided.
  const first = simulate(season, cfg, "rhume", {}).proposals[0];
  add("pause 1", first);

  // Pause 2: first ATL store move, earlier proposals auto-approved.
  const isAtlMove = (p: Proposal) => p.regionId === "ATL" && p.kind === "store_move";
  const earlierWeek = (p: Proposal, pause: Proposal | undefined) => !pause || p.asOf < pause.asOf;
  const earlierInLoop = (p: Proposal, pause: Proposal | undefined) => !pause || p.asOf <= pause.asOf;
  add("pause 2", interactiveUntil(season, isAtlMove, earlierWeek));
  add("pause 2 (same-week cards approved)", interactiveUntil(season, isAtlMove, earlierInLoop));
  if (first) add("pause 2 (pause-1 card rejected)", interactiveUntil(season, isAtlMove, earlierWeek, { [first.id]: "reject" }));

  return out;
}

function collectRollups(): Rollup[] {
  const auto = simulate(season, cfg, "rhume", "auto");
  return mondaysBetween(season.startDate, season.endDate)
    .map((monday) => ({ monday, cards: proposalsOn(auto.proposals, monday) }))
    .filter((w) => w.cards.length > 0)
    .map((w) => buildRollup(w.cards, w.monday, cfg));
}

async function main(): Promise<void> {
  const packs = collectPacks();
  const rollups = collectRollups();
  console.log(`[prewarm] ${season.label} (${season.mode}): ${packs.length} brief packs (${packs.filter((p) => p.label !== "auto").length} extra from presenter pause points after de-duplication by hash), ${rollups.length} weekly summaries.`);

  if (!hasApiKey()) {
    console.log("[prewarm] ANTHROPIC_API_KEY is not set: nothing generated, nothing written. The app will use template briefs (and any AI briefs already in data/briefs-cache.json).");
    return;
  }

  await ensureCacheFile();
  const model = configuredModel();
  console.log(`[prewarm] model ${model}; writing AI results to ${CACHE_FILE} (already cached: ${cachedAiCount()}).`);

  const counts = { ai: 0, pass: 0, revised: 0, cached: 0, template: 0, failures: 0 };
  const reasons: string[] = [];
  const t0 = Date.now();

  for (const [i, { label, pack }] of packs.entries()) {
    const tag = `[${i + 1}/${packs.length}] ${pack.proposalId}${label === "auto" ? "" : ` (${label})`}`;
    const already = cacheGet(pack.hash);
    try {
      const started = Date.now();
      const res = await getBrief(pack);
      const ms = Date.now() - started;
      if (res.source === "cache" || (already && already.source === "ai")) {
        counts.cached++;
        console.log(`${tag}: cached`);
      } else if (res.source === "ai") {
        counts.ai++;
        counts[res.critic === "revised" ? "revised" : "pass"]++;
        console.log(`${tag}: ai, critic ${res.critic}, ${ms} ms`);
      } else {
        counts.template++;
        reasons.push(`${pack.proposalId}: ${res.fallbackReason ?? "template"}`);
        console.log(`${tag}: TEMPLATE fallback (${res.fallbackReason ?? "unknown"}), ${ms} ms`);
      }
    } catch (err) {
      counts.failures++;
      reasons.push(`${pack.proposalId}: ${err instanceof Error ? err.message : String(err)}`);
      console.log(`${tag}: FAILED (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  const summaryCounts = { ai: 0, cached: 0, template: 0, failures: 0 };
  for (const rollup of rollups) {
    const pack = buildSummaryPack(rollup);
    const tag = `[summary] ${pack.proposalId}`;
    try {
      const already = cacheGet(pack.hash);
      const res = await getSummary(rollup);
      if (res.source === "cache" || (already && already.source === "ai")) summaryCounts.cached++;
      else if (res.source === "ai") summaryCounts.ai++;
      else {
        summaryCounts.template++;
        reasons.push(`${pack.proposalId}: ${res.fallbackReason ?? "template"}`);
      }
      console.log(`${tag}: ${res.source}`);
    } catch (err) {
      summaryCounts.failures++;
      console.log(`${tag}: FAILED (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\n[prewarm] briefs: ${counts.ai} AI (${counts.pass} critic pass, ${counts.revised} revised), ${counts.cached} already cached, ${counts.template} template fallbacks, ${counts.failures} failures.`,
  );
  console.log(`[prewarm] summaries: ${summaryCounts.ai} AI, ${summaryCounts.cached} already cached, ${summaryCounts.template} template fallbacks, ${summaryCounts.failures} failures.`);
  console.log(`[prewarm] ${cachedAiCount()} AI entries cached in total; ${secs} s.`);
  if (reasons.length) console.log(`[prewarm] fallback reasons:\n  ${reasons.join("\n  ")}`);
}

main().catch((err: unknown) => {
  console.error("[prewarm] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
