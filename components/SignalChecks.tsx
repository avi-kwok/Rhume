import type { SignalCheck } from "@/lib/engine/types";

const CHECK_NAME: Record<SignalCheck["id"], string> = {
  wastewater: "Wastewater",
  lab: "Lab positivity",
  neighbour: "Neighbour timing",
};

/** The three signal checks as ✓ / ✗ with the engine's plain-English reasons. */
export default function SignalChecks({ checks }: { checks: SignalCheck[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2" aria-label="Signal checks">
      {checks.map((c) => (
        <li key={c.id} className="flex min-w-0 gap-2 rounded-[4px] border border-line px-2.5 py-1.5">
          <span
            aria-hidden
            className={`mt-px text-sm leading-4 font-bold ${c.passed ? "text-accent" : "text-muted"}`}
          >
            {c.passed ? "✓" : "✗"}
          </span>
          <span className="min-w-0">
            <span className="block text-xs leading-4 font-semibold text-ink">
              {CHECK_NAME[c.id]}
              <span className="sr-only">{c.passed ? ": passed" : ": not passed"}</span>
            </span>
            <span className="line-clamp-2 block text-xs leading-4 text-muted" title={c.reason}>
              {c.reason}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
