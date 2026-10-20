// Brief cache (DESIGN.md §9.5, §9.9). Server-only.
// - In-memory Map, seeded at startup from data/briefs-cache.json (statically imported, so the
//   committed file ships inside the deployed bundle with no file-system access needed).
// - The persistent file holds AI results only, keyed by evidence-pack hash. It is appended in
//   development (and by `npm run prewarm`), never in production or tests, and written atomically.

import { promises as fs } from "node:fs";
import path from "node:path";
import seed from "../../data/briefs-cache.json";
import type { BriefResponse, SummaryResponse } from "./schema";

export type CachedResponse = BriefResponse | SummaryResponse;
type CacheFile = Record<string, CachedResponse>;

export const CACHE_FILE = path.join(process.cwd(), "data", "briefs-cache.json");

const memory = new Map<string, CachedResponse>();

function isEntry(v: unknown): v is CachedResponse {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.hash === "string" && typeof o.model === "string" && (typeof o.brief === "object" || typeof o.summary === "object");
}

for (const [hash, entry] of Object.entries(seed as unknown as Record<string, unknown>)) {
  if (isEntry(entry) && entry.hash === hash) memory.set(hash, { ...entry, source: "ai" });
}

export function isBriefEntry(e: CachedResponse | undefined): e is BriefResponse {
  return !!e && "brief" in e;
}

export function isSummaryEntry(e: CachedResponse | undefined): e is SummaryResponse {
  return !!e && "summary" in e;
}

export function cacheGet(hash: string): CachedResponse | undefined {
  return memory.get(hash);
}

/** Store in memory; AI results are also persisted to data/briefs-cache.json when persistence is on. */
export function cacheSet(entry: CachedResponse): Promise<void> {
  memory.set(entry.hash, entry);
  if (entry.source === "ai" && persistEnabled()) return persist(entry);
  return Promise.resolve();
}

export function cacheSize(): number {
  return memory.size;
}

/** Number of AI entries (seeded from the file or generated in this process). */
export function cachedAiCount(): number {
  let n = 0;
  for (const e of memory.values()) if (e.source === "ai") n++;
  return n;
}

/** Development only (`next dev`, or scripts run with tsx where NODE_ENV is unset); never production or tests. */
export function persistEnabled(): boolean {
  const env = process.env.NODE_ENV;
  if (process.env.RHUME_BRIEF_CACHE_WRITE === "0") return false;
  return env !== "production" && env !== "test";
}

let writeChain: Promise<void> = Promise.resolve();

async function readFileEntries(): Promise<CacheFile> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: CacheFile = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (isEntry(v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** Merge one entry into the file (re-reading it first, so concurrent writers never drop entries). Atomic rename. */
function persist(entry: CachedResponse): Promise<void> {
  writeChain = writeChain
    .then(async () => {
      const current = await readFileEntries();
      current[entry.hash] = { ...entry, source: "ai" };
      const sorted: CacheFile = {};
      for (const k of Object.keys(current).sort()) sorted[k] = current[k];
      const tmp = `${CACHE_FILE}.${process.pid}.${Date.now()}.tmp`;
      await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
      await fs.writeFile(tmp, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
      await fs.rename(tmp, CACHE_FILE);
    })
    .catch((err: unknown) => {
      console.warn("[rhume] could not write data/briefs-cache.json:", err instanceof Error ? err.message : err);
    });
  return writeChain;
}

/** Ensure data/briefs-cache.json exists (as `{}`). Used by the prewarm script. */
export async function ensureCacheFile(): Promise<void> {
  try {
    await fs.access(CACHE_FILE);
  } catch {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, "{}\n", "utf8");
  }
}
