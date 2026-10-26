"use client";

import { useEffect } from "react";
import { formatWeekOf } from "@/lib/format";
import { selectAsOf, selectWeeks, SPEEDS, useRhume, WEEK_INTERVAL_MS } from "@/lib/store";
import { PresenterStatus, usePresenterAdvance } from "./PresenterController";

/**
 * ◀ ▶ ⏯, speed 0.5× 1× 2×, a slider across the season's Mondays and the "Week of …" label.
 * Playing advances one week every 1.5 s at 1× (scaled by speed) and stops at the last week.
 */
export default function TimelineBar() {
  const weeks = useRhume(selectWeeks);
  const asOf = useRhume(selectAsOf);
  const index = useRhume((s) => s.currentWeekIndex);
  const playing = useRhume((s) => s.playing);
  const speed = useRhume((s) => s.speed);
  const setWeek = useRhume((s) => s.setWeek);
  const step = useRhume((s) => s.step);
  const togglePlay = useRhume((s) => s.togglePlay);
  const setSpeed = useRhume((s) => s.setSpeed);
  const presenterOn = useRhume((s) => s.presenter.on);
  const presenterAdvance = usePresenterAdvance();

  const last = weeks.length - 1;

  // Playback: re-armed after every week change, so a manual step resets the beat.
  // In presenter mode the PresenterController drives the replay instead.
  useEffect(() => {
    if (!playing || presenterOn) return;
    const id = window.setTimeout(() => useRhume.getState().step(1), WEEK_INTERVAL_MS / speed);
    return () => window.clearTimeout(id);
  }, [playing, presenterOn, speed, index]);

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-bg px-4 lg:gap-4 lg:px-6">
      <div className="flex items-center gap-1" role="group" aria-label="Playback">
        <button type="button" className="btn btn-secondary btn-sm w-8" onClick={() => step(-1)} disabled={index <= 0} aria-label="Previous week">
          ◀
        </button>
        <button type="button" className="btn btn-secondary btn-sm w-8" onClick={() => (presenterOn ? presenterAdvance() : step(1))} disabled={index >= last && !presenterOn} aria-label="Next week">
          ▶
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm w-[72px]"
          onClick={togglePlay}
          aria-label={playing ? "Pause replay" : "Play replay"}
        >
          <span aria-hidden>⏯</span>
          <span>{playing ? "Pause" : "Play"}</span>
        </button>
      </div>

      <div className="flex items-center gap-1" role="group" aria-label="Speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className="btn btn-ghost btn-sm tabular w-10 border-line"
            aria-pressed={speed === s}
            onClick={() => setSpeed(s)}
          >
            {s}×
          </button>
        ))}
      </div>

      <label className="flex min-w-0 flex-1 items-center">
        <span className="sr-only">Replay week</span>
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          onChange={(e) => setWeek(Number(e.target.value))}
          aria-valuetext={formatWeekOf(asOf)}
          className="w-full cursor-pointer"
        />
      </label>

      <PresenterStatus />

      <div className="w-[190px] shrink-0 text-right text-sm font-semibold tabular text-ink" aria-live="polite">
        {formatWeekOf(asOf)}
      </div>
    </div>
  );
}
