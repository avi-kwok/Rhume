"use client";

import type { EvidencePack } from "@/lib/engine/evidence";
import type { Option, OptionId, Proposal } from "@/lib/engine/types";
import { formatCad, formatField, formatInt } from "@/lib/format";
import { Ev, packInfo, type EvidenceInfo } from "./Evidence";

export const OPTION_LABEL: Record<OptionId, string> = {
  none: "Do nothing",
  half: "Half move",
  full: "Full move",
};

const ENGINE_SOURCE = "Engine: options compared (lib/engine/ev.ts); cost per case is an assumption (Settings)";

/** Evidence info for one option cell: the pack field when one exists, else the engine value. */
function cellInfo(pack: EvidencePack, proposal: Proposal, option: Option, col: "cases" | "cost" | "ev"): EvidenceInfo {
  const rec = option.id === proposal.recommended;
  const packKey =
    col === "cases"
      ? option.id === "half"
        ? "option_half_cases"
        : option.id === "full"
          ? "option_full_cases"
          : rec
            ? "move_cases"
            : null
      : col === "ev"
        ? `option_${option.id}_ev`
        : rec
          ? "transfer_cost_cad"
          : null;
  if (packKey && pack.fields[packKey]) {
    const f = pack.fields[packKey];
    return packInfo(packKey, f, formatField(f));
  }
  const raw = col === "cases" ? option.cases : col === "cost" ? option.transferCostCad : option.expectedValueCad;
  const field = col === "cases" ? "cases" : col === "cost" ? "transferCostCad" : "expectedValueCad";
  return {
    key: `options.${option.id}.${field}`,
    display: col === "cases" ? formatInt(raw) : formatCad(raw),
    raw: Math.round(raw * 100) / 100,
    type: "engine",
    source: ENGINE_SOURCE,
    inPack: false,
  };
}

/** Do nothing · Half move · Full move with cases, cost and EV from the engine. The recommended row is highlighted. */
export default function OptionsTable({
  proposal,
  pack,
  onInspect,
}: {
  proposal: Proposal;
  pack: EvidencePack;
  onInspect?: (info: EvidenceInfo) => void;
}) {
  const th = "px-2 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase";
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="border-b border-line">
        <tr>
          <th className={`${th} text-left`}>Option</th>
          <th className={`${th} text-right`}>Cases</th>
          <th className={`${th} text-right`}>Cost</th>
          <th className={`${th} text-right`}>Expected value</th>
        </tr>
      </thead>
      <tbody>
        {proposal.options.map((o) => {
          const rec = o.id === proposal.recommended;
          return (
            <tr
              key={o.id}
              aria-current={rec ? "true" : undefined}
              className={`border-b border-line last:border-b-0 ${rec ? "bg-stage-watch/60" : ""}`}
            >
              <td className={`px-2 py-1.5 ${rec ? "border-l-2 border-accent font-semibold" : "border-l-2 border-transparent"}`}>
                {OPTION_LABEL[o.id]}
                {rec && <span className="ml-2 text-[11px] font-semibold tracking-[0.08em] text-accent uppercase">Recommended</span>}
              </td>
              <td className="px-2 py-1.5 text-right tabular">
                <Ev info={cellInfo(pack, proposal, o, "cases")} onInspect={onInspect} />
              </td>
              <td className="px-2 py-1.5 text-right tabular">
                <Ev info={cellInfo(pack, proposal, o, "cost")} onInspect={onInspect} />
              </td>
              <td className="px-2 py-1.5 text-right tabular">
                <Ev info={cellInfo(pack, proposal, o, "ev")} onInspect={onInspect} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
