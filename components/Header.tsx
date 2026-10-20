"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SEASON_OPTIONS, type SeasonId } from "@/lib/data/loadSeason";
import { setConfigValue } from "@/lib/engine/config";
import { useRhume } from "@/lib/store";
import { dataModeLabel } from "./ProvenanceLabel";

const TABS = [
  { href: "/", label: "Workspace" },
  { href: "/scoreboard", label: "Scoreboard" },
  { href: "/log", label: "Log" },
  { href: "/settings", label: "Settings" },
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
      <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Rhume home">
        <span aria-hidden className="block h-4 w-4 bg-accent" />
        <span className="text-[15px] font-semibold tracking-[0.32em] text-ink">RHUME</span>
      </Link>

      <nav aria-label="Sections" className="flex h-full items-stretch gap-4 xl:gap-6">
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
          <span className="xl:hidden">Supply cap</span>
          <span className="hidden xl:inline">
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
          title="Presenter mode (P): restart the 2023–24 replay with scripted pauses"
        >
          {presenterOn ? "Stop presenter" : "Presenter mode"}
        </button>
      </div>
    </header>
  );
}
