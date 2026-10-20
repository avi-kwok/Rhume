import type { ReactNode } from "react";
import type { Confidence, Stage } from "@/lib/engine/types";

export const STAGE_LABEL: Record<Stage, string> = {
  quiet: "Quiet",
  watch: "Watch",
  rising: "Rising",
  peaking: "Peaking",
  falling: "Falling",
};

/** Stage colours (DESIGN.md §10.3). Always rendered with the text label, never colour alone. */
const STAGE_CLASS: Record<Stage, string> = {
  quiet: "bg-stage-quiet text-stage-quiet-text",
  watch: "bg-stage-watch text-stage-watch-text",
  rising: "bg-stage-rising text-stage-rising-text",
  peaking: "bg-stage-peaking text-stage-peaking-text",
  falling: "bg-stage-falling text-stage-falling-text",
};

export function stageClass(stage: Stage): string {
  return STAGE_CLASS[stage];
}

type Tone = "neutral" | "accent" | "outline" | "ink";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-line bg-panel text-ink",
  accent: "border-accent bg-accent text-white",
  outline: "border-ink bg-bg text-ink",
  ink: "border-ink bg-ink text-white",
};

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-[4px] border px-2 py-0.5 text-xs leading-4 whitespace-nowrap ${TONE_CLASS[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function StageBadge({ stage, className = "" }: { stage: Stage; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[4px] px-2 py-0.5 text-[11px] leading-4 font-semibold tracking-[0.08em] uppercase whitespace-nowrap ${STAGE_CLASS[stage]} ${className}`}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

const PIP_FILLED: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

/** Three-segment confidence pip plus the word, e.g. ▮▮▯ medium. */
export function ConfidencePip({ confidence, showLabel = true }: { confidence: Confidence; showLabel?: boolean }) {
  const filled = PIP_FILLED[confidence];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={`${confidence} confidence`}>
      <span aria-hidden className="inline-flex gap-[2px]">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`block h-2.5 w-1.5 rounded-[1px] ${i < filled ? "bg-ink" : "bg-line"}`} />
        ))}
      </span>
      {showLabel ? <span>{confidence}</span> : <span className="sr-only">{confidence} confidence</span>}
    </span>
  );
}
