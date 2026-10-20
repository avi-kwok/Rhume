// Season loader (DESIGN.md §6). Works in the browser and in Node: every JSON is imported statically.
// The optional real season comes from lib/data/seasonIndex.generated.ts, which only imports
// data/season-2023-24.real.json when that file existed at generation time.

import { z } from "zod";
import type { Season } from "../engine/types";
import reconstructed2023 from "../../data/season-2023-24.reconstructed.json";
import synchronized2024 from "../../data/season-2024-25.synchronized.json";
import { REAL_SEASON_2023_24_RAW } from "./seasonIndex.generated";

export type SeasonId = "2023-24" | "2024-25";
export const DEFAULT_SEASON_ID: SeasonId = "2023-24";

const point = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), value: z.number().finite() });
const labPoint = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), positivity: z.number().finite() });
const byRegion = <T extends z.ZodTypeAny>(p: T) =>
  z.object({ BC: z.array(p), AB: z.array(p), ON: z.array(p), QC: z.array(p), ATL: z.array(p) });

export const SeasonSchema = z.object({
  id: z.string(),
  label: z.string(),
  mode: z.enum(["reconstructed", "real"]),
  sourceNote: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  wastewater: byRegion(point),
  labTrue: byRegion(labPoint),
  labReported: byRegion(labPoint),
});

const RECONSTRUCTED_2023_24 = reconstructed2023 as Season;
const SYNCHRONIZED_2024_25 = synchronized2024 as Season;

function parseReal(raw: unknown): Season | null {
  if (raw == null) return null;
  const parsed = SeasonSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[rhume] data/season-2023-24.real.json is malformed; using reconstructed data.", parsed.error.issues[0]);
    return null;
  }
  return { ...parsed.data, mode: "real" };
}

const REAL_2023_24 = parseReal(REAL_SEASON_2023_24_RAW);

/** Load a season. For 2023–24 the real export is preferred when present. */
export function loadSeason(id: SeasonId = DEFAULT_SEASON_ID): Season {
  if (id === "2024-25") return SYNCHRONIZED_2024_25;
  return REAL_2023_24 ?? RECONSTRUCTED_2023_24;
}

/** Always the reconstructed 2023–24 season, regardless of whether real data is present. */
export function loadReconstructedSeason(): Season {
  return RECONSTRUCTED_2023_24;
}

export function isRealDataLoaded(): boolean {
  return REAL_2023_24 !== null;
}

export const SEASON_OPTIONS: readonly { id: SeasonId; label: string }[] = [
  { id: "2023-24", label: "2023–24" },
  { id: "2024-25", label: "2024–25 (synchronized peaks, reconstructed)" },
];
