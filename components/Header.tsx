"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SEASON_OPTIONS, type SeasonId } from "@/lib/data/loadSeason";
import { setConfigValue } from "@/lib/engine/config";
import { PERSONA, PERSONA_CHIP } from "@/lib/persona";
import { useRhume } from "@/lib/store";
import { RhumeLogo } from "./RhumeLogo";
import { dataModeLabel } from "./ProvenanceLabel";

const TABS = [
  { href: "/", label: "Workspace" },
  { href: "/scoreboard", label: "Scoreboard" },
  { href: "/log", label: "Log" },
  { href: "/settings", label: "Settings" },
  { href: "/models", label: "Models" },
  { href: "/evidence", label: "Evidence" },
] as const;

const SCENARIO_SHORT: Record<SeasonId, string> = {
  "2023-24": "2023–24",
  "2024-25": "2024–25 (synchronized)",
};

export default function Header() {
  const pathname = usePathname();
  const season = useRhume((s) => s.season);
  const seasonId = useRhume((s) => s.seasonId);
  const setSeason = useRhume((s) => s.setSeason);
  const presenterOn = useRhume((s) => s.presenter.on);
  const togglePresenter = useRhume((s) => s.togglePresenter);
  const supplyCapped = useRhume((s) => s.cfg.supplyCapped);
  const router = useRouter();

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-bg px-4 lg:px-6 xl:gap-8">
      <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Rhume home">
        <RhumeLogo className="block h-6 w-6" />
        <span className="text-[15px] font-semibold tracking-[0.22em] text-ink">RHUME</span>
      </Link>

      <nav aria-label="Sections" className="flex h-full items-stretch gap-4 xl:gap-5">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center border-b-2 text-sm transition-colors ${
                active ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2 xl:gap-3">
        <span className="rounded-[4px] border border-line bg-panel px-2.5 py-1 text-xs whitespace-nowrap text-ink">
          {dataModeLabel(season)}
        </span>

        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="sr-only lg:not-sr-only">Scenario</span>
          <select
            value={seasonId}
            onChange={(e) => setSeason(e.target.value as SeasonId)}
            className="rounded-[4px] border border-line bg-bg px-2 py-1 text-xs text-ink"
            aria-label="Scenario"
          >
            {SEASON_OPTIONS.map((o) => (
              <option key={o.id} value={o.id} title={o.label}>
                {SCENARIO_SHORT[o.id]}
              </option>
            ))}
          </select>
        </label>

        <label
          className="flex items-center gap-1.5 text-xs whitespace-nowrap text-ink"
          title="Supply-capped scenario (2022-like): supplier fills capped at the share set in Settings, pro rata. Assumption."
        >
          <input
            type="checkbox"
            checked={supplyCapped}
            onChange={(e) => {
              const s = useRhume.getState();
              s.setCfg(setConfigValue(s.cfg, "supplyCapped", e.target.checked));
            }}
            className="accent-[var(--accent)]"
          />
          <span className="2xl:hidden">Supply cap</span>
          <span className="hidden 2xl:inline">
            Supply-capped <span className="text-muted">(2022-like)</span>
          </span>
        </label>

        <button
          type="button"
          onClick={() => {
            const starting = !presenterOn;
            togglePresenter();
            if (starting && pathname !== "/") router.push("/");
          }}
          aria-pressed={presenterOn}
          className="btn btn-secondary btn-sm"
          title="Presenter mode (P): restart the 2023–24 replay from Mia's seat, pausing at Atlantic's first store move"
        >
          {presenterOn ? "Stop presenter" : "Presenter mode"}
        </button>

        <span
          className="hidden items-center gap-1.5 border-l border-line pl-2 text-xs whitespace-nowrap text-muted lg:flex xl:pl-3"
          title={`Signed in: ${PERSONA_CHIP} (${PERSONA.category.toLowerCase()})`}
          aria-label={`Signed in as ${PERSONA_CHIP}`}
        >
          <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-panel text-[10px] font-semibold text-ink">
            ML
          </span>
          <span className="font-medium text-ink">{PERSONA.name}</span>
          <span className="hidden 2xl:inline">
            · {PERSONA.role} · {PERSONA.regionName}
          </span>
        </span>
      </div>
    </header>
  );
}
