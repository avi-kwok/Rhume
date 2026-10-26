"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { create } from "zustand";
import type { Field } from "@/lib/engine/evidence";
import { isEvidenceSegment, type Segment } from "@/lib/ai/placeholders";

// Evidence spans (DESIGN.md §9.2): every rendered number is a <span data-evidence="key"> with a
// tooltip showing the key, raw value and source. Clicking one reports it to `onInspect`, which the
// brief drawer uses to show the evidence-pack field. The tooltip is drawn by one fixed-position
// layer so it is never clipped by a scrolling panel.

export interface EvidenceInfo {
  key: string;
  display: string;
  raw: Field["value"];
  type: Field["type"] | "engine";
  source: string;
  /** False for engine values shown alongside the brief that are not part of the evidence pack. */
  inPack: boolean;
}

interface TipState {
  tip: { text: string; x: number; top: number; bottom: number } | null;
  show(text: string, rect: DOMRect): void;
  hide(): void;
}

const useTip = create<TipState>()((set) => ({
  tip: null,
  show: (text, rect) => set({ tip: { text, x: rect.left, top: rect.top, bottom: rect.bottom } }),
  hide: () => set({ tip: null }),
}));

export function rawText(raw: Field["value"]): string {
  if (Array.isArray(raw)) return JSON.stringify(raw);
  if (typeof raw === "string") return JSON.stringify(raw);
  return String(raw);
}

export function tipText(info: Pick<EvidenceInfo, "key" | "raw" | "source" | "inPack">): string {
  return `${info.key} = ${rawText(info.raw)}\nSource: ${info.source}${info.inPack ? "" : "\nEngine value (not in the evidence pack)"}`;
}

export function Ev({ info, onInspect, children }: { info: EvidenceInfo; onInspect?: (info: EvidenceInfo) => void; children?: ReactNode }) {
  const show = useTip((s) => s.show);
  const hide = useTip((s) => s.hide);
  const text = tipText(info);
  const open = (e: MouseEvent<HTMLSpanElement> | { currentTarget: HTMLSpanElement }) => show(text, e.currentTarget.getBoundingClientRect());
  const activate = () => onInspect?.(info);
  return (
    <span
      data-evidence={info.key}
      role={onInspect ? "button" : undefined}
      tabIndex={0}
      aria-label={`${info.display}. ${text.replace(/\n/g, ". ")}`}
      className="evidence"
      onMouseEnter={open}
      onMouseLeave={hide}
      onFocus={(e) => open(e)}
      onBlur={hide}
      onClick={activate}
      onKeyDown={(e: KeyboardEvent<HTMLSpanElement>) => {
        if (onInspect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          e.stopPropagation();
          activate();
        }
      }}
    >
      {children ?? info.display}
    </span>
  );
}

/** Render placeholder segments: plain text as-is, every evidence segment as an <Ev>. */
export function Segments({ segments, onInspect }: { segments: readonly Segment[]; onInspect?: (info: EvidenceInfo) => void }) {
  return (
    <>
      {segments.map((seg, i) =>
        isEvidenceSegment(seg) ? (
          <Ev key={i} info={{ key: seg.key, display: seg.display, raw: seg.raw, type: seg.type, source: seg.source, inPack: true }} onInspect={onInspect} />
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

/** Pack field → EvidenceInfo. */
export function packInfo(key: string, field: Field, display: string): EvidenceInfo {
  return { key, display, raw: field.value, type: field.type, source: field.source, inPack: true };
}

/** One fixed tooltip for every evidence span. Mounted once in the root layout. */
export function EvidenceTooltipLayer() {
  const tip = useTip((s) => s.tip);
  if (!tip) return null;
  const left = Math.max(8, Math.min(tip.x, (typeof window !== "undefined" ? window.innerWidth : 1280) - 328));
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[100] max-w-[320px] rounded-[4px] bg-ink px-2 py-1.5 text-[11px] leading-4 whitespace-pre-line text-white"
      style={tip.top > 90 ? { left, top: tip.top - 6, transform: "translateY(-100%)" } : { left, top: tip.bottom + 6 }}
    >
      {tip.text}
    </div>
  );
}
