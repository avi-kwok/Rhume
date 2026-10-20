// The single Zustand store (DESIGN.md §10.1).
//
// State: season and config, the replay position, presenter flags, the planner's decisions and the
// three memoized simulation results. Selectors at the bottom are pure and memoized on input identity,
// so components can call them through useRhume() without re-render loops.
//
// Hydration: the initial state is identical on the server and the client (defaults, no storage).
// <StoreHydrator /> calls hydrate() after mount, which reads localStorage (try/catch) and then keeps
// decisions, cfg and seasonId persisted. The app works without storage.

import { create } from "zustand";
import type { BriefResponse, SummaryResponse } from "./ai/schema";
import { DEFAULT_SEASON_ID, loadSeason, SEASON_OPTIONS, type SeasonId } from "./data/loadSeason";
import { REGION_IDS } from "./data/regions";
import { defaultConfig, type Config } from "./engine/config";
import { addDays } from "./engine/dates";
import { evidencePackFor } from "./engine/evidence";
import { casesFor } from "./engine/proposals";
import { simulate, simulateAll } from "./engine/simulate";
import { computeStates } from "./engine/stage";
import type { Decision, DayRecord, OptionId, Proposal, RegionId, RegionState, Season, SimResult } from "./engine/types";
import { presenterStep, type PauseRule } from "./presenter";
import {
  AUTO_APPROVE_REASON,
  autoDecide,
  buildDecision,
  CARD_LIFETIME_DAYS,
  inCardWindow,
  isAutoDecision,
  recommendedOption,
  seasonWeeks,
} from "./replay";
import { stoNumber } from "./sap";
import type { StoreTaskId } from "./storeTasks";

export type { BriefResponse, SummaryResponse };
export { AUTO_APPROVE_REASON, autoDecide, buildDecision, CARD_LIFETIME_DAYS, inCardWindow, isAutoDecision, recommendedOption, seasonWeeks };

export type Speed = 0.5 | 1 | 2;
export const SPEEDS: readonly Speed[] = [0.5, 1, 2];

/** Base replay pace: one week every 1.5 s at 1× (PRD §7.7). */
export const WEEK_INTERVAL_MS = 1500;

/** Reason written on decisions made by the executive "Approve all recommended" action. */
export const APPROVE_ALL_REASON = "Approved with the weekly plan: engine-recommended option";

export interface PresenterState {
  on: boolean;
  /** Proposal ids the presenter stopped on. Auto-approve never decides these. */
  pauseAt: string[];
  highlightedProposalId: string | null;
  /** Pause rules already fired in this run, and the rule of the current stop (null while playing). */
  rulesHit: PauseRule[];
  pauseRule: PauseRule | null;
}

/** An approval waiting for confirmation in the SAP order modal. */
export interface ApprovalDraft {
  proposalId: string;
  action: "approve" | "edit_approve";
  optionId?: OptionId;
  /** Cases that will move (0 = do nothing; no stock transport order is created). */
  cases: number;
  /** Document number shown in the modal; consumed on confirm when cases > 0. */
  stoNumber: string;
}

/** An associate-owner declining an arrival task (F12). Logged and persisted. */
export interface StoreTaskDecline {
  id: string;
  proposalId: string;
  regionId: RegionId;
  taskId: StoreTaskId;
  task: string;
  minutes: number;
  /** Replay date on which the owner declined. */
  replayDate: string;
  arrivalDate: string;
  declinedAt: string;
}

/** A planner override of a region's stage (F16). Display only; the engine is unchanged. */
export interface StageOverride {
  regionId: RegionId;
  /** Replay date the override was made. */
  replayDate: string;
  engineStage: RegionState["stage"];
  stage: RegionState["stage"];
  reason: string;
  decidedAt: string;
}

export type BriefMode = "read" | "edit";

export interface Results {
  sq: SimResult;
  rh: SimResult;
  rhAuto: SimResult;
}

export interface RhumeData {
  /** True once hydrate() has read localStorage on the client. */
  hydrated: boolean;
  seasonId: SeasonId;
  season: Season;
  cfg: Config;
  currentWeekIndex: number;
  playing: boolean;
  speed: Speed;
  presenter: PresenterState;
  autoApprove: boolean;
  decisions: Record<string, Decision>;
  selectedRegion: RegionId;
  openProposalId: string | null;
  briefMode: BriefMode;
  results: Results;
  /** Brief responses keyed by evidence-pack hash. */
  briefs: Record<string, BriefResponse>;
  /** Executive-summary responses keyed by summary-pack hash. */
  summaries: Record<string, SummaryResponse>;
  /** SAP order modal (null = closed). */
  approval: ApprovalDraft | null;
  /** Reject dialog target (null = closed). */
  rejectProposalId: string | null;
  /** Number of stock transport orders created so far (persisted with the decisions). */
  stoCounter: number;
  /** proposalId → stock transport order number, for confirmed approvals that moved stock. */
  sapOrders: Record<string, string>;
  storeTaskDeclines: StoreTaskDecline[];
  /** Planner stage overrides (F16), keyed `${regionId}:${replayDate}`. */
  stageOverrides: Record<string, StageOverride>;
}

export interface RhumeActions {
  hydrate(): void;
  setWeek(index: number): void;
  step(delta: 1 | -1): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  setSpeed(speed: Speed): void;
  selectRegion(regionId: RegionId): void;
  openBrief(proposalId: string, mode?: BriefMode): void;
  setBriefMode(mode: BriefMode): void;
  closeBrief(): void;
  /** Open the SAP order modal for an approval (recommended option unless optionId or cases is given). */
  requestApprove(proposalId: string, choice?: { optionId?: OptionId; cases?: number; action?: "approve" | "edit_approve" }): void;
  cancelApprove(): void;
  /** Confirm the open approval: write the Decision, consume the STO number, close modal and drawer. */
  confirmApprove(): Decision | null;
  requestReject(proposalId: string): void;
  cancelReject(): void;
  confirmReject(reason: string): Decision | null;
  /** Executive "Approve all recommended": approve every open card this week. Returns how many were decided. */
  approveAllRecommended(): number;
  declineStoreTask(input: Omit<StoreTaskDecline, "id" | "declinedAt">): void;
  setStageOverride(override: Omit<StageOverride, "decidedAt">): void;
  clearStageOverride(key: string): void;
  /** Presenter: reset to week 0 on the default season, clear decisions, autoplay. */
  startPresenter(): void;
  stopPresenter(): void;
  /** Presenter: advance one week under the pause rules. */
  presenterTick(): "end" | "pause" | "advance";
  /** Writes the decision and re-runs the simulation. */
  decide(decision: Decision): void;
  clearDecisions(): void;
  setCfg(cfg: Config): void;
  resetCfg(): void;
  setSeason(seasonId: SeasonId): void;
  setAutoApprove(on: boolean): void;
  setPresenter(patch: Partial<PresenterState>): void;
  togglePresenter(): void;
  highlight(proposalId: string | null): void;
  setBrief(key: string, brief: BriefResponse): void;
  setSummary(key: string, summary: SummaryResponse): void;
}

export type RhumeState = RhumeData & RhumeActions;

// ---------------------------------------------------------------------------
// Pure helpers

function clampWeek(season: Season, index: number): number {
  const n = seasonWeeks(season).length;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(n - 1, Math.round(index)));
}

export function asOfFor(season: Season, index: number): string {
  return seasonWeeks(season)[clampWeek(season, index)];
}

/** "ai" when the brief loaded for this proposal's current evidence pack is an AI brief, else "template". */
export function briefSourceFor(s: Pick<RhumeData, "season" | "cfg" | "briefs">, proposal: Proposal): Decision["briefSource"] {
  const b = s.briefs[evidencePackFor(proposal, s).hash];
  return b && b.source !== "template" ? "ai" : "template";
}

/** Cases a decision moves for a proposal (0 for reject). */
export function decisionCases(proposal: Proposal, decision: Decision): number {
  if (decision.action === "reject") return 0;
  if (decision.action === "edit_approve") return casesFor(proposal, { cases: decision.cases ?? 0 });
  return casesFor(proposal, { optionId: decision.optionId ?? proposal.recommended });
}

// ---------------------------------------------------------------------------
// Persistence (decisions, cfg, seasonId). Every access is wrapped: storage may be absent or throw.

const STORAGE_KEY = "rhume:v1";

interface Persisted {
  seasonId: SeasonId;
  cfg: Config;
  decisions: Record<string, Decision>;
  stoCounter: number;
  sapOrders: Record<string, string>;
  storeTaskDeclines: StoreTaskDecline[];
  stageOverrides: Record<string, StageOverride>;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Merge a stored config over the defaults, keeping only keys of the right type. */
function mergeCfg(raw: unknown): Config {
  const base = defaultConfig();
  if (!isRecord(raw)) return base;
  const out = base as unknown as Record<string, unknown>;
  for (const [key, def] of Object.entries(base)) {
    const v = raw[key];
    if (isRecord(def)) {
      if (!isRecord(v)) continue;
      const nested = { ...def } as Record<string, unknown>;
      for (const k of Object.keys(def)) if (typeof v[k] === typeof def[k]) nested[k] = v[k];
      out[key] = nested;
    } else if (typeof v === typeof def && (typeof v !== "number" || Number.isFinite(v))) {
      out[key] = v;
    }
  }
  return out as unknown as Config;
}

function readPersisted(): Partial<Persisted> | null {
  try {
    const s = storage();
    const text = s?.getItem(STORAGE_KEY);
    if (!text) return null;
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw)) return null;
    const out: Partial<Persisted> = {};
    if (SEASON_OPTIONS.some((o) => o.id === raw.seasonId)) out.seasonId = raw.seasonId as SeasonId;
    if (raw.cfg !== undefined) out.cfg = mergeCfg(raw.cfg);
    if (isRecord(raw.decisions)) {
      const ds: Record<string, Decision> = {};
      for (const [id, d] of Object.entries(raw.decisions)) {
        if (isRecord(d) && d.proposalId === id && typeof d.action === "string") ds[id] = d as unknown as Decision;
      }
      out.decisions = ds;
    }
    if (typeof raw.stoCounter === "number" && Number.isInteger(raw.stoCounter) && raw.stoCounter >= 0) out.stoCounter = raw.stoCounter;
    if (isRecord(raw.sapOrders)) {
      const so: Record<string, string> = {};
      for (const [id, n] of Object.entries(raw.sapOrders)) if (typeof n === "string" && /^\d{10}$/.test(n)) so[id] = n;
      out.sapOrders = so;
    }
    if (Array.isArray(raw.storeTaskDeclines)) {
      out.storeTaskDeclines = raw.storeTaskDeclines.filter(
        (d): d is StoreTaskDecline => isRecord(d) && typeof d.id === "string" && typeof d.proposalId === "string" && typeof d.task === "string",
      );
    }
    if (isRecord(raw.stageOverrides)) {
      const so: Record<string, StageOverride> = {};
      for (const [k, o] of Object.entries(raw.stageOverrides)) {
        if (isRecord(o) && typeof o.regionId === "string" && typeof o.stage === "string" && typeof o.reason === "string") so[k] = o as unknown as StageOverride;
      }
      out.stageOverrides = so;
    }
    return out;
  } catch {
    return null;
  }
}

function writePersisted(p: Persisted): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Storage full, blocked or unavailable: the app keeps working in memory.
  }
}

// ---------------------------------------------------------------------------
// Store

function initialData(): RhumeData {
  const season = loadSeason(DEFAULT_SEASON_ID);
  const cfg = defaultConfig();
  return {
    hydrated: false,
    seasonId: DEFAULT_SEASON_ID,
    season,
    cfg,
    currentWeekIndex: 0,
    playing: false,
    speed: 1,
    presenter: { on: false, pauseAt: [], highlightedProposalId: null, rulesHit: [], pauseRule: null },
    autoApprove: false,
    decisions: {},
    selectedRegion: "ATL",
    openProposalId: null,
    briefMode: "read",
    results: simulateAll(season, cfg, {}),
    briefs: {},
    summaries: {},
    approval: null,
    rejectProposalId: null,
    stoCounter: 0,
    sapOrders: {},
    storeTaskDeclines: [],
    stageOverrides: {},
  };
}

let unsubscribePersist: (() => void) | null = null;

export const useRhume = create<RhumeState>()((set, get) => {
  /** Move to a week; with auto-approve on, decide every card surfaced on the way. */
  function goTo(index: number, extra: Partial<RhumeData> = {}) {
    const s = get();
    const next = clampWeek(s.season, index);
    const prevAsOf = asOfFor(s.season, s.currentWeekIndex);
    const asOf = asOfFor(s.season, next);
    const patch: Partial<RhumeData> = { currentWeekIndex: next, ...extra };
    if (s.autoApprove) {
      const from = asOf > prevAsOf ? prevAsOf : asOf;
      const skip = [...s.presenter.pauseAt, ...(s.presenter.highlightedProposalId ? [s.presenter.highlightedProposalId] : [])];
      const r = autoDecide(s.season, s.cfg, s.decisions, s.results.rh, asOf, from, skip);
      if (r.decisions !== s.decisions) {
        patch.decisions = r.decisions;
        patch.results = { ...s.results, rh: r.rh };
      }
    }
    set(patch);
  }

  return {
    ...initialData(),

    hydrate() {
      if (get().hydrated) return;
      const saved = readPersisted();
      const s = get();
      const seasonId = saved?.seasonId ?? s.seasonId;
      const season = seasonId === s.seasonId ? s.season : loadSeason(seasonId);
      const cfg = saved?.cfg ?? s.cfg;
      const decisions = saved?.decisions ?? s.decisions;
      const changed = Boolean(saved && (saved.seasonId || saved.cfg || saved.decisions));
      set({
        hydrated: true,
        seasonId,
        season,
        cfg,
        decisions,
        stoCounter: saved?.stoCounter ?? s.stoCounter,
        sapOrders: saved?.sapOrders ?? s.sapOrders,
        storeTaskDeclines: saved?.storeTaskDeclines ?? s.storeTaskDeclines,
        stageOverrides: saved?.stageOverrides ?? s.stageOverrides,
        currentWeekIndex: clampWeek(season, s.currentWeekIndex),
        results: changed ? simulateAll(season, cfg, decisions) : s.results,
      });
      unsubscribePersist?.();
      unsubscribePersist = useRhume.subscribe((now, before) => {
        if (
          now.decisions !== before.decisions ||
          now.cfg !== before.cfg ||
          now.seasonId !== before.seasonId ||
          now.stoCounter !== before.stoCounter ||
          now.sapOrders !== before.sapOrders ||
          now.storeTaskDeclines !== before.storeTaskDeclines ||
          now.stageOverrides !== before.stageOverrides
        ) {
          writePersisted({
            seasonId: now.seasonId,
            cfg: now.cfg,
            decisions: now.decisions,
            stoCounter: now.stoCounter,
            sapOrders: now.sapOrders,
            storeTaskDeclines: now.storeTaskDeclines,
            stageOverrides: now.stageOverrides,
          });
        }
      });
    },

    setWeek(index) {
      goTo(index);
    },

    step(delta) {
      const s = get();
      const last = seasonWeeks(s.season).length - 1;
      const next = clampWeek(s.season, s.currentWeekIndex + delta);
      goTo(next, next >= last ? { playing: false } : {});
    },

    play() {
      const s = get();
      const last = seasonWeeks(s.season).length - 1;
      if (s.currentWeekIndex >= last) goTo(0, { playing: true });
      else set({ playing: true });
    },

    pause() {
      set({ playing: false });
    },

    togglePlay() {
      if (get().playing) get().pause();
      else get().play();
    },

    setSpeed(speed) {
      if (SPEEDS.includes(speed)) set({ speed });
    },

    selectRegion(regionId) {
      if (REGION_IDS.includes(regionId)) set({ selectedRegion: regionId });
    },

    openBrief(proposalId, mode = "read") {
      set({ openProposalId: proposalId, briefMode: mode });
    },

    setBriefMode(mode) {
      set({ briefMode: mode });
    },

    closeBrief() {
      set({ openProposalId: null, briefMode: "read" });
    },

    requestApprove(proposalId, choice = {}) {
      const s = get();
      const p = findProposal(s, proposalId);
      if (!p || s.decisions[p.id]) return;
      const action = choice.action ?? (choice.cases !== undefined ? "edit_approve" : "approve");
      const cases =
        action === "edit_approve"
          ? casesFor(p, { cases: choice.cases ?? 0 })
          : casesFor(p, { optionId: choice.optionId ?? p.recommended });
      set({
        approval: {
          proposalId: p.id,
          action,
          optionId: action === "approve" ? (choice.optionId ?? p.recommended) : undefined,
          cases,
          stoNumber: stoNumber(s.stoCounter + 1),
        },
        rejectProposalId: null,
      });
    },

    cancelApprove() {
      set({ approval: null });
    },

    confirmApprove() {
      const s = get();
      const a = s.approval;
      if (!a) return null;
      const p = findProposal(s, a.proposalId);
      if (!p || s.decisions[p.id]) {
        set({ approval: null });
        return null;
      }
      const decision = buildDecision(p, s, {
        action: a.action,
        optionId: a.action === "approve" ? a.optionId : undefined,
        cases: a.action === "edit_approve" ? a.cases : undefined,
        briefSource: briefSourceFor(s, p),
      });
      const moves = a.cases > 0;
      const decisions = { ...s.decisions, [p.id]: decision };
      set({
        decisions,
        results: { ...s.results, rh: simulate(s.season, s.cfg, "rhume", decisions) },
        approval: null,
        openProposalId: null,
        briefMode: "read",
        ...(moves ? { stoCounter: s.stoCounter + 1, sapOrders: { ...s.sapOrders, [p.id]: a.stoNumber } } : {}),
      });
      return decision;
    },

    requestReject(proposalId) {
      const s = get();
      const p = findProposal(s, proposalId);
      if (!p || s.decisions[p.id]) return;
      set({ rejectProposalId: p.id, approval: null });
    },

    cancelReject() {
      set({ rejectProposalId: null });
    },

    confirmReject(reason) {
      const s = get();
      const p = findProposal(s, s.rejectProposalId);
      const text = reason.trim();
      if (!p || !text || s.decisions[p.id]) return null;
      const decision = buildDecision(p, s, { action: "reject", reason: text, briefSource: briefSourceFor(s, p) });
      const decisions = { ...s.decisions, [p.id]: decision };
      set({
        decisions,
        results: { ...s.results, rh: simulate(s.season, s.cfg, "rhume", decisions) },
        rejectProposalId: null,
        openProposalId: s.openProposalId === p.id ? null : s.openProposalId,
        briefMode: "read",
      });
      return decision;
    },

    approveAllRecommended() {
      let s = get();
      let ds = s.decisions;
      let rh = s.results.rh;
      let count = 0;
      for (let guard = 0; guard < 100; guard++) {
        const view = { ...s, decisions: ds, results: { ...s.results, rh } };
        const next = selectOpenCards(view)[0];
        if (!next) break;
        ds = {
          ...ds,
          [next.id]: buildDecision(next, s, { action: "approve", reason: APPROVE_ALL_REASON, briefSource: briefSourceFor(s, next) }),
        };
        rh = simulate(s.season, s.cfg, "rhume", ds);
        count++;
      }
      if (count > 0) {
        s = get();
        set({ decisions: ds, results: { ...s.results, rh } });
      }
      return count;
    },

    declineStoreTask(input) {
      const s = get();
      const id = `${input.proposalId}:${input.taskId}`;
      if (s.storeTaskDeclines.some((d) => d.id === id)) return;
      set({ storeTaskDeclines: [...s.storeTaskDeclines, { ...input, id, declinedAt: new Date().toISOString() }] });
    },

    setStageOverride(o) {
      const key = `${o.regionId}:${o.replayDate}`;
      set({ stageOverrides: { ...get().stageOverrides, [key]: { ...o, decidedAt: new Date().toISOString() } } });
    },

    clearStageOverride(key) {
      const next = { ...get().stageOverrides };
      delete next[key];
      set({ stageOverrides: next });
    },

    startPresenter() {
      const s = get();
      const season = s.seasonId === DEFAULT_SEASON_ID ? s.season : loadSeason(DEFAULT_SEASON_ID);
      const results = s.seasonId === DEFAULT_SEASON_ID ? { ...s.results, rh: simulate(season, s.cfg, "rhume", {}) } : simulateAll(season, s.cfg, {});
      set({
        seasonId: DEFAULT_SEASON_ID,
        season,
        currentWeekIndex: 0,
        decisions: {},
        results,
        autoApprove: false,
        speed: 1,
        playing: true,
        openProposalId: null,
        briefMode: "read",
        approval: null,
        rejectProposalId: null,
        presenter: { on: true, pauseAt: [], highlightedProposalId: null, rulesHit: [], pauseRule: null },
      });
    },

    stopPresenter() {
      set({ playing: false, presenter: { ...get().presenter, on: false, highlightedProposalId: null, pauseRule: null } });
    },

    presenterTick() {
      const s = get();
      const step = presenterStep({
        season: s.season,
        cfg: s.cfg,
        weekIndex: s.currentWeekIndex,
        decisions: s.decisions,
        rh: s.results.rh,
        pauseAt: s.presenter.pauseAt,
        rulesHit: s.presenter.rulesHit,
      });
      const patch: Partial<RhumeData> = { currentWeekIndex: step.weekIndex };
      if (step.decisions !== s.decisions) {
        patch.decisions = step.decisions;
        patch.results = { ...s.results, rh: step.rh };
      }
      if (step.kind === "pause") {
        patch.playing = false;
        patch.selectedRegion = step.pause.proposal.regionId;
        patch.presenter = {
          ...s.presenter,
          pauseAt: [...s.presenter.pauseAt, ...step.candidates.map((c) => c.proposal.id)],
          rulesHit: [...s.presenter.rulesHit, ...step.candidates.map((c) => c.rule)],
          highlightedProposalId: step.pause.proposal.id,
          pauseRule: step.pause.rule,
        };
      } else {
        if (step.kind === "end") patch.playing = false;
        patch.presenter = { ...s.presenter, highlightedProposalId: null, pauseRule: null };
      }
      set(patch);
      return step.kind;
    },

    decide(decision) {
      const s = get();
      const decisions = { ...s.decisions, [decision.proposalId]: decision };
      // sq and rhAuto do not depend on decisions; only the interactive run is re-simulated.
      set({ decisions, results: { ...s.results, rh: simulate(s.season, s.cfg, "rhume", decisions) } });
    },

    clearDecisions() {
      const s = get();
      set({ decisions: {}, results: { ...s.results, rh: simulate(s.season, s.cfg, "rhume", {}) } });
    },

    setCfg(cfg) {
      const s = get();
      set({ cfg, results: simulateAll(s.season, cfg, s.decisions) });
    },

    resetCfg() {
      get().setCfg(defaultConfig());
    },

    setSeason(seasonId) {
      const s = get();
      if (seasonId === s.seasonId) return;
      const season = loadSeason(seasonId);
      set({
        seasonId,
        season,
        currentWeekIndex: 0,
        playing: false,
        openProposalId: null,
        presenter: { ...s.presenter, highlightedProposalId: null },
        results: simulateAll(season, s.cfg, s.decisions),
      });
    },

    setAutoApprove(on) {
      set({ autoApprove: on });
      // Turning it on decides the cards that are open right now.
      if (on) goTo(get().currentWeekIndex);
    },

    setPresenter(patch) {
      set({ presenter: { ...get().presenter, ...patch } });
    },

    togglePresenter() {
      if (get().presenter.on) get().stopPresenter();
      else get().startPresenter();
    },

    highlight(proposalId) {
      set({ presenter: { ...get().presenter, highlightedProposalId: proposalId } });
    },

    setBrief(key, brief) {
      set({ briefs: { ...get().briefs, [key]: brief } });
    },

    setSummary(key, summary) {
      set({ summaries: { ...get().summaries, [key]: summary } });
    },
  };
});

// ---------------------------------------------------------------------------
// Selectors. Pure functions of state, memoized on the identity of their inputs.

function createSelector<D extends readonly unknown[], R>(
  getDeps: (s: RhumeData) => D,
  compute: (deps: D) => R,
): (s: RhumeData) => R {
  let last: D | null = null;
  let value!: R;
  return (s) => {
    const deps = getDeps(s);
    if (last && deps.length === last.length && deps.every((d, i) => Object.is(d, last![i]))) return value;
    last = deps;
    value = compute(deps);
    return value;
  };
}

export const selectWeeks = (s: RhumeData): string[] => seasonWeeks(s.season);

/** The current replay date (a Monday). */
export const selectAsOf = (s: RhumeData): string => asOfFor(s.season, s.currentWeekIndex);

export const selectIsLastWeek = (s: RhumeData): boolean => s.currentWeekIndex >= seasonWeeks(s.season).length - 1;

/** Open cards as of the replay date: surfaced in the last 7 days, not decided. Newest first. */
export const selectOpenCards = createSelector(
  (s) => [s.results.rh.proposals, s.decisions, selectAsOf(s)] as const,
  ([proposals, decisions, asOf]): Proposal[] =>
    proposals.filter((p) => inCardWindow(p, asOf) && !decisions[p.id]).sort(newestFirst(proposals)),
);

export interface DecidedCard {
  proposal: Proposal;
  decision: Decision;
}

/** Cards in this week's window that already have a decision. Newest first. */
export const selectDecidedThisWeek = createSelector(
  (s) => [s.results.rh.proposals, s.decisions, selectAsOf(s)] as const,
  ([proposals, decisions, asOf]): DecidedCard[] =>
    proposals
      .filter((p) => inCardWindow(p, asOf) && decisions[p.id])
      .sort(newestFirst(proposals))
      .map((p) => ({ proposal: p, decision: decisions[p.id] })),
);

/** Cards older than 7 days with no decision: expired. The simulation treats them as "do nothing". */
export const selectExpiredCards = createSelector(
  (s) => [s.results.rh.proposals, s.decisions, selectAsOf(s)] as const,
  ([proposals, decisions, asOf]): Proposal[] =>
    proposals
      .filter((p) => p.asOf <= addDays(asOf, -CARD_LIFETIME_DAYS) && !decisions[p.id])
      .sort(newestFirst(proposals)),
);

/** Region states as of the replay date (memoized by the stage engine). */
export const selectRegionStates = (s: RhumeData): Record<RegionId, RegionState> =>
  computeStates(s.season, s.cfg, selectAsOf(s));

/** The interactive Rhume run's DayRecord per region on the replay date. */
export const selectDayRecords = createSelector(
  (s) => [s.results.rh, selectAsOf(s)] as const,
  ([rh, asOf]): Record<RegionId, DayRecord | undefined> => {
    const out = {} as Record<RegionId, DayRecord | undefined>;
    for (const id of REGION_IDS) out[id] = rh.days[id].find((d) => d.date === asOf);
    return out;
  },
);

/** Look up a proposal in the interactive run, or the auto run as a fallback. */
export function findProposal(s: RhumeData, id: string | null): Proposal | undefined {
  if (!id) return undefined;
  return s.results.rh.proposals.find((p) => p.id === id) ?? s.results.rhAuto.proposals.find((p) => p.id === id);
}

/** Newest asOf first; within a date, the engine's west → east order. */
function newestFirst(all: readonly Proposal[]) {
  const order = new Map(all.map((p, i) => [p.id, i]));
  return (a: Proposal, b: Proposal) =>
    a.asOf === b.asOf ? (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) : a.asOf < b.asOf ? 1 : -1;
}
