// The signed-in planner persona for the prototype and the demo story (header chip, decision log,
// SAP order "Created by", brief approval line). Display only: nothing in the engine depends on it.

import type { RegionId } from "./engine/types";

export const PERSONA = {
  name: "Mia Lily",
  role: "Replenishment Planner",
  regionId: "ATL" as RegionId,
  regionName: "Atlantic",
  category: "Children's fever and cold medicine",
} as const;

/** "Mia Lily · Replenishment Planner · Atlantic" (header chip). */
export const PERSONA_CHIP = `${PERSONA.name} · ${PERSONA.role} · ${PERSONA.regionName}`;
