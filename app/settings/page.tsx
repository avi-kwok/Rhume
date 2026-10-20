"use client";

import { useState } from "react";
import { Badge } from "@/components/Badge";
import ProvenanceLabel from "@/components/ProvenanceLabel";
import {
  CONFIG_FIELDS,
  CONFIG_GROUPS,
  DEFAULT_CONFIG,
  getConfigValue,
  setConfigValue,
  type ConfigFieldMeta,
} from "@/lib/engine/config";
import { compareOutcomes } from "@/lib/engine/outcomes";
import { formatCad, formatInt } from "@/lib/format";
import { useRhume } from "@/lib/store";

const GROUP_NOTE: Record<(typeof CONFIG_GROUPS)[number], string> = {
  Signals: "When a signal check passes, and how likely a surge is at each confidence.",
  Planning: "How much stock a card proposes and where it may come from.",
  Governance: "What counts as a routine move.",
  Economics: "Inputs to the expected-value formula and the outcome table.",
  Replenishment: "Today's sales-following replenishment, used by both policies.",
  Demand: "How strongly the simulated illness curve lifts demand.",
  Scenario: "The supply-capped (2022-like) scenario.",
  Stores: "Store task cap on arrival.",
};

function unitLabel(meta: ConfigFieldMeta): string {
  switch (meta.unit) {
    case "share":
      return "share (0–1)";
    case "probability":
      return "probability (0–1)";
    default:
      return meta.unit ?? "";
  }
}

function NumberField({ meta, value, onCommit }: { meta: ConfigFieldMeta; value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [synced, setSynced] = useState(value);
  // An outside change (Reset to defaults) replaces the draft.
  if (value !== synced) {
    setSynced(value);
    if (Number(text) !== value) setText(String(value));
  }
  const n = Number(text);
  const valid = text.trim() !== "" && Number.isFinite(n) && (meta.min === undefined || n >= meta.min) && (meta.max === undefined || n <= meta.max);
  const id = `cfg-${meta.path}`;
  return (
    <span className="flex items-center gap-1.5">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={text}
        aria-invalid={!valid}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const v = Number(t);
          if (t.trim() !== "" && Number.isFinite(v) && (meta.min === undefined || v >= meta.min) && (meta.max === undefined || v <= meta.max)) {
            setSynced(v);
            onCommit(v);
          }
        }}
        className={`w-24 rounded-[4px] border px-2 py-1 text-right text-sm text-ink tabular ${valid ? "border-line" : "border-accent"}`}
      />
      <span className="w-24 text-[11px] text-muted">{unitLabel(meta)}</span>
    </span>
  );
}

/** Settings (F14, PRD §7.6): every threshold from DESIGN.md §8, each an assumption. Changes re-run the engine at once. */
export default function SettingsPage() {
  const cfg = useRhume((s) => s.cfg);
  const season = useRhume((s) => s.season);
  const setCfg = useRhume((s) => s.setCfg);
  const resetCfg = useRhume((s) => s.resetCfg);
  const { sq, rh, rhAuto } = useRhume((s) => s.results);

  const changed = CONFIG_FIELDS.filter((m) => getConfigValue(cfg, m.path) !== getConfigValue(DEFAULT_CONFIG, m.path)).length;
  const current = compareOutcomes(sq, rh, cfg);
  const auto = compareOutcomes(sq, rhAuto, cfg);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-label">Settings</p>
          <h1 className="text-[22px] leading-7 font-semibold text-ink">Engine assumptions</h1>
          <p className="text-sm text-muted">
            Every value below is an assumption, not a measured fact. Changes re-run the rules engine and both simulations immediately.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted tabular">
            {changed === 0 ? "All defaults" : `${changed} changed from default`}
          </span>
          <button type="button" className="btn btn-secondary" onClick={resetCfg} disabled={changed === 0}>
            Reset to defaults
          </button>
        </div>
      </div>

      <div className="card flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-2.5 text-xs text-muted" aria-live="polite">
        <span className="section-label">Live engine result</span>
        <span>
          Cards this season <span className="font-semibold text-ink tabular">{formatInt(rhAuto.proposals.length)}</span>
        </span>
        <span>
          Stockout region-days: status quo <span className="font-semibold text-ink tabular">{formatInt(current.statusQuo.stockoutRegionDays)}</span> · Rhume
          (all recommended) <span className="font-semibold text-ink tabular">{formatInt(auto.rhume.stockoutRegionDays)}</span>
        </span>
        <span>
          Net benefit (all recommended) <span className="font-semibold text-ink tabular">{formatCad(auto.netBenefitCad)}</span>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {CONFIG_GROUPS.map((group) => {
          const fields = CONFIG_FIELDS.filter((m) => m.group === group);
          return (
            <section key={group} className="card p-4" aria-labelledby={`group-${group}`}>
              <h2 id={`group-${group}`} className="section-label">
                {group}
              </h2>
              <p className="mb-2 text-xs text-muted">{GROUP_NOTE[group]}</p>
              <ul className="flex flex-col">
                {fields.map((meta) => {
                  const value = getConfigValue(cfg, meta.path);
                  const def = getConfigValue(DEFAULT_CONFIG, meta.path);
                  const isChanged = value !== def;
                  const id = `cfg-${meta.path}`;
                  return (
                    <li key={meta.path} className="flex items-center justify-between gap-3 border-t border-line py-1.5 first:border-t-0">
                      <span className="min-w-0">
                        <label htmlFor={id} className={`block text-sm ${isChanged ? "font-semibold text-ink" : "text-ink"}`}>
                          {meta.label}
                        </label>
                        <span id={`${id}-hint`} className="flex items-center gap-1.5 text-[11px] text-muted">
                          <Badge tone="outline" className="px-1.5 py-0 text-[10px]">
                            {meta.tag}
                          </Badge>
                          <span className="tabular">Default {String(def)}</span>
                          {isChanged && <span className="text-accent">· changed</span>}
                        </span>
                      </span>
                      {meta.kind === "boolean" ? (
                        <span className="flex items-center gap-1.5">
                          <input
                            id={id}
                            type="checkbox"
                            checked={value === true}
                            onChange={(e) => setCfg(setConfigValue(cfg, meta.path, e.target.checked))}
                            className="h-4 w-4 accent-[var(--accent)]"
                          />
                          <span className="w-24 text-[11px] text-muted">{value ? "On" : "Off"}</span>
                        </span>
                      ) : (
                        <NumberField meta={meta} value={value as number} onCommit={(v) => setCfg(setConfigValue(useRhume.getState().cfg, meta.path, v))} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <footer className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-line pt-2 text-xs text-muted">
        <span>
          <span className="font-medium text-ink">Settings:</span> assumptions, editable by the planner (DESIGN.md §8)
        </span>
        <ProvenanceLabel source="wastewater" season={season} />
        <ProvenanceLabel source="lab" season={season} />
        <ProvenanceLabel source="stock" season={season} name="Stock, demand and sales" />
      </footer>
    </div>
  );
}
