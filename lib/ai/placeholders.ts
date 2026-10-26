// Placeholders (DESIGN.md §9.2). Syntax {{key}}; code fills each from the evidence pack with
// formatField. The model never writes a number: every figure in a rendered brief comes from here.

import type { EvidencePack, Field } from "../engine/evidence";
import { formatField } from "../format";
import type { Brief, RenderedBrief } from "./schema";

/** Any {{...}} token (used by the validator to find and strip tokens). */
export const ANY_TOKEN_RE = /\{\{([^{}]*)\}\}/g;
/** A well-formed placeholder: {{key}}, optional inner spaces. */
const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Minimal pack shape the renderer needs (brief packs and summary packs both fit). */
export type PackLike = Pick<EvidencePack, "fields">;

export type TextSegment = { text: string };
export type EvidenceSegment = { key: string; display: string; raw: Field["value"]; type: Field["type"]; source: string };
export type Segment = TextSegment | EvidenceSegment;

export function isEvidenceSegment(s: Segment): s is EvidenceSegment {
  return "key" in s;
}

/** Keys of every {{...}} token in the text, trimmed, in order (may include unknown keys). */
export function placeholderKeys(text: string): string[] {
  return [...text.matchAll(ANY_TOKEN_RE)].map((m) => m[1].trim());
}

/**
 * Split text into plain-text and evidence segments. In the UI, wrap each evidence segment in
 * `<span data-evidence={key}>` with a tooltip showing key, raw value and source.
 * A placeholder whose key is not in the pack stays as literal text (the validator rejects it upstream).
 */
export function renderSegments(text: string, pack: PackLike): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  const pushText = (t: string) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev && !isEvidenceSegment(prev)) prev.text += t;
    else out.push({ text: t });
  };
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const start = m.index ?? 0;
    pushText(text.slice(last, start));
    const key = m[1];
    const field = Object.prototype.hasOwnProperty.call(pack.fields, key) ? pack.fields[key] : undefined;
    if (field) out.push({ key, display: formatField(field), raw: field.value, type: field.type, source: field.source });
    else pushText(m[0]);
    last = start + m[0].length;
  }
  pushText(text.slice(last));
  return out;
}

/** Join segments back into a display string. */
export function segmentsToString(segments: readonly Segment[]): string {
  return segments.map((s) => (isEvidenceSegment(s) ? s.display : s.text)).join("");
}

/** render(text, pack): replace each {{key}} with format(field). */
export function render(text: string, pack: PackLike): string {
  return segmentsToString(renderSegments(text, pack));
}

/** Render every string field of a brief. */
export function renderBrief(brief: Brief, pack: PackLike): RenderedBrief {
  return {
    recommendation: render(brief.recommendation, pack),
    why_now: brief.why_now.map((t) => render(t, pack)),
    options_commentary: render(brief.options_commentary, pack),
    evidence_against: brief.evidence_against.map((t) => render(t, pack)),
    what_would_change: render(brief.what_would_change, pack),
    exec_one_liner: render(brief.exec_one_liner, pack),
    recommended_option_echo: brief.recommended_option_echo,
  };
}

export type BriefSegments = {
  recommendation: Segment[];
  why_now: Segment[][];
  options_commentary: Segment[];
  evidence_against: Segment[][];
  what_would_change: Segment[];
  exec_one_liner: Segment[];
};

/** Segments for every string field of a brief, for evidence tooltips in the UI. */
export function renderBriefSegments(brief: Brief, pack: PackLike): BriefSegments {
  return {
    recommendation: renderSegments(brief.recommendation, pack),
    why_now: brief.why_now.map((t) => renderSegments(t, pack)),
    options_commentary: renderSegments(brief.options_commentary, pack),
    evidence_against: brief.evidence_against.map((t) => renderSegments(t, pack)),
    what_would_change: renderSegments(brief.what_would_change, pack),
    exec_one_liner: renderSegments(brief.exec_one_liner, pack),
  };
}

/** Every string in a brief, flattened (for validation and scans). */
export function briefStrings(brief: Pick<Brief, "recommendation" | "why_now" | "options_commentary" | "evidence_against" | "what_would_change" | "exec_one_liner">): { path: string; text: string }[] {
  return [
    { path: "recommendation", text: brief.recommendation },
    ...brief.why_now.map((text, i) => ({ path: `why_now[${i}]`, text })),
    { path: "options_commentary", text: brief.options_commentary },
    ...brief.evidence_against.map((text, i) => ({ path: `evidence_against[${i}]`, text })),
    { path: "what_would_change", text: brief.what_would_change },
    { path: "exec_one_liner", text: brief.exec_one_liner },
  ];
}
