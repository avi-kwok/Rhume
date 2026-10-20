import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { getBrief, getSummary, modelProfile, runAiPipeline } from "../lib/ai/client";
import { render, renderBrief, renderSegments, segmentsToString } from "../lib/ai/placeholders";
import { Brief, BRIEF_JSON_SCHEMA, toStrictSchema } from "../lib/ai/schema";
import { buildRollup, buildSummaryPack } from "../lib/ai/summaryPack";
import { templateBrief, templateSummary } from "../lib/ai/template";
import { countSentences, validate, validateSummary } from "../lib/ai/validate";
import { DEFAULT_SEASON_ID, loadSeason } from "../lib/data/loadSeason";
import { DEFAULT_CONFIG } from "../lib/engine/config";
import { mondaysBetween } from "../lib/engine/dates";
import { EVIDENCE_KEYS, evidencePackFor, hashFields, type EvidencePack, type Field } from "../lib/engine/evidence";
import { proposalsOn } from "../lib/engine/proposals";
import { simulate } from "../lib/engine/simulate";
import {
  formatBool, formatCad, formatDate, formatDays, formatField, formatInt, formatList, formatPct, formatWeekOf,
} from "../lib/format";

const cfg = DEFAULT_CONFIG;
const season = loadSeason(DEFAULT_SEASON_ID);
const auto = simulate(season, cfg, "rhume", "auto");
const packs = auto.proposals.map((p) => evidencePackFor(p, { season, cfg }));

/** A pack where not every signal agrees (so evidence against is required). */
const disagreePack = packs.find((p) => (p.fields.signals_agree.value as number) < (p.fields.signals_total.value as number))!;

function goodBrief(pack: EvidencePack): Brief {
  return templateBrief(pack);
}

function withString(brief: Brief, text: string): Brief {
  return { ...brief, recommendation: text };
}

describe("format", () => {
  it("formats each type", () => {
    expect(formatInt(1840)).toBe("1,840");
    expect(formatInt(1234567)).toBe("1,234,567");
    expect(formatInt(0)).toBe("0");
    expect(formatPct(12)).toBe("12%");
    expect(formatPct(12.4)).toBe("12%");
    expect(formatPct(3.14)).toBe("3.1%");
    expect(formatPct(3)).toBe("3%");
    expect(formatPct(-5.25)).toBe("−5.3%");
    expect(formatCad(6200)).toBe("C$6,200");
    expect(formatCad(6199.6)).toBe("C$6,200");
    expect(formatCad(-2500)).toBe("−C$2,500");
    expect(formatCad(0)).toBe("C$0");
    expect(formatDate("2024-01-08")).toBe("Jan 8, 2024");
    expect(formatDate("2023-11-27")).toBe("Nov 27, 2023");
    expect(formatDays(9)).toBe("9 days");
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(9.34)).toBe("9.3 days");
    expect(formatDays(21)).toBe("21 days");
    expect(formatList(["Alberta", "Ontario"])).toBe("Alberta and Ontario");
    expect(formatList(["A", "B", "C"])).toBe("A, B and C");
    expect(formatList(["Alberta"])).toBe("Alberta");
    expect(formatList([])).toBe("none");
    expect(formatBool(true)).toBe("yes");
    expect(formatBool(false)).toBe("no");
    expect(formatWeekOf("2023-11-06")).toBe("Week of Nov 6, 2023");
  });

  it("dispatches formatField on the field type", () => {
    const f = (value: Field["value"], type: Field["type"]): string => formatField({ value, type, source: "test" });
    expect(f(1840, "int")).toBe("1,840");
    expect(f(12, "pct")).toBe("12%");
    expect(f(6200, "cad")).toBe("C$6,200");
    expect(f("2024-01-08", "date")).toBe("Jan 8, 2024");
    expect(f(9, "days")).toBe("9 days");
    expect(f("Halifax", "text")).toBe("Halifax");
    expect(f(["Alberta", "Ontario"], "list")).toBe("Alberta and Ontario");
    expect(f(true, "bool")).toBe("yes");
    expect(f("n/a", "pct")).toBe("n/a");
  });
});

describe("placeholders", () => {
  const pack: Pick<EvidencePack, "fields"> = {
    fields: {
      move_cases: { value: 1840, type: "int", source: "Engine" },
      probability_pct: { value: 65, type: "pct", source: "Assumption" },
      expected_value_cad: { value: 34100, type: "cad", source: "Engine EV" },
      arrival_date: { value: "2024-01-10", type: "date", source: "Engine" },
      cover_days: { value: 9, type: "days", source: "Simulated" },
      city: { value: "Halifax", type: "text", source: "Region table" },
      upstream_regions: { value: ["Alberta", "Ontario"], type: "list", source: "Engine" },
      reversible: { value: true, type: "bool", source: "Governance" },
    },
  };

  it("renders every field type", () => {
    expect(render("{{move_cases}} cases", pack)).toBe("1,840 cases");
    expect(render("p={{probability_pct}}", pack)).toBe("p=65%");
    expect(render("EV {{expected_value_cad}}", pack)).toBe("EV C$34,100");
    expect(render("arriving {{arrival_date}}", pack)).toBe("arriving Jan 10, 2024");
    expect(render("{{cover_days}} of cover", pack)).toBe("9 days of cover");
    expect(render("{{city}} wastewater", pack)).toBe("Halifax wastewater");
    expect(render("after {{upstream_regions}}", pack)).toBe("after Alberta and Ontario");
    expect(render("reversible: {{reversible}}", pack)).toBe("reversible: yes");
    expect(render("{{ move_cases }}", pack)).toBe("1,840");
    expect(render("{{unknown_key}} stays", pack)).toBe("{{unknown_key}} stays");
  });

  it("returns segments with key, display, raw value and source", () => {
    const segs = renderSegments("Move {{move_cases}} cases to {{city}}.", pack);
    expect(segs).toEqual([
      { text: "Move " },
      { key: "move_cases", display: "1,840", raw: 1840, type: "int", source: "Engine" },
      { text: " cases to " },
      { key: "city", display: "Halifax", raw: "Halifax", type: "text", source: "Region table" },
      { text: "." },
    ]);
    expect(segmentsToString(segs)).toBe("Move 1,840 cases to Halifax.");
  });

  it("renderBrief fills every string field and leaves no placeholder", () => {
    for (const pack of packs) {
      const rendered = renderBrief(templateBrief(pack), pack);
      const all = [rendered.recommendation, ...rendered.why_now, rendered.options_commentary, ...rendered.evidence_against, rendered.what_would_change, rendered.exec_one_liner];
      for (const s of all) expect(s).not.toMatch(/\{\{|\}\}/);
    }
  });
});

describe("validate", () => {
  it("accepts a valid brief", () => {
    expect(validate(goodBrief(disagreePack), disagreePack)).toMatchObject({ ok: true, errors: [] });
  });

  it("rejects a digit outside a placeholder", () => {
    const r = validate(withString(goodBrief(disagreePack), "Move 1840 cases to {{region_name}} stores."), disagreePack);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/digit/);
  });

  it("rejects a spelled-out number (whole word, any case)", () => {
    for (const text of ["Move Twenty cases now.", "Cover is up three percent.", "A thousand cases."]) {
      const r = validate(withString(goodBrief(disagreePack), text), disagreePack);
      expect(r.ok).toBe(false);
      expect(r.errors.join(" ")).toMatch(/number word/);
    }
    // Whole words only: "someone", "often", "none" are fine.
    expect(validate(withString(goodBrief(disagreePack), "Someone often says none of it applies."), disagreePack).ok).toBe(true);
  });

  it("rejects an unknown placeholder", () => {
    const r = validate(withString(goodBrief(disagreePack), "Move {{move_crates}} cases."), disagreePack);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/unknown placeholder \{\{move_crates\}\}/);
  });

  it("rejects an echo mismatch", () => {
    const brief = goodBrief(disagreePack);
    const other = brief.recommended_option_echo === "full" ? "none" : "full";
    const r = validate({ ...brief, recommended_option_echo: other }, disagreePack);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/recommended_option_echo/);
  });

  it("rejects evidence against with no disagreeing-signal placeholder when signals disagree", () => {
    const r = validate({ ...goodBrief(disagreePack), evidence_against: ["The signal could still turn out to be noise."] }, disagreePack);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/evidence_against/);
  });

  it("rejects a schema failure (empty evidence against, too long, missing field)", () => {
    const b = goodBrief(disagreePack);
    expect(validate({ ...b, evidence_against: [] }, disagreePack).ok).toBe(false);
    expect(validate({ ...b, exec_one_liner: "x".repeat(161) }, disagreePack).ok).toBe(false);
    const missing: Partial<Brief> = { ...b };
    delete missing.what_would_change;
    expect(validate(missing, disagreePack).ok).toBe(false);
    expect(validate("not an object", disagreePack).ok).toBe(false);
  });

  it("accepts the template brief for every default-season proposal", () => {
    expect(packs.length).toBeGreaterThan(0);
    const kinds = new Set(auto.proposals.map((p) => p.kind));
    expect(kinds).toEqual(new Set(["dc_preposition", "store_move"]));
    for (const pack of packs) {
      const r = validate(templateBrief(pack), pack);
      expect(r.errors, pack.proposalId).toEqual([]);
      expect(r.ok).toBe(true);
    }
  });

  it("template evidence against is never empty and names disagreeing signals and the season caveat", () => {
    for (const pack of packs) {
      const ea = templateBrief(pack).evidence_against.join(" ");
      expect(ea.length).toBeGreaterThan(0);
      const disagreeing = pack.fields.disagreeing_signals.value as string[];
      if (disagreeing.length) expect(ea).toContain("{{disagreeing_signals}}");
      const neighbourReason = (pack.fields.upstream_regions.value as string[]).length > 0;
      if (neighbourReason) expect(ea).toContain("{{season_caveat}}");
    }
  });

  it("template briefs stay valid on the 2024–25 season and when the engine recommends none", () => {
    const s2 = loadSeason("2024-25");
    for (const p of simulate(s2, cfg, "rhume", "auto").proposals) {
      const pack = evidencePackFor(p, { season: s2, cfg });
      expect(validate(templateBrief(pack), pack).errors, pack.proposalId).toEqual([]);
    }
    // Force recommended = none on a real pack (fields + hash rebuilt) to cover the hold wording.
    for (const base of packs.slice(0, 6)) {
      const fields = { ...base.fields, recommended_option: { ...base.fields.recommended_option, value: "none" } };
      const pack: EvidencePack = { ...base, fields, hash: hashFields(fields) };
      const brief = templateBrief(pack);
      expect(brief.recommended_option_echo).toBe("none");
      expect(brief.recommendation).toMatch(/^Hold/);
      expect(validate(brief, pack).errors).toEqual([]);
    }
  });

  it("every pack exposes exactly the whitelist", () => {
    for (const pack of packs) expect(Object.keys(pack.fields).sort()).toEqual([...EVIDENCE_KEYS].sort());
  });
});

describe("executive summary", () => {
  const mondays = mondaysBetween(season.startDate, season.endDate);

  it("template summary validates for every week (at most three sentences)", () => {
    for (const monday of mondays) {
      const pack = buildSummaryPack(buildRollup(proposalsOn(auto.proposals, monday), monday, cfg));
      const s = templateSummary(pack);
      const r = validateSummary(s, pack);
      expect(r.errors, monday).toEqual([]);
      expect(render(s.paragraph, pack)).not.toMatch(/\{\{/);
    }
  });

  it("rejects digits, number words, unknown placeholders and more than three sentences", () => {
    const pack = buildSummaryPack(buildRollup(proposalsOn(auto.proposals, auto.proposals[0].asOf), auto.proposals[0].asOf, cfg));
    expect(validateSummary({ paragraph: "Approve 120 cases." }, pack).ok).toBe(false);
    expect(validateSummary({ paragraph: "Approve two moves." }, pack).ok).toBe(false);
    expect(validateSummary({ paragraph: "Approve {{total_crates}} cases." }, pack).ok).toBe(false);
    expect(validateSummary({ paragraph: "A. B. C. D." }, pack).ok).toBe(false);
    expect(countSentences("Cost {{total_cost_cad}}. Value {{total_ev_cad}}.")).toBe(2);
  });
});

describe("tool schema", () => {
  it("strict schema drops length and count constraints but keeps structure", () => {
    const strict = toStrictSchema(BRIEF_JSON_SCHEMA);
    const text = JSON.stringify(strict);
    expect(text).not.toMatch(/maxLength|minItems|maxItems/);
    expect(strict.additionalProperties).toBe(false);
    expect(strict.required).toEqual(Object.keys(Brief.shape));
  });

  it("shapes requests per model", () => {
    expect(modelProfile("claude-sonnet-5-5")).toMatchObject({ forcedToolChoice: false, temperature: false, thinking: { type: "between_tools" } });
    expect(modelProfile("claude-sonnet-4-6")).toMatchObject({ forcedToolChoice: true, temperature: true });
    expect(modelProfile("claude-opus-5")).toMatchObject({ forcedToolChoice: true, temperature: false });
  });
});

// ---------------------------------------------------------------------------------------------
// Pipeline with a fake Anthropic client (no network, no key).
// ---------------------------------------------------------------------------------------------

type Call = { tool: string; user: string; params: Record<string, unknown> };

function fakeClient(script: (call: Call, n: number) => unknown | Promise<unknown>): { client: Anthropic; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    messages: {
      create: async (params: Record<string, unknown>) => {
        const tool = (params.tools as { name: string }[])[0].name;
        const user = (params.messages as { content: string }[])[0].content;
        const call = { tool, user, params };
        calls.push(call);
        const input = await script(call, calls.length);
        return { stop_reason: "tool_use", content: [{ type: "tool_use", id: `t${calls.length}`, name: tool, input }] };
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

describe("pipeline (fake client)", () => {
  const pack = disagreePack;
  const valid = templateBrief(pack);

  it("writer → critic pass → ai", async () => {
    const { client, calls } = fakeClient((c) => (c.tool === "write_brief" ? valid : { verdict: "pass", issues: [] }));
    const res = await runAiPipeline(pack, { client, model: "claude-sonnet-5-5" });
    expect(res).toMatchObject({ source: "ai", critic: "pass", model: "claude-sonnet-5-5", hash: pack.hash });
    expect(calls.map((c) => c.tool)).toEqual(["write_brief", "review_brief"]);
    expect(calls[0].params.tool_choice).toEqual({ type: "auto" });
    expect(calls[0].params).not.toHaveProperty("temperature");
  });

  it("uses forced tool_choice and temperature on models that accept them", async () => {
    const { client, calls } = fakeClient((c) => (c.tool === "write_brief" ? valid : { verdict: "pass", issues: [] }));
    await runAiPipeline(pack, { client, model: "claude-sonnet-4-6" });
    expect(calls[0].params.tool_choice).toEqual({ type: "tool", name: "write_brief" });
    expect(calls[0].params.temperature).toBe(0.2);
    expect(calls[0].params.max_tokens).toBe(800);
  });

  it("retries once with validation errors appended", async () => {
    const { client, calls } = fakeClient((c, n) =>
      c.tool === "write_brief" ? (n === 1 ? withString(valid, "Move 1840 cases.") : valid) : { verdict: "pass", issues: [] },
    );
    const res = await runAiPipeline(pack, { client, model: "claude-sonnet-5-5" });
    expect(res.critic).toBe("pass");
    expect(calls.map((c) => c.tool)).toEqual(["write_brief", "write_brief", "review_brief"]);
    expect(calls[1].user).toMatch(/rejected by the validator/);
    expect(calls[1].user).toMatch(/digit/);
  });

  it("regenerates once on revise, without a second critic pass", async () => {
    const { client, calls } = fakeClient((c) =>
      c.tool === "write_brief" ? valid : { verdict: "revise", issues: [{ field: "evidence_against", problem: "understated" }] },
    );
    const res = await runAiPipeline(pack, { client, model: "claude-sonnet-5-5" });
    expect(res.critic).toBe("revised");
    expect(calls.map((c) => c.tool)).toEqual(["write_brief", "review_brief", "write_brief"]);
    expect(calls[2].user).toMatch(/understated/);
  });

  it("falls back to the template after two validation failures, an exception, or the deadline", async () => {
    const bad = fakeClient((c) => (c.tool === "write_brief" ? withString(valid, "three") : { verdict: "pass", issues: [] }));
    const r1 = await getBrief({ ...pack, hash: "a".repeat(64) }, { client: bad.client, model: "claude-sonnet-5-5" });
    expect(r1).toMatchObject({ source: "template", critic: "skipped" });
    expect(bad.calls).toHaveLength(2);

    const boom = fakeClient(() => {
      throw new Error("network down");
    });
    const r2 = await getBrief({ ...pack, hash: "b".repeat(64) }, { client: boom.client });
    expect(r2.source).toBe("template");

    // A hung API call is aborted at the pipeline deadline.
    const hung = {
      messages: {
        create: (_params: unknown, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => opts.signal.addEventListener("abort", () => reject(new Error("aborted")))),
      },
    } as unknown as Anthropic;
    const t0 = Date.now();
    const r3 = await getBrief({ ...pack, hash: "c".repeat(64) }, { client: hung, budgetMs: 2_500 });
    expect(r3.source).toBe("template");
    expect(Date.now() - t0).toBeLessThan(4_000);
  });

  it("serves a second identical request from cache", async () => {
    const { client, calls } = fakeClient((c) => (c.tool === "write_brief" ? valid : { verdict: "pass", issues: [] }));
    const first = await getBrief(pack, { client, model: "claude-sonnet-5-5" });
    expect(first.source).toBe("ai");
    const second = await getBrief(pack, { client, model: "claude-sonnet-5-5" });
    expect(second).toMatchObject({ source: "cache", critic: "pass" });
    expect(calls).toHaveLength(2);
  });

  it("without a key returns the template brief and summary", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const p = packs[packs.length - 1];
      const res = await getBrief(p);
      expect(res).toMatchObject({ source: "template", critic: "skipped", model: "template", hash: p.hash });
      const monday = auto.proposals[0].asOf;
      const sum = await getSummary(buildRollup(proposalsOn(auto.proposals, monday), monday, cfg));
      expect(sum.source).toBe("template");
      expect(sum.rendered).not.toMatch(/\{\{/);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
