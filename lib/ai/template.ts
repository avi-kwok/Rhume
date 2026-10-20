// Template fallback (DESIGN.md §9.7). A deterministic brief built only from the evidence pack,
// with the same placeholder syntax, so it shares the renderer and the validator. Always valid
// (tests/validate.test.ts checks every default-season proposal).

import type { EvidencePack, Field } from "../engine/evidence";
import type { Brief, Summary } from "./schema";

type Rec = Brief["recommended_option_echo"];

function value(pack: Pick<EvidencePack, "fields">, key: string): Field["value"] | undefined {
  return pack.fields[key]?.value;
}

function list(pack: Pick<EvidencePack, "fields">, key: string): string[] {
  const v = value(pack, key);
  return Array.isArray(v) ? v : [];
}

function kindOf(pack: EvidencePack): "dc_preposition" | "store_move" {
  if (pack.proposalId.endsWith(":dc_preposition")) return "dc_preposition";
  if (pack.proposalId.endsWith(":store_move")) return "store_move";
  return value(pack, "kind_label") === "DC pre-position" ? "dc_preposition" : "store_move";
}

/** Which evidence field explains each disagreeing signal (labels come from lib/engine/evidence.ts). */
function checkKeyFor(label: string): "wastewater_check" | "lab_check" | "neighbour_check" {
  if (label === "reported lab positivity") return "lab_check";
  if (label === "neighbour timing") return "neighbour_check";
  return "wastewater_check";
}

const CHECK_ORDER = ["wastewater_check", "lab_check", "neighbour_check"] as const;

/** Evidence against: every disagreeing signal, the season caveat when the neighbour signal is a reason, never empty. */
function evidenceAgainst(pack: EvidencePack): string[] {
  const disagreeing = list(pack, "disagreeing_signals");
  const failedKeys = new Set(disagreeing.map(checkKeyFor));
  const neighbourIsReason = list(pack, "upstream_regions").length > 0 && !failedKeys.has("neighbour_check");
  const out: string[] = [];

  if (disagreeing.length > 0) out.push("Signals that disagree: {{disagreeing_signals}}.");
  if (neighbourIsReason) out.push("{{season_caveat}}");
  for (const key of CHECK_ORDER) {
    if (out.length >= 3) break;
    if (failedKeys.has(key)) out.push(`{{${key}}}.`);
  }
  if (disagreeing.length === 0 && out.length < 3) {
    out.push("Reported lab positivity is published with a {{lab_reporting_lag_days}} delay, so it shows the wave as it was, not as it is now.");
  }
  if (out.length === 0) out.push("{{season_caveat}}");
  return out.slice(0, 3);
}

const OPTIONS_LINE =
  "Expected value: do nothing {{option_none_ev}}; half move ({{option_half_cases}} cases) {{option_half_ev}}; full move ({{option_full_cases}} cases) {{option_full_ev}}.";

function optionsCommentary(rec: Rec): string {
  if (rec === "none") return `${OPTIONS_LINE} No move pays back its cost, so the engine recommends doing nothing.`;
  return `${OPTIONS_LINE} The ${rec} move has the highest expected value.`;
}

/** Build the deterministic template brief for a pack. */
export function templateBrief(pack: EvidencePack): Brief {
  const kind = kindOf(pack);
  const rawRec = value(pack, "recommended_option");
  const rec: Rec = rawRec === "half" || rawRec === "full" ? rawRec : "none";
  const upstream = list(pack, "upstream_regions");
  const wastewaterPassed = !list(pack, "disagreeing_signals").map(checkKeyFor).includes("wastewater_check");

  const stageLine =
    kind === "dc_preposition"
      ? "{{region_name}} is on {{stage}} with {{confidence}} confidence: {{signals_agree}} of {{signals_total}} signals pass."
      : "{{region_name}} is {{stage}} with {{confidence}} confidence: {{signals_agree}} of {{signals_total}} signals pass.";

  let recommendation: string;
  let whyNow: string[];
  let execOneLiner: string;
  let whatWouldChange = "{{change_trigger}}.";

  if (kind === "dc_preposition") {
    const reasonLine = upstream.length > 0 ? "{{neighbour_check}}." : wastewaterPassed ? "{{wastewater_check}}." : null;
    const coverLine = "{{dc_name}} holds {{cover_days}} of cover against a target of {{target_cover_days}} at watch-level demand.";
    whyNow = [stageLine, ...(reasonLine ? [reasonLine] : []), coverLine];
    if (rec === "none") {
      recommendation = "Hold: pre-position no stock at {{dc_name}} this week, because no option pays back its cost.";
      execOneLiner = "No pre-position for {{region_name}} this week: no option pays back its cost.";
    } else {
      recommendation =
        "Pre-position {{move_cases}} cases from {{source_name}} to {{dc_name}}, arriving {{arrival_date}}, ahead of a possible rise in {{region_name}}.";
      execOneLiner =
        "Approve pre-positioning {{move_cases}} cases at {{dc_name}}: expected value {{expected_value_cad}}, {{confidence}} confidence, reversible: {{reversible}}.";
    }
  } else {
    const coverLine = "Stores hold {{cover_days}} of cover against a target of {{target_cover_days}} at the projected rising demand.";
    if (rec === "none") {
      recommendation = "Hold: move no stock to {{region_name}} stores this week, because no option pays back its cost.";
      whyNow = [stageLine, coverLine, "At this cover, a move now costs more than the sales it is expected to protect."];
      execOneLiner = "No store move for {{region_name}} this week: no option pays back its cost.";
    } else {
      recommendation = "Move {{move_cases}} cases from {{source_name}} to {{region_name}} stores, arriving {{arrival_date}}.";
      whyNow = [
        stageLine,
        coverLine,
        "The {{recommended_option}} move arrives after {{lead_days}} and has an expected value of {{expected_value_cad}}, net of {{transfer_cost_cad}} in transfer cost.",
      ];
      execOneLiner =
        "Approve {{move_cases}} cases for {{region_name}} stores: expected value {{expected_value_cad}}, {{confidence}} confidence, reversible: {{reversible}}.";
    }
  }

  if (rec === "none") {
    whatWouldChange = "If {{city}} wastewater keeps rising at the next reading, the engine re-checks cover and may propose a move.";
  }

  return {
    recommendation,
    why_now: whyNow.slice(0, 3),
    options_commentary: optionsCommentary(rec),
    evidence_against: evidenceAgainst(pack),
    what_would_change: whatWouldChange,
    exec_one_liner: execOneLiner,
    recommended_option_echo: rec,
  };
}

/** Deterministic weekly summary (§9.8) from a summary pack. */
export function templateSummary(pack: Pick<EvidencePack, "fields">): Summary {
  const acting = list(pack, "regions_acting");
  const holding = list(pack, "regions_holding");
  const openCards = value(pack, "open_cards");
  const risk = value(pack, "highest_risk_region");
  const hasRisk = typeof risk === "string" && risk !== "" && risk !== "none";

  let paragraph: string;
  if (acting.length > 0) {
    const hold = holding.length > 0 ? " {{regions_holding}} hold for now, and each DC keeps a {{reserve_share_pct}} reserve." : " Each DC keeps a {{reserve_share_pct}} reserve.";
    const riskLine = hasRisk ? " Stock is tightest in {{highest_risk_region}}." : "";
    // At most three sentences: the plan, the holds and reserve, the risk.
    paragraph =
      `For the week of {{week_of}}, approve {{total_cases}} cases for {{regions_acting}}, at a transfer cost of {{total_cost_cad}} and an expected value of {{total_ev_cad}}.` +
      hold +
      riskLine;
  } else if (typeof openCards === "number" && openCards > 0) {
    paragraph =
      "For the week of {{week_of}}, none of the {{open_cards}} open cards pays back its cost, so every region holds. Each DC keeps a {{reserve_share_pct}} reserve.";
  } else {
    paragraph =
      "For the week of {{week_of}}, no region meets the rules for a stock move, so every region holds. Each DC keeps a {{reserve_share_pct}} reserve.";
  }
  return { paragraph };
}
