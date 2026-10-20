// POST /api/brief  { pack: EvidencePack }  →  BriefResponse (DESIGN.md §9.5).
// Node runtime; the API key is read server-side only and never returned.

import { getBrief } from "@/lib/ai/client";
import { parsePackBody, readJson } from "@/lib/ai/request";
import type { BriefResponse } from "@/lib/ai/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const pack = parsePackBody(body.value);
  if (!pack.ok) return Response.json({ error: pack.error }, { status: pack.status });

  const { brief, rendered, source, critic, model, hash } = await getBrief(pack.value);
  const res: BriefResponse = { brief, rendered, source, critic, model, hash };
  return Response.json(res, { headers: { "Cache-Control": "no-store" } });
}
