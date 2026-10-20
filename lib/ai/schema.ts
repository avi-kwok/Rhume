// Schemas for the AI layer (DESIGN.md §9.3, §9.4, §9.8): the brief, the critic review,
// the executive summary, their tool definitions, and the response shapes the API routes return.

import { z } from "zod";

// ---------------------------------------------------------------------------------------------
// Brief (§9.3), exactly as specified.
// ---------------------------------------------------------------------------------------------

export const Brief = z.object({
  recommendation: z.string().max(220),
  why_now: z.array(z.string().max(200)).min(2).max(3),
  options_commentary: z.string().max(240),
  evidence_against: z.array(z.string().max(200)).min(1).max(3),
  what_would_change: z.string().max(200),
  exec_one_liner: z.string().max(160),
  recommended_option_echo: z.enum(["none", "half", "full"]),
});
export type Brief = z.infer<typeof Brief>;

/** The string-valued keys of a brief (every field the renderer fills). */
export const BRIEF_TEXT_KEYS = [
  "recommendation", "why_now", "options_commentary", "evidence_against", "what_would_change", "exec_one_liner",
] as const satisfies readonly (keyof Brief)[];

/** A brief with every placeholder filled in by code (same shape, display strings). */
export type RenderedBrief = {
  recommendation: string;
  why_now: string[];
  options_commentary: string;
  evidence_against: string[];
  what_would_change: string;
  exec_one_liner: string;
  recommended_option_echo: Brief["recommended_option_echo"];
};

// ---------------------------------------------------------------------------------------------
// Critic (§9.4): { verdict: "pass" | "revise", issues: [{ field, problem }] }.
// ---------------------------------------------------------------------------------------------

export const CriticReview = z.object({
  verdict: z.enum(["pass", "revise"]),
  issues: z.array(z.object({ field: z.string(), problem: z.string() })),
});
export type CriticReview = z.infer<typeof CriticReview>;

// ---------------------------------------------------------------------------------------------
// Executive summary (§9.8): one paragraph, at most three sentences, placeholders only.
// ---------------------------------------------------------------------------------------------

export const Summary = z.object({
  paragraph: z.string().max(480),
});
export type Summary = z.infer<typeof Summary>;

export const SUMMARY_MAX_SENTENCES = 3;

/** Roll-up for the current week (§9.8), as plain values. The server types them into a pack. */
export const Rollup = z.object({
  week_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  open_cards: z.number().int().nonnegative(),
  regions_acting: z.array(z.string().max(60)).max(10),
  regions_holding: z.array(z.string().max(60)).max(10),
  total_cases: z.number().finite(),
  total_cost_cad: z.number().finite(),
  total_ev_cad: z.number().finite(),
  reserve_share_pct: z.number().finite(),
  highest_risk_region: z.string().max(60),
});
export type Rollup = z.infer<typeof Rollup>;

// ---------------------------------------------------------------------------------------------
// Response shapes.
// ---------------------------------------------------------------------------------------------

export type BriefSource = "ai" | "template" | "cache";
export type CriticStatus = "pass" | "revised" | "skipped";

/**
 * What POST /api/brief returns (§9.5 step 7).
 * - `source: "cache"` always means a cached AI brief (critic keeps its original status).
 * - `source: "template"` is a deterministic template brief (critic "skipped"), cached or not.
 */
export type BriefResponse = {
  brief: Brief;               // raw, with {{placeholders}}
  rendered: RenderedBrief;    // placeholders filled by code
  source: BriefSource;
  critic: CriticStatus;
  model: string;              // model id for AI briefs, "template" for template briefs
  hash: string;               // evidence-pack hash
};

/** What POST /api/exec-summary returns. Same idea as BriefResponse. */
export type SummaryResponse = {
  summary: Summary;           // raw, with {{placeholders}}
  rendered: string;           // the paragraph with placeholders filled by code
  source: BriefSource;
  critic: CriticStatus;       // always "skipped": the summary has no critic pass
  model: string;
  hash: string;               // summary-pack hash
};

// ---------------------------------------------------------------------------------------------
// JSON schemas for tool input_schema.
// ---------------------------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

function jsonSchemaOf(schema: z.ZodType): JsonSchema {
  const out = z.toJSONSchema(schema) as JsonSchema;
  delete out.$schema;
  return out;
}

/** The full JSON schema of Brief (draft 2020-12, without $schema). */
export const BRIEF_JSON_SCHEMA: JsonSchema = jsonSchemaOf(Brief);
export const CRITIC_JSON_SCHEMA: JsonSchema = jsonSchemaOf(CriticReview);
export const SUMMARY_JSON_SCHEMA: JsonSchema = jsonSchemaOf(Summary);

const STRICT_UNSUPPORTED = ["maxLength", "minLength", "minItems", "maxItems", "minimum", "maximum", "multipleOf", "pattern"] as const;

/**
 * Strict tool use (`strict: true`) does not accept length or count constraints. This copy moves
 * them into each property's description; Zod still enforces them on the returned input.
 */
export function toStrictSchema(schema: JsonSchema): JsonSchema {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const src = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const notes: string[] = [];
    for (const [k, v] of Object.entries(src)) {
      if ((STRICT_UNSUPPORTED as readonly string[]).includes(k)) {
        if (k === "maxLength") notes.push(`At most ${v} characters.`);
        else if (k === "minItems") notes.push(`At least ${v} items.`);
        else if (k === "maxItems") notes.push(`At most ${v} items.`);
        continue;
      }
      out[k] = walk(v);
    }
    if (notes.length) out.description = [src.description, ...notes].filter(Boolean).join(" ");
    return out;
  };
  return walk(schema) as JsonSchema;
}

export const WRITE_BRIEF_TOOL = "write_brief";
export const REVIEW_BRIEF_TOOL = "review_brief";
export const WRITE_SUMMARY_TOOL = "write_summary";

export const TOOL_DESCRIPTIONS = {
  [WRITE_BRIEF_TOOL]:
    "Submit the decision brief. Every number, date, percentage, quantity or dollar amount must be a {{placeholder}} from the allowed list.",
  [REVIEW_BRIEF_TOOL]: "Submit the review of the decision brief: a verdict and the issues found.",
  [WRITE_SUMMARY_TOOL]:
    "Submit the weekly executive summary: one paragraph, at most three sentences, numbers only as {{placeholders}}.",
} as const;
