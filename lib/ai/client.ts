// AI pipeline (DESIGN.md §9.5). Server-only: the API key never leaves this module.
//
// 1. Cache hit on pack.hash → return it (source "cache").
// 2. No ANTHROPIC_API_KEY → template brief (source "template").
// 3. Writer call: one tool, write_brief; max_tokens ~800; 15 s timeout.
// 4. Parse + validate(); on failure retry once with the errors appended to the user message.
// 5. Critic call (review_brief) on the rendered brief. On "revise", one more writer call with the
//    issues appended; validate; accept without a second critic pass (critic "revised").
// 6. Any exception or timeout, or a second validation failure → template brief.
// 7. Store in memory; AI results are also appended to data/briefs-cache.json in development.
// The whole pipeline is bounded by one deadline, so it falls back to the template within 20 s.

import Anthropic from "@anthropic-ai/sdk";
import type { EvidencePack } from "../engine/evidence";
import { cacheGet, cacheSet, isBriefEntry, isSummaryEntry } from "./cache";
import { renderBrief, render } from "./placeholders";
import {
  buildCriticUserMessage,
  buildSummaryUserMessage,
  buildWriterUserMessage,
  CRITIC_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  WRITER_SYSTEM_PROMPT,
  type WriterFeedback,
} from "./prompts";
import {
  BRIEF_JSON_SCHEMA,
  CRITIC_JSON_SCHEMA,
  CriticReview,
  REVIEW_BRIEF_TOOL,
  SUMMARY_JSON_SCHEMA,
  TOOL_DESCRIPTIONS,
  toStrictSchema,
  WRITE_BRIEF_TOOL,
  WRITE_SUMMARY_TOOL,
  type Brief,
  type BriefResponse,
  type Rollup,
  type SummaryResponse,
} from "./schema";
import { buildSummaryPack } from "./summaryPack";
import { templateBrief, templateSummary } from "./template";
import { validate, validateSummary } from "./validate";

export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const CALL_TIMEOUT_MS = 15_000;
/** Total budget for one brief, including every retry; leaves headroom under the 20 s fallback requirement. */
export const PIPELINE_BUDGET_MS = 19_000;
/** Do not start a model call with less than this left; fall back instead. */
const MIN_CALL_MS = 2_000;
export const WRITER_MAX_TOKENS = 800;
const CRITIC_MAX_TOKENS = 800;
const TEMPERATURE = 0.2;

export function configuredModel(): string {
  return process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
}

export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

// ---------------------------------------------------------------------------------------------
// Model capabilities. Newer models reject parameters the spec asks for (forced tool_choice,
// temperature), so the request is shaped per model; the intent of each rule is kept.
// ---------------------------------------------------------------------------------------------

type ModelProfile = {
  forcedToolChoice: boolean;   // tool_choice {type:"tool"}; else "auto" + prompt instruction ("Respond only by calling …")
  temperature: boolean;        // sampling params accepted (models up to Opus 4.6)
  strictTools: boolean;        // strict: true tool use (schema-valid arguments)
  thinking: Anthropic.ThinkingConfigParam | null;
  effort: "low" | null;
  maxTokens: number;
};

export function modelProfile(model: string): ModelProfile {
  const m = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(model);
  if (/^claude-\d/.test(model)) {
    // claude-3-5-sonnet-… style ids: legacy behaviour.
    return { forcedToolChoice: true, temperature: true, strictTools: false, thinking: null, effort: null, maxTokens: WRITER_MAX_TOKENS };
  }
  if (!m) {
    // Unknown id: assume current-generation rules (no forced tool choice, no temperature).
    return { forcedToolChoice: false, temperature: false, strictTools: false, thinking: null, effort: null, maxTokens: WRITER_MAX_TOKENS };
  }
  const family = m[1];
  const version = Number(m[2]) + (m[3] ? Number(m[3]) / 10 : 0);
  const legacy = version <= 4.6;
  const noForced = ((family === "opus" || family === "sonnet") && version >= 5.5) || ((family === "fable" || family === "mythos") && version >= 5.1);
  const strict = version >= 4.8 || (family === "haiku" && version >= 4.5);
  let thinking: ModelProfile["thinking"] = null;
  let effort: ModelProfile["effort"] = null;
  let maxTokens = WRITER_MAX_TOKENS;
  if (family === "sonnet" && version >= 5.5) {
    thinking = { type: "between_tools" }; // lowest setting: no extended thinking (fast, fits ~800 tokens)
    effort = "low";
  } else if (version >= 5) {
    // Thinking cannot be disabled on these models; keep it short and leave room for it.
    effort = "low";
    maxTokens = 4_000;
  } else if (version >= 4.7) {
    effort = "low";
  }
  return { forcedToolChoice: !noForced, temperature: legacy, strictTools: strict, thinking, effort, maxTokens };
}

// ---------------------------------------------------------------------------------------------
// One tool call.
// ---------------------------------------------------------------------------------------------

class PipelineError extends Error {}
class NoToolCallError extends PipelineError {}

type Deadline = { at: number; signal: AbortSignal };

function makeDeadline(budgetMs: number): { deadline: Deadline; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  return { deadline: { at: Date.now() + budgetMs, signal: controller.signal }, dispose: () => clearTimeout(timer) };
}

async function callTool(
  client: Anthropic,
  model: string,
  args: { system: string; user: string; tool: string; schema: Record<string, unknown>; maxTokens: number },
  deadline: Deadline,
): Promise<unknown> {
  const remaining = deadline.at - Date.now();
  if (remaining < MIN_CALL_MS) throw new PipelineError("pipeline deadline reached");
  const p = modelProfile(model);
  const tool: Anthropic.Tool = {
    name: args.tool,
    description: TOOL_DESCRIPTIONS[args.tool as keyof typeof TOOL_DESCRIPTIONS],
    input_schema: (p.strictTools ? toStrictSchema(args.schema) : args.schema) as Anthropic.Tool.InputSchema,
    ...(p.strictTools ? { strict: true } : {}),
  };
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: Math.max(args.maxTokens, p.maxTokens),
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    tools: [tool],
    tool_choice: p.forcedToolChoice ? { type: "tool", name: args.tool } : { type: "auto" },
    ...(p.temperature ? { temperature: TEMPERATURE } : {}),
    ...(p.thinking ? { thinking: p.thinking } : {}),
    ...(p.effort ? { output_config: { effort: p.effort } } : {}),
  };
  const response = await client.messages.create(params, {
    timeout: Math.min(CALL_TIMEOUT_MS, remaining),
    signal: deadline.signal,
    maxRetries: 0,
  });
  if (response.stop_reason === "refusal") throw new PipelineError("model declined the request (refusal)");
  const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === args.tool);
  if (!block) throw new NoToolCallError(`no ${args.tool} tool call (stop_reason ${response.stop_reason})`);
  return block.input;
}

let sharedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (!sharedClient) {
    sharedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: CALL_TIMEOUT_MS });
  }
  return sharedClient;
}

/** Describe an error without ever including request headers or the key. */
function describe(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `API error ${err.status ?? ""} ${err.name}`.trim();
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

// ---------------------------------------------------------------------------------------------
// Brief pipeline.
// ---------------------------------------------------------------------------------------------

export function templateResponse(pack: EvidencePack): BriefResponse {
  const brief = templateBrief(pack);
  return { brief, rendered: renderBrief(brief, pack), source: "template", critic: "skipped", model: "template", hash: pack.hash };
}

type WriterResult = { ok: true; brief: Brief } | { ok: false; errors: string[]; previous?: unknown };

async function writeOnce(client: Anthropic, model: string, pack: EvidencePack, deadline: Deadline, feedback?: WriterFeedback): Promise<WriterResult> {
  let input: unknown;
  try {
    input = await callTool(
      client,
      model,
      { system: WRITER_SYSTEM_PROMPT, user: buildWriterUserMessage(pack, feedback), tool: WRITE_BRIEF_TOOL, schema: BRIEF_JSON_SCHEMA, maxTokens: WRITER_MAX_TOKENS },
      deadline,
    );
  } catch (err) {
    // A reply without the tool call counts as a failed validation; anything else aborts to the template.
    if (err instanceof NoToolCallError) return { ok: false, errors: [`${err.message}. Respond only by calling the write_brief tool.`] };
    throw err;
  }
  const v = validate(input, pack);
  return v.ok && v.brief ? { ok: true, brief: v.brief } : { ok: false, errors: v.errors, previous: input };
}

/** Steps 3–6 against the live API. Throws on any failure (the caller falls back to the template). */
export async function runAiPipeline(pack: EvidencePack, opts: { client?: Anthropic; model?: string; budgetMs?: number } = {}): Promise<BriefResponse> {
  const client = opts.client ?? getClient();
  const model = opts.model ?? configuredModel();
  const { deadline, dispose } = makeDeadline(opts.budgetMs ?? PIPELINE_BUDGET_MS);
  try {
    // 3–4. Writer, validate, retry once with the errors.
    let w = await writeOnce(client, model, pack, deadline);
    if (!w.ok) {
      const first = w;
      w = await writeOnce(client, model, pack, deadline, { kind: "validation", errors: first.errors, previous: first.previous });
      if (!w.ok) throw new PipelineError(`validation failed twice: ${w.errors.join("; ")}`);
    }
    let brief = w.brief;

    // 5. Critic on the rendered brief.
    const reviewInput = await callTool(
      client,
      model,
      { system: CRITIC_SYSTEM_PROMPT, user: buildCriticUserMessage(pack, renderBrief(brief, pack)), tool: REVIEW_BRIEF_TOOL, schema: CRITIC_JSON_SCHEMA, maxTokens: CRITIC_MAX_TOKENS },
      deadline,
    );
    const review = CriticReview.safeParse(reviewInput);
    if (!review.success) throw new PipelineError("critic returned an invalid review");

    let critic: BriefResponse["critic"] = "pass";
    if (review.data.verdict === "revise") {
      const r = await writeOnce(client, model, pack, deadline, { kind: "critic", issues: review.data.issues, previous: brief });
      if (!r.ok) throw new PipelineError(`revised brief failed validation: ${r.errors.join("; ")}`);
      brief = r.brief;
      critic = "revised";
    }
    return { brief, rendered: renderBrief(brief, pack), source: "ai", critic, model, hash: pack.hash };
  } finally {
    dispose();
  }
}

const inflight = new Map<string, Promise<BriefResponse>>();

export type BriefOutcome = BriefResponse & { fallbackReason?: string };

/** The full pipeline (§9.5). Never throws: on any failure it returns the template brief. */
export async function getBrief(pack: EvidencePack, opts: { client?: Anthropic; model?: string; budgetMs?: number } = {}): Promise<BriefOutcome> {
  // 1. Cache (re-validated against the pack, so a stale or hand-edited entry is never served).
  const hit = cacheGet(pack.hash);
  if (isBriefEntry(hit)) {
    if (hit.source === "template") return hit;
    if (validate(hit.brief, pack).ok) return { ...hit, rendered: renderBrief(hit.brief, pack), source: "cache" };
  }

  // 2. No key → template.
  if (!hasApiKey() && !opts.client) {
    const t = templateResponse(pack);
    await cacheSet(t);
    return t;
  }

  const pending = inflight.get(pack.hash);
  if (pending) return pending;

  const run = (async (): Promise<BriefOutcome> => {
    try {
      const res = await runAiPipeline(pack, opts);
      await cacheSet(res);
      return res;
    } catch (err) {
      const reason = describe(err);
      console.warn(`[rhume] brief ${pack.proposalId}: falling back to template (${reason})`);
      const t = templateResponse(pack);
      await cacheSet(t);
      return { ...t, fallbackReason: reason };
    } finally {
      inflight.delete(pack.hash);
    }
  })();
  inflight.set(pack.hash, run);
  return run;
}

// ---------------------------------------------------------------------------------------------
// Executive summary pipeline (§9.8): same rules, tool write_summary, validate-retry once, template
// fallback. No critic pass (critic "skipped").
// ---------------------------------------------------------------------------------------------

export function templateSummaryResponse(pack: EvidencePack): SummaryResponse {
  const summary = templateSummary(pack);
  return { summary, rendered: render(summary.paragraph, pack), source: "template", critic: "skipped", model: "template", hash: pack.hash };
}

async function runSummaryPipeline(pack: EvidencePack, opts: { client?: Anthropic; model?: string; budgetMs?: number }): Promise<SummaryResponse> {
  const client = opts.client ?? getClient();
  const model = opts.model ?? configuredModel();
  const { deadline, dispose } = makeDeadline(opts.budgetMs ?? PIPELINE_BUDGET_MS);
  try {
    let errors: string[] | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      let input: unknown;
      try {
        input = await callTool(
          client,
          model,
          { system: SUMMARY_SYSTEM_PROMPT, user: buildSummaryUserMessage(pack, errors), tool: WRITE_SUMMARY_TOOL, schema: SUMMARY_JSON_SCHEMA, maxTokens: WRITER_MAX_TOKENS },
          deadline,
        );
      } catch (err) {
        if (!(err instanceof NoToolCallError)) throw err;
        errors = [`${err.message}. Respond only by calling the write_summary tool.`];
        continue;
      }
      const v = validateSummary(input, pack);
      if (v.ok && v.summary) {
        return { summary: v.summary, rendered: render(v.summary.paragraph, pack), source: "ai", critic: "skipped", model, hash: pack.hash };
      }
      errors = v.errors;
    }
    throw new PipelineError(`summary validation failed twice: ${(errors ?? []).join("; ")}`);
  } finally {
    dispose();
  }
}

/** Executive summary for a roll-up. Never throws: on any failure it returns the template summary. */
export async function getSummary(rollup: Rollup, opts: { client?: Anthropic; model?: string; budgetMs?: number } = {}): Promise<SummaryResponse & { fallbackReason?: string }> {
  const pack = buildSummaryPack(rollup);
  const hit = cacheGet(pack.hash);
  if (isSummaryEntry(hit)) {
    if (hit.source === "template") return hit;
    if (validateSummary(hit.summary, pack).ok) return { ...hit, rendered: render(hit.summary.paragraph, pack), source: "cache" };
  }
  if (!hasApiKey() && !opts.client) {
    const t = templateSummaryResponse(pack);
    await cacheSet(t);
    return t;
  }
  try {
    const res = await runSummaryPipeline(pack, opts);
    await cacheSet(res);
    return res;
  } catch (err) {
    const reason = describe(err);
    console.warn(`[rhume] summary ${pack.proposalId}: falling back to template (${reason})`);
    const t = templateSummaryResponse(pack);
    await cacheSet(t);
    return { ...t, fallbackReason: reason };
  }
}
