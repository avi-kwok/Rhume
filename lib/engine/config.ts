// Engine configuration (DESIGN.md §8). Every value is an assumption, editable in Settings (P1).

import type { Confidence, Stage } from "./types";

export type SourceKind = "own_dc" | "other_dc";

export interface Config {
  // Signals
  wwRiseMultiple: number;
  wwConsecutive: number;
  labOnsetPct: number;
  neighbourWindowDays: number;
  probability: Record<Confidence, number>;
  // Planning
  stageMultiplier: Record<Stage, number>;
  targetCoverStore: number;
  targetCoverDc: number;
  dcReserveShare: number;
  donorFloorDays: number;
  unitsPerCase: number;
  // Governance
  autoApproveCostCad: number;
  // Economics
  evHorizonDays: number;
  price: number;
  margin: number;
  lostShare: number;
  carryingRate: number;
  costPerCase: Record<SourceKind, number>;
  // Replenishment
  storeCoverDays: number;
  dcCoverDays: number;
  dcToStoreLeadDays: number;
  supplierLeadDays: number;
  transferLeadOwnToStoresDays: number;
  transferLeadDcToDcDays: number;
  // Demand
  surgeAmplitude: number;
  // Scenario
  supplyCapped: boolean;
  supplyCapShare: number;
  // Stores
  storeTaskCapMinutes: number;
}

export const DEFAULT_CONFIG: Readonly<Config> = Object.freeze({
  wwRiseMultiple: 1.5,
  wwConsecutive: 2,
  labOnsetPct: 5,
  neighbourWindowDays: 28,
  probability: { high: 0.85, medium: 0.65, low: 0.4 },
  stageMultiplier: { watch: 1.3, rising: 2.0, peaking: 3.0, falling: 1.5, quiet: 1.0 },
  targetCoverStore: 21,
  targetCoverDc: 21,
  dcReserveShare: 0.2,
  donorFloorDays: 21,
  unitsPerCase: 24,
  autoApproveCostCad: 2000,
  evHorizonDays: 21,
  price: 12.0,
  margin: 0.35,
  lostShare: 0.4,
  carryingRate: 0.15,
  costPerCase: { own_dc: 3.5, other_dc: 9.0 },
  storeCoverDays: 14,
  dcCoverDays: 35,
  dcToStoreLeadDays: 7,
  supplierLeadDays: 21,
  transferLeadOwnToStoresDays: 2,
  transferLeadDcToDcDays: 4,
  surgeAmplitude: 2.5,
  supplyCapped: false,
  supplyCapShare: 0.7,
  storeTaskCapMinutes: 20,
}) as Readonly<Config>;

/** A deep, mutable copy of the defaults ("Reset to defaults"). */
export function defaultConfig(): Config {
  return structuredClone(DEFAULT_CONFIG) as Config;
}

// ---------------------------------------------------------------------------
// Metadata for the Settings page.

export type ConfigGroup = "Signals" | "Planning" | "Governance" | "Economics" | "Replenishment" | "Demand" | "Scenario" | "Stores";

export const CONFIG_GROUPS: readonly ConfigGroup[] = [
  "Signals", "Planning", "Governance", "Economics", "Replenishment", "Demand", "Scenario", "Stores",
];

/** Dot path into Config, e.g. "wwRiseMultiple" or "probability.high". */
export type ConfigPath =
  | Exclude<keyof Config, "probability" | "stageMultiplier" | "costPerCase">
  | `probability.${Confidence}`
  | `stageMultiplier.${Stage}`
  | `costPerCase.${SourceKind}`;

export interface ConfigFieldMeta {
  path: ConfigPath;
  label: string;
  group: ConfigGroup;
  kind: "number" | "boolean";
  unit?: "×" | "%" | "days" | "units" | "C$" | "share" | "readings" | "minutes" | "probability";
  min?: number;
  max?: number;
  step?: number;
  /** Every engine parameter is a stated assumption. */
  tag: "Assumption";
}

const f = (
  path: ConfigPath, label: string, group: ConfigGroup, unit: ConfigFieldMeta["unit"], min: number, max: number, step: number,
): ConfigFieldMeta => ({ path, label, group, kind: "number", unit, min, max, step, tag: "Assumption" });

export const CONFIG_FIELDS: readonly ConfigFieldMeta[] = [
  f("wwRiseMultiple", "Wastewater rise multiple vs baseline", "Signals", "×", 1, 5, 0.1),
  f("wwConsecutive", "Consecutive rising wastewater readings", "Signals", "readings", 1, 5, 1),
  f("labOnsetPct", "Lab positivity onset line", "Signals", "%", 1, 20, 0.5),
  f("neighbourWindowDays", "Neighbour peaking window", "Signals", "days", 7, 56, 1),
  f("probability.high", "Surge probability, high confidence", "Signals", "probability", 0, 1, 0.05),
  f("probability.medium", "Surge probability, medium confidence", "Signals", "probability", 0, 1, 0.05),
  f("probability.low", "Surge probability, low confidence", "Signals", "probability", 0, 1, 0.05),
  f("stageMultiplier.watch", "Demand multiplier, watch", "Planning", "×", 0.5, 5, 0.1),
  f("stageMultiplier.rising", "Demand multiplier, rising", "Planning", "×", 0.5, 5, 0.1),
  f("stageMultiplier.peaking", "Demand multiplier, peaking", "Planning", "×", 0.5, 5, 0.1),
  f("stageMultiplier.falling", "Demand multiplier, falling", "Planning", "×", 0.5, 5, 0.1),
  f("stageMultiplier.quiet", "Demand multiplier, quiet", "Planning", "×", 0.5, 5, 0.1),
  f("targetCoverStore", "Target store cover", "Planning", "days", 7, 42, 1),
  f("targetCoverDc", "Target DC cover", "Planning", "days", 7, 56, 1),
  f("dcReserveShare", "Own DC reserve share", "Planning", "share", 0, 0.9, 0.05),
  f("donorFloorDays", "Donor DC floor", "Planning", "days", 0, 42, 1),
  f("unitsPerCase", "Units per case", "Planning", "units", 1, 96, 1),
  f("autoApproveCostCad", "Routine value threshold", "Governance", "C$", 0, 50000, 100),
  f("evHorizonDays", "Expected value horizon", "Economics", "days", 7, 42, 1),
  f("price", "Unit price", "Economics", "C$", 1, 50, 0.5),
  f("margin", "Gross margin", "Economics", "share", 0, 0.9, 0.01),
  f("lostShare", "Share of unmet demand lost (not substituted)", "Economics", "share", 0, 1, 0.05),
  f("carryingRate", "Annual carrying rate", "Economics", "share", 0, 1, 0.01),
  f("costPerCase.own_dc", "Transfer cost per case, own DC", "Economics", "C$", 0, 50, 0.5),
  f("costPerCase.other_dc", "Transfer cost per case, other DC", "Economics", "C$", 0, 50, 0.5),
  f("storeCoverDays", "Store replenishment cover", "Replenishment", "days", 3, 42, 1),
  f("dcCoverDays", "DC replenishment cover", "Replenishment", "days", 7, 70, 1),
  f("dcToStoreLeadDays", "Routine DC → store lead time", "Replenishment", "days", 1, 21, 1),
  f("supplierLeadDays", "Supplier → DC lead time", "Replenishment", "days", 1, 60, 1),
  f("transferLeadOwnToStoresDays", "Transfer lead, own DC → stores", "Replenishment", "days", 1, 14, 1),
  f("transferLeadDcToDcDays", "Transfer lead, DC → DC", "Replenishment", "days", 1, 21, 1),
  f("surgeAmplitude", "Surge demand amplitude", "Demand", "×", 0, 6, 0.1),
  { path: "supplyCapped", label: "Supply-capped season (2022-like)", group: "Scenario", kind: "boolean", tag: "Assumption" },
  f("supplyCapShare", "Supplier fill share when capped", "Scenario", "share", 0, 1, 0.05),
  f("storeTaskCapMinutes", "Store task cap per arrival", "Stores", "minutes", 5, 60, 1),
];

export function getConfigValue(cfg: Config, path: ConfigPath): number | boolean {
  const [head, tail] = path.split(".") as [keyof Config, string | undefined];
  const v = cfg[head];
  return tail === undefined ? (v as number | boolean) : (v as unknown as Record<string, number>)[tail];
}

/** Immutable update by path. */
export function setConfigValue(cfg: Config, path: ConfigPath, value: number | boolean): Config {
  const [head, tail] = path.split(".") as [keyof Config, string | undefined];
  if (tail === undefined) return { ...cfg, [head]: value };
  return { ...cfg, [head]: { ...(cfg[head] as object), [tail]: value } };
}
