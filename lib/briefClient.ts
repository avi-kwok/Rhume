// Browser-side calls to the AI routes, with a deterministic template fallback when the network or
// the route fails (PRD §8 rule 6: "Always works"). Requests are de-duplicated by hash.

import type { EvidencePack } from "./engine/evidence";
import { render, renderBrief } from "./ai/placeholders";
import type { BriefResponse, Rollup, SummaryResponse } from "./ai/schema";
import { buildSummaryPack } from "./ai/summaryPack";
import { templateBrief, templateSummary } from "./ai/template";

/** The PRD allows 15 s for live generation and 20 s before a template fallback. */
export const BRIEF_TIMEOUT_MS = 20_000;

export function templateBriefResponse(pack: EvidencePack): BriefResponse {
  const brief = templateBrief(pack);
  return { brief, rendered: renderBrief(brief, pack), source: "template", critic: "skipped", model: "template", hash: pack.hash };
}

export function templateSummaryResponse(rollup: Rollup): SummaryResponse {
  const pack = buildSummaryPack(rollup);
  const summary = templateSummary(pack);
  return { summary, rendered: render(summary.paragraph, pack), source: "template", critic: "skipped", model: "template", hash: pack.hash };
}

async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const inflightBriefs = new Map<string, Promise<BriefResponse>>();

/** POST /api/brief { pack }. Falls back to the template brief on any failure or timeout. */
export function fetchBrief(pack: EvidencePack, timeoutMs = BRIEF_TIMEOUT_MS): Promise<BriefResponse> {
  const existing = inflightBriefs.get(pack.hash);
  if (existing) return existing;
  const p = postJson<BriefResponse>("/api/brief", { pack }, timeoutMs)
    .then((res) => (res && res.hash === pack.hash && res.brief ? res : templateBriefResponse(pack)))
    .catch(() => templateBriefResponse(pack))
    .finally(() => inflightBriefs.delete(pack.hash));
  inflightBriefs.set(pack.hash, p);
  return p;
}

const inflightSummaries = new Map<string, Promise<SummaryResponse>>();

/** POST /api/exec-summary { rollup }. Falls back to the template summary on any failure. */
export function fetchSummary(rollup: Rollup, timeoutMs = BRIEF_TIMEOUT_MS): Promise<SummaryResponse> {
  const hash = buildSummaryPack(rollup).hash;
  const existing = inflightSummaries.get(hash);
  if (existing) return existing;
  const p = postJson<SummaryResponse>("/api/exec-summary", { rollup }, timeoutMs)
    .then((res) => (res && res.hash === hash && res.summary ? res : templateSummaryResponse(rollup)))
    .catch(() => templateSummaryResponse(rollup))
    .finally(() => inflightSummaries.delete(hash));
  inflightSummaries.set(hash, p);
  return p;
}
