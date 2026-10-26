// POST /api/exec-summary  { rollup: Rollup }  →  SummaryResponse (DESIGN.md §9.8).
// The roll-up is typed into a pack (same Field type) server-side, so it shares placeholders,
// the validator and the cache with briefs. Template fallback on any failure. Node runtime.

import { getSummary } from "@/lib/ai/client";
import { parseRollupBody, readJson } from "@/lib/ai/request";
import type { SummaryResponse } from "@/lib/ai/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const rollup = parseRollupBody(body.value);
  if (!rollup.ok) return Response.json({ error: rollup.error }, { status: rollup.status });

  const { summary, rendered, source, critic, model, hash } = await getSummary(rollup.value);
  const res: SummaryResponse = { summary, rendered, source, critic, model, hash };
  return Response.json(res, { headers: { "Cache-Control": "no-store" } });
}
