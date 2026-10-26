// Validator (DESIGN.md §9.6). A brief is rejected if any of:
// - schema parse fails;
// - any {{key}} is not in the whitelist (the pack's keys);
// - after removing all {{...}} tokens, any string field matches /\d/;
// - any string field contains a spelled-out number word (one … twenty, hundred, thousand, million, percent);
// - recommended_option_echo ≠ the engine's recommended option;
// - evidence_against has no placeholder from {disagreeing_signals, season_caveat, lab_check,
//   wastewater_check, neighbour_check} when signals_agree < signals_total.

import type { EvidencePack } from "../engine/evidence";
import { ANY_TOKEN_RE, briefStrings, placeholderKeys, type PackLike } from "./placeholders";
import { Brief, Summary, SUMMARY_MAX_SENTENCES } from "./schema";

export type ValidationResult = { ok: boolean; errors: string[] };
export type BriefValidation = ValidationResult & { brief?: Brief };
export type SummaryValidation = ValidationResult & { summary?: Summary };

export const NUMBER_WORDS = [
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  "hundred", "thousand", "million", "percent",
] as const;

const NUMBER_WORD_RE = new RegExp(`\\b(${NUMBER_WORDS.join("|")})\\b`, "gi");

export const EVIDENCE_AGAINST_KEYS = ["disagreeing_signals", "season_caveat", "lab_check", "wastewater_check", "neighbour_check"] as const;

export function stripTokens(text: string): string {
  return text.replace(ANY_TOKEN_RE, " ");
}

/** Checks shared by briefs and summaries: whitelist, digits, number words. */
function checkStrings(strings: { path: string; text: string }[], pack: PackLike, errors: string[]): void {
  const allowed = new Set(Object.keys(pack.fields));
  for (const { path, text } of strings) {
    const unknown = placeholderKeys(text).filter((k) => !allowed.has(k));
    for (const k of new Set(unknown)) errors.push(`${path}: unknown placeholder {{${k}}}`);
    const bare = stripTokens(text);
    const digits = bare.match(/\d+/g);
    if (digits) errors.push(`${path}: contains a digit outside a placeholder ("${digits[0]}"); use a placeholder instead`);
    const words = [...new Set([...bare.matchAll(NUMBER_WORD_RE)].map((m) => m[1].toLowerCase()))];
    if (words.length) errors.push(`${path}: contains a spelled-out number word (${words.map((w) => `"${w}"`).join(", ")}); use a placeholder instead`);
  }
}

function zodErrors(issues: { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map((i) => `schema: ${i.path.length ? i.path.map(String).join(".") : "(root)"}: ${i.message}`);
}

function numberField(pack: PackLike, key: string): number | null {
  const v = pack.fields[key]?.value;
  return typeof v === "number" ? v : null;
}

/** Validate a brief (raw tool input or a Brief) against its evidence pack. */
export function validate(input: unknown, pack: EvidencePack): BriefValidation {
  const parsed = Brief.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error.issues) };
  const brief = parsed.data;
  const errors: string[] = [];

  checkStrings(briefStrings(brief), pack, errors);

  const recommended = pack.fields.recommended_option?.value;
  if (brief.recommended_option_echo !== recommended) {
    errors.push(`recommended_option_echo: "${brief.recommended_option_echo}" does not match the engine's recommended option "${String(recommended)}"`);
  }

  const agree = numberField(pack, "signals_agree");
  const total = numberField(pack, "signals_total");
  if (agree !== null && total !== null && agree < total) {
    const keys = new Set(brief.evidence_against.flatMap(placeholderKeys));
    if (!EVIDENCE_AGAINST_KEYS.some((k) => keys.has(k))) {
      errors.push(
        `evidence_against: not every signal agrees, so it must include at least one of ${EVIDENCE_AGAINST_KEYS.map((k) => `{{${k}}}`).join(", ")}`,
      );
    }
  }

  return errors.length ? { ok: false, errors, brief } : { ok: true, errors: [], brief };
}

/** Sentences in a paragraph (placeholders removed first, so rendered decimals never count). */
export function countSentences(text: string): number {
  const bare = stripTokens(text).trim();
  if (!bare) return 0;
  return bare.split(/[.!?]+(?:\s+|$)/).filter((s) => s.trim().length > 0).length;
}

/** Validate an executive summary (§9.8): same placeholder rules, one paragraph, at most three sentences. */
export function validateSummary(input: unknown, pack: PackLike): SummaryValidation {
  const parsed = Summary.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error.issues) };
  const summary = parsed.data;
  const errors: string[] = [];
  checkStrings([{ path: "paragraph", text: summary.paragraph }], pack, errors);
  if (/\n\s*\n/.test(summary.paragraph)) errors.push("paragraph: must be a single paragraph");
  const n = countSentences(summary.paragraph);
  if (n > SUMMARY_MAX_SENTENCES) errors.push(`paragraph: ${n} sentences; at most ${SUMMARY_MAX_SENTENCES} allowed`);
  return errors.length ? { ok: false, errors, summary } : { ok: true, errors: [], summary };
}
