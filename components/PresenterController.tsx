"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { REGION_TILE_LABEL } from "@/lib/data/regions";
import { KIND_LABEL } from "@/lib/engine/proposals";
import { PAUSE_RULE_LABEL, PAUSE_RULES } from "@/lib/presenter";
import { findProposal, selectOpenCards, useRhume, WEEK_INTERVAL_MS } from "@/lib/store";

// Presenter mode (PRD §7.7, DESIGN.md §10.4) and the app's hotkeys.
//
// Autoplay advances one week every 1.5 s through the pure presenterStep (lib/presenter.ts): before
// entering a week it auto-approves that week's recommended options, except a scripted pause point
// (first card of the season; first Atlantic store move), where it stops, highlights the card and
// selects its region. Space resumes. After the last week it navigates to the Scoreboard.
//
// Hotkeys: P presenter · Space play/pause · → / ← step week · B brief · A approve (A again or Enter
// confirms the SAP order) · E edit · R reject · S scoreboard · Esc close the drawer or modal.
// They never fire while typing in an input, and only Esc / A / Enter act while a dialog is open.

/** Advance one week the presenter's way; navigates to the Scoreboard after the last week. */
export function usePresenterAdvance(): () => void {
  const router = useRouter();
  return useCallback(() => {
    const kind = useRhume.getState().presenterTick();
    if (kind === "end") {
      useRhume.getState().stopPresenter();
      router.push("/scoreboard");
    }
  }, [router]);
}

/** True when keystrokes belong to a form control (typing, or a slider / radio using arrow keys). */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || typeof HTMLElement === "undefined" || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** The card a hotkey acts on: the open brief's card, else the highlighted card, else the newest open card. */
function targetCardId(): string | null {
  const s = useRhume.getState();
  const open = selectOpenCards(s);
  const isOpen = (id: string | null) => !!id && open.some((p) => p.id === id);
  if (s.openProposalId && !s.decisions[s.openProposalId] && findProposal(s, s.openProposalId)) return s.openProposalId;
  if (isOpen(s.presenter.highlightedProposalId)) return s.presenter.highlightedProposalId;
  return open[0]?.id ?? null;
}

/** Small status chip shown in the timeline bar while presenter mode is on. */
export function PresenterStatus() {
  const presenter = useRhume((s) => s.presenter);
  const playing = useRhume((s) => s.playing);
  const highlighted = useRhume((s) => findProposal(s, s.presenter.highlightedProposalId));
  const decided = useRhume((s) => (s.presenter.highlightedProposalId ? !!s.decisions[s.presenter.highlightedProposalId] : false));
  if (!presenter.on) return null;
  const n = presenter.pauseRule ? PAUSE_RULES.indexOf(presenter.pauseRule) + 1 : 0;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex min-w-0 max-w-[48%] shrink items-center gap-2 rounded-[4px] border px-2 py-1 text-[11px] leading-4 ${
        presenter.pauseRule ? "border-accent bg-stage-watch text-ink" : "border-line bg-panel text-muted"
      }`}
    >
      <span className="font-semibold tracking-[0.08em] whitespace-nowrap text-accent uppercase">Presenter</span>
      {presenter.pauseRule && highlighted ? (
        <span className="truncate">
          Pause {n} of {PAUSE_RULES.length}: {PAUSE_RULE_LABEL[presenter.pauseRule]} ({REGION_TILE_LABEL[highlighted.regionId]} ·{" "}
          {KIND_LABEL[highlighted.kind]}) · {decided ? "decided · Space resumes" : "B brief · A approve · R reject · Space resumes"}
        </span>
      ) : (
        <span className="truncate">{playing ? "Playing · auto-approving recommended options · Space pauses" : "Paused · Space plays"}</span>
      )}
    </div>
  );
}

export default function PresenterController() {
  const router = useRouter();
  const pathname = usePathname();
  const advance = usePresenterAdvance();
  const on = useRhume((s) => s.presenter.on);
  const playing = useRhume((s) => s.playing);
  const index = useRhume((s) => s.currentWeekIndex);
  const speed = useRhume((s) => s.speed);
  const dialogOpen = useRhume((s) => !!s.openProposalId || !!s.approval || !!s.rejectProposalId);

  // Autoplay: one presenter step per beat. Holds while a brief or dialog is open.
  useEffect(() => {
    if (!on || !playing || dialogOpen) return;
    const id = window.setTimeout(advance, WEEK_INTERVAL_MS / speed);
    return () => window.clearTimeout(id);
  }, [on, playing, dialogOpen, index, speed, advance]);

  useEffect(() => {
    let swallowSpaceKeyup = false;

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useRhume.getState();
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (key === "Escape") {
        if (s.rejectProposalId) s.cancelReject();
        else if (s.approval) s.cancelApprove();
        else if (s.openProposalId) s.closeBrief();
        else return;
        e.preventDefault();
        return;
      }

      if (isTypingTarget(e.target)) return;

      // Reject dialog: only Esc (above).
      if (s.rejectProposalId) return;

      // SAP order modal: A or Enter confirms. Enter on a focused button keeps its native click.
      if (s.approval) {
        const onButton = e.target instanceof HTMLElement && !!e.target.closest("button, a");
        if (key === "a" || (key === "Enter" && !onButton)) {
          e.preventDefault();
          s.confirmApprove();
        }
        return;
      }

      const onWorkspace = pathname === "/";
      switch (key) {
        case "p": {
          e.preventDefault();
          const starting = !s.presenter.on;
          s.togglePresenter();
          if (starting) {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            if (!onWorkspace) router.push("/");
          }
          return;
        }
        case "s":
          e.preventDefault();
          if (s.openProposalId) s.closeBrief();
          router.push("/scoreboard");
          return;
        case "a": {
          const id = targetCardId();
          if (!id) return;
          e.preventDefault();
          s.requestApprove(id);
          return;
        }
        case "r": {
          const id = targetCardId();
          if (!id) return;
          e.preventDefault();
          s.requestReject(id);
          return;
        }
      }

      if (!onWorkspace || s.openProposalId) {
        // While the drawer is open: E toggles edit; Space / arrows / B do nothing.
        if (key === "e" && s.openProposalId && !s.decisions[s.openProposalId]) {
          e.preventDefault();
          s.setBriefMode(s.briefMode === "edit" ? "read" : "edit");
        }
        return;
      }

      switch (key) {
        case " ":
          e.preventDefault();
          swallowSpaceKeyup = true;
          s.togglePlay();
          return;
        case "ArrowRight":
          e.preventDefault();
          if (s.presenter.on) advance();
          else s.step(1);
          return;
        case "ArrowLeft":
          e.preventDefault();
          s.step(-1);
          return;
        case "b": {
          const id = targetCardId();
          if (!id) return;
          e.preventDefault();
          s.openBrief(id);
          return;
        }
        case "e": {
          const id = targetCardId();
          if (!id) return;
          e.preventDefault();
          s.openBrief(id, "edit");
          return;
        }
      }
    }

    // A focused button would also "click" on the Space keyup; swallow it when Space was a hotkey.
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === " " && swallowSpaceKeyup) {
        swallowSpaceKeyup = false;
        e.preventDefault();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [pathname, router, advance]);

  return null;
}
