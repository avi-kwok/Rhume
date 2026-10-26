"use client";

import { Badge } from "@/components/Badge";
import ProvenanceLabel, { SAP_LABEL } from "@/components/ProvenanceLabel";
import { LEARNED_IN_PRODUCTION, type Config } from "@/lib/engine/config";
import { useRhume } from "@/lib/store";

// Production models (concept). Every hand-set rule in the engine is a placeholder for a trained model;
// nothing here is trained. Prototype values are read live from the same config the engine runs on.

const CONCEPT_LABEL = "Concept — not trained in this prototype";

type Where = "prototype" | "production";

const PIPELINE: readonly { title: string; detail: string; where: Where }[] = [
  { title: "Public wastewater + lab data", detail: "Health Infobase, provincial labs", where: "prototype" },
  { title: "SAP Business Data Cloud", detail: "Signals as a data product", where: "production" },
  { title: "SAP Unified Demand Forecast", detail: "Wastewater as a demand-influencing factor (SAP CAR)", where: "production" },
  { title: "Rhume engine", detail: "Stage, EV, sizing. Optimization, stays explainable", where: "prototype" },
  { title: "AI brief", detail: "Writer + critic, no digits", where: "prototype" },
  { title: "Planner approves", detail: "Every scarce-sensitive move", where: "prototype" },
  { title: "S/4HANA stock transport order", detail: "Allocation table + STO", where: "production" },
];

const WHERE_LABEL: Record<Where, string> = {
  prototype: "In this prototype",
  production: "Production (concept)",
};

interface ModelRow {
  job: string;
  rule: (cfg: Config) => string;
  model: string;
  training: string;
}

const ROWS: readonly ModelRow[] = [
  {
    job: "Read the signal",
    rule: (c) => `Wastewater ≥ ${c.wwRiseMultiple}× baseline and ${c.wwConsecutive} rising readings in a row`,
    model: LEARNED_IN_PRODUCTION.wwRiseMultiple!,
    training: "Wastewater history per site, with rainfall and sampling metadata",
  },
  {
    job: "Forecast demand lift",
    rule: (c) =>
      `Fixed multiplier by stage: watch ${c.stageMultiplier.watch}×, rising ${c.stageMultiplier.rising}×, peaking ${c.stageMultiplier.peaking}×, falling ${c.stageMultiplier.falling}×`,
    model: LEARNED_IN_PRODUCTION["stageMultiplier.rising"]!,
    training: "Store sales history in SAP CAR plus wastewater by region and week",
  },
  {
    job: "Confidence",
    rule: (c) => `Surge probability: high ${c.probability.high}, medium ${c.probability.medium}, low ${c.probability.low}`,
    model: LEARNED_IN_PRODUCTION["probability.high"]!,
    training: "Every past card: confidence at the time vs whether the surge arrived",
  },
  {
    job: "Wave timing",
    rule: (c) => `A neighbour peaking in the last ${c.neighbourWindowDays} days counts as a signal`,
    model: LEARNED_IN_PRODUCTION.neighbourWindowDays!,
    training: "Wastewater and lab peak dates by region across past seasons",
  },
  {
    job: "Lost sales share",
    rule: (c) => `${c.lostShare} of unmet demand is lost (not substituted)`,
    model: LEARNED_IN_PRODUCTION.lostShare!,
    training: "POS baskets during stockouts: substitute bought vs walked away",
  },
  {
    job: "Store split",
    rule: () => "Split by region: stores × child-share index (allocation table)",
    model: "Store-level share of the regional lift",
    training: "Store sales history",
  },
];

function PipelineStep({ title, detail, where }: { title: string; detail: string; where: Where }) {
  const production = where === "production";
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col gap-1 self-stretch rounded-[4px] border px-2.5 py-2 ${
        production ? "border-dashed border-muted bg-bg" : "border-ink bg-panel"
      }`}
    >
      <span className={`text-[10px] leading-3 tracking-[0.08em] uppercase ${production ? "text-muted" : "text-accent"}`}>
        {WHERE_LABEL[where]}
      </span>
      <span className="text-[13px] leading-4 font-semibold text-ink">{title}</span>
      <span className="text-[11px] leading-4 text-muted">{detail}</span>
    </div>
  );
}

/** Production models: what each prototype rule becomes in production, and where the forecast runs (SAP). */
export default function ModelsPage() {
  const cfg = useRhume((s) => s.cfg);
  const season = useRhume((s) => s.season);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-label">Models</p>
          <h1 className="text-[22px] leading-7 font-semibold text-ink">Production models</h1>
          <p className="text-sm text-muted">
            Code decides, AI explains. In production, the rules below become trained models, and the demand forecast runs in SAP.
          </p>
        </div>
        <Badge tone="outline">{CONCEPT_LABEL}</Badge>
      </div>

      <section className="card p-4" aria-labelledby="pipeline">
        <h2 id="pipeline" className="section-label mb-3">
          Pipeline
        </h2>
        <ol className="flex items-stretch gap-1.5" aria-label="Pipeline from public signals to an SAP stock transport order">
          {PIPELINE.map((step, i) => (
            <li key={step.title} className="flex min-w-0 flex-1 items-center gap-1.5">
              <PipelineStep {...step} />
              {i < PIPELINE.length - 1 && (
                <span aria-hidden className="shrink-0 text-sm text-muted">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="block h-3 w-5 rounded-[2px] border border-ink bg-panel" /> In this prototype
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="block h-3 w-5 rounded-[2px] border border-dashed border-muted" /> Production (concept)
          </span>
          <span>The prototype stands in for the SAP forecast with the stage multipliers below, and for S/4HANA with a simulated order.</span>
        </p>
      </section>

      <section className="card p-4" aria-labelledby="models-table">
        <h2 id="models-table" className="section-label mb-2">
          Rule today → model in production
        </h2>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] tracking-[0.08em] text-muted uppercase">
              <th scope="col" className="w-[14%] py-1.5 pr-3 font-medium">Job</th>
              <th scope="col" className="w-[30%] py-1.5 pr-3 font-medium">Prototype rule (live value)</th>
              <th scope="col" className="w-[30%] py-1.5 pr-3 font-medium">Production model</th>
              <th scope="col" className="py-1.5 font-medium">Training data</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.job} className="border-b border-line align-top last:border-b-0">
                <th scope="row" className="py-2 pr-3 font-semibold text-ink">
                  {row.job}
                </th>
                <td className="py-2 pr-3 text-ink tabular">{row.rule(cfg)}</td>
                <td className="py-2 pr-3 text-ink">{row.model}</td>
                <td className="py-2 text-muted">{row.training}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          Move sizing stays an expected-value optimization, not ML, so every number stays explainable. Prototype values are read from Settings.
        </p>
      </section>

      <section className="card p-4" aria-labelledby="why-not">
        <h2 id="why-not" className="section-label mb-1">
          Why not train it now
        </h2>
        <p className="text-sm text-ink">
          Canadian wastewater history covers about 3 seasons × 5 regions, roughly 15 region-seasons, and we have no Shoppers sales
          data. The prototype season data is reconstructed, so a model trained on it would only learn our own assumptions.
        </p>
      </section>

      <footer className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-line pt-2 text-xs text-muted">
        <span>
          <span className="font-medium text-ink">Production models:</span> {CONCEPT_LABEL}
        </span>
        <span>
          <span className="font-medium text-ink">SAP Business Data Cloud, Unified Demand Forecast, S/4HANA:</span> {SAP_LABEL}
        </span>
        <ProvenanceLabel source="wastewater" season={season} />
        <ProvenanceLabel source="lab" season={season} />
      </footer>
    </div>
  );
}
