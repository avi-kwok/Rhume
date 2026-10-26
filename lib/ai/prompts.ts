// Prompts (DESIGN.md §9.4). The writer and critic system prompts are verbatim from the spec.
// Version "brief-v1" is part of every evidence-pack hash, so changing a prompt here means
// bumping PROMPT_VERSION in lib/engine/evidence.ts (which invalidates the cache).

import { PROMPT_VERSION, type EvidencePack } from "../engine/evidence";
import type { PackLike } from "./placeholders";
import type { RenderedBrief } from "./schema";

export { PROMPT_VERSION };
export const SUMMARY_PROMPT_VERSION = "summary-v1";

export const WRITER_SYSTEM_PROMPT = `You are Rhume's decision-brief writer for the health-category supply planning team at Shoppers Drug Mart. A rules engine has already decided the recommended action and computed every number. Your job is to explain that decision so a busy executive can approve or reject it in thirty seconds.

Rules:
1. Use only the facts in the evidence pack. Do not add outside facts, statistics or claims.
2. Never write a digit (0-9). Every number, date, percentage, quantity or dollar amount must be written as a placeholder from the allowed list, for example {{cover_days}} or {{expected_value_cad}}. Spell no numbers out in words either.
3. Do not choose or change the recommendation. Set recommended_option_echo to the engine's recommended option exactly.
4. Evidence against must name every disagreeing signal and include {{season_caveat}} when the neighbour signal is one of the reasons. Do not soften it.
5. Never claim more certainty than the confidence field states.
6. Plain, short sentences. No jargon, hype, or exclamation marks. Refer to the planner's decision, not the AI's.
7. Respond only by calling the write_brief tool.`;

export const CRITIC_SYSTEM_PROMPT = `You are a sceptical supply chain director reviewing a decision brief before it reaches an executive. You have the evidence pack and the brief (with placeholders already filled in).

Check:
1. Every claim is supported by a field in the evidence pack.
2. Evidence against is not understated or missing a disagreeing signal.
3. The brief does not imply more certainty than the stated confidence.
4. The brief is consistent with the engine's recommended option.
5. A non-specialist executive could act on it.

Respond only by calling the review_brief tool. Use verdict "revise" only for problems in checks 1-4; style issues alone are a "pass".`;

/** Executive summary writer (§9.8), written in the style of the writer prompt. */
export const SUMMARY_SYSTEM_PROMPT = `You are Rhume's weekly summary writer for the VP Supply Chain at Shoppers Drug Mart. A rules engine has already decided this week's recommended stock moves and computed every number. Your job is to summarise the week so the executive can approve or reject the plan in thirty seconds.

Rules:
1. Use only the facts in the roll-up. Do not add outside facts, statistics or claims.
2. Never write a digit (0-9). Every number, date, percentage, quantity or dollar amount must be written as a placeholder from the allowed list, for example {{total_cases}} or {{total_ev_cad}}. Spell no numbers out in words either.
3. Write one paragraph of at most three sentences: what the executive is asked to approve, what it costs and is expected to return, and where the risk is highest.
4. Do not add, drop or change any move. Name the regions holding as well as the regions acting.
5. Never claim more certainty than the roll-up supports.
6. Plain, short sentences. No jargon, hype, or exclamation marks. Refer to the executive's decision, not the AI's.
7. Respond only by calling the write_summary tool.`;

function packPayload(pack: PackLike): { allowed_placeholders: string[]; fields: PackLike["fields"] } {
  return { allowed_placeholders: Object.keys(pack.fields), fields: pack.fields };
}

export type WriterFeedback =
  | { kind: "validation"; errors: string[]; previous?: unknown }
  | { kind: "critic"; issues: { field: string; problem: string }[]; previous?: unknown };

function previousText(previous: unknown): string {
  return previous === undefined ? "" : `\n\nYour previous brief (raw, with placeholders):\n${JSON.stringify(previous, null, 2)}`;
}

function feedbackText(feedback: WriterFeedback | undefined): string {
  if (!feedback) return "";
  if (feedback.kind === "validation") {
    return `${previousText(feedback.previous)}\n\nIt was rejected by the validator. Fix every problem and call write_brief again:\n${feedback.errors.map((e) => `- ${e}`).join("\n")}`;
  }
  return `${previousText(feedback.previous)}\n\nA reviewer asked for a revision. Address every issue and call write_brief again:\n${feedback.issues.map((i) => `- ${i.field}: ${i.problem}`).join("\n")}`;
}

/** Writer user message (§9.4): the pack as JSON, then "Write the brief for proposal <id>." */
export function buildWriterUserMessage(pack: EvidencePack, feedback?: WriterFeedback): string {
  return `${JSON.stringify(packPayload(pack), null, 2)}\n\nWrite the brief for proposal ${pack.proposalId}.${feedbackText(feedback)}`;
}

/** Critic user message: the evidence pack and the brief with placeholders filled in. */
export function buildCriticUserMessage(pack: EvidencePack, rendered: RenderedBrief): string {
  return [
    "Evidence pack:",
    JSON.stringify(packPayload(pack), null, 2),
    "",
    "Brief (placeholders filled in):",
    JSON.stringify(rendered, null, 2),
    "",
    `Review the brief for proposal ${pack.proposalId}.`,
  ].join("\n");
}

/** Summary user message: the roll-up pack as JSON, then the instruction. */
export function buildSummaryUserMessage(pack: PackLike & { proposalId: string }, errors?: string[]): string {
  const retry = errors?.length
    ? `\n\nYour previous summary was rejected by the validator. Fix every problem and call write_summary again:\n${errors.map((e) => `- ${e}`).join("\n")}`
    : "";
  return `${JSON.stringify(packPayload(pack), null, 2)}\n\nWrite the executive summary for ${pack.proposalId}.${retry}`;
}
