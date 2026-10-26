// Request parsing for the AI API routes. Server-side checks that a posted pack is well formed and
// that its hash matches its fields, so the cache can never be keyed by a forged hash.

import { z } from "zod";
import { EVIDENCE_KEYS, hashFields, type EvidencePack } from "../engine/evidence";
import { Rollup } from "./schema";

export const MAX_BODY_BYTES = 64 * 1024;

const FieldSchema = z.object({
  value: z.union([z.number().finite(), z.string().max(600), z.boolean(), z.array(z.string().max(200)).max(20)]),
  type: z.enum(["int", "pct", "cad", "date", "days", "text", "list", "bool"]),
  source: z.string().max(400),
});

const PackSchema = z.object({
  proposalId: z.string().min(1).max(120),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  fields: z.record(z.string().max(64), FieldSchema),
});

export type ParseResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export async function readJson(request: Request): Promise<ParseResult<unknown>> {
  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) return { ok: false, status: 413, error: "Request body too large" };
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, error: "Could not read request body" };
  }
  if (text.length > MAX_BODY_BYTES) return { ok: false, status: 413, error: "Request body too large" };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "Body must be JSON" };
  }
}

/** Body `{ pack }`: an evidence pack with every required key and a hash that matches its fields. */
export function parsePackBody(body: unknown): ParseResult<EvidencePack> {
  const parsed = z.object({ pack: PackSchema }).safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: `Invalid pack: ${parsed.error.issues[0]?.path.join(".") ?? ""} ${parsed.error.issues[0]?.message ?? ""}`.trim() };
  const pack = parsed.data.pack as EvidencePack;
  const missing = EVIDENCE_KEYS.filter((k) => !(k in pack.fields));
  if (missing.length) return { ok: false, status: 400, error: `Invalid pack: missing fields ${missing.join(", ")}` };
  const extra = Object.keys(pack.fields).filter((k) => !(EVIDENCE_KEYS as readonly string[]).includes(k));
  if (extra.length) return { ok: false, status: 400, error: `Invalid pack: unknown fields ${extra.join(", ")}` };
  if (hashFields(pack.fields) !== pack.hash) return { ok: false, status: 400, error: "Invalid pack: hash does not match fields" };
  return { ok: true, value: pack };
}

/** Body `{ rollup }` (or the roll-up fields at the top level). */
export function parseRollupBody(body: unknown): ParseResult<Rollup> {
  const candidate = body && typeof body === "object" && "rollup" in body ? (body as { rollup: unknown }).rollup : body;
  const parsed = Rollup.safeParse(candidate);
  if (!parsed.success) return { ok: false, status: 400, error: `Invalid roll-up: ${parsed.error.issues[0]?.path.join(".") ?? ""} ${parsed.error.issues[0]?.message ?? ""}`.trim() };
  return { ok: true, value: parsed.data };
}
