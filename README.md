# Rhume

A prototype for the UBC BizTech Product+ 2026 SAP case, "Sensing the Shift". Rhume replays the 2023–24 Canadian flu season week by week. It stages each Shoppers Drug Mart region from public-health signals, proposes stock moves, writes a defendable decision brief for each one and "executes" approved moves as simulated SAP documents. A scoreboard compares the outcome with today's sales-following replenishment.

- The engine decides and the AI only explains. Stage, confidence, quantities, costs, expected values and the recommended option come from deterministic code in `lib/engine`. The language model writes prose with `{{placeholders}}`, and code fills in every number.
- On each replay date, the engine, the charts and the briefs see only the data available on that date.
- Works offline. Briefs come from `data/briefs-cache.json`.

Specs: [`docs/PRD.md`](docs/PRD.md) (scope and behaviour) and [`docs/DESIGN.md`](docs/DESIGN.md) (architecture and algorithms).

## Run

```bash
npm install
npm run dev                  # http://localhost:3000
npm test                     # Vitest: engine, simulation, validator, store, presenter
npm run build && npm start   # production build (the venue backup)
npm run test:e2e             # optional Playwright smoke test of the demo path (uses installed Google Chrome)
```

`npm test` runs Vitest only. `npm run test:e2e` starts its own dev server on port 3210, so stop any other `next dev` for this folder first, or point it at a running server with `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`.

The app needs no API key and no network.

| Route | What it is |
|---|---|
| `/` | Workspace: timeline, region tiles, region detail (Signals / Store view, **Dispute stage**), surge cards, weekly executive summary |
| `/scoreboard` | Lead over the lab signal, status quo vs Rhume outcomes, card precision, demand vs stock charts |
| `/log` | Every decision and store-task decline, with **Export JSON** |
| `/settings` | Every engine threshold, labelled *Assumption*, with **Reset to defaults** |

The planner can dispute a region's stage for the current week (**Dispute stage**, a reason is required). The override is display-only: the tile shows "Overridden", it is logged, and the engine's cards are unchanged.

Decisions, settings, the scenario, SAP order numbers, store-task declines and stage overrides persist in the browser's `localStorage`. If storage is unavailable, the app runs in memory.

## Prewarm the AI briefs

Live briefs need a key. For the demo, prewarm the cache once and commit it:

```bash
export ANTHROPIC_API_KEY=sk-ant-...     
export LLM_MODEL=claude-sonnet-5-5       # optional
npm run prewarm                          # writes data/briefs-cache.json
git add data/briefs-cache.json && git commit -m "Prewarm briefs"
```

The prewarm script runs the default season in auto mode. It generates a brief for every card, for the presenter pause point (the first Atlantic store move, reached with every earlier card auto-approved) and for each weekly summary, and logs counts of AI, template and failed briefs. Briefs are cached by evidence-pack hash, so changing a Settings value creates new packs. Those are generated live (with a key) or fall back to the template.

## Real wastewater data (optional)

1. Download the wastewater export from the Health Infobase dashboard and reshape it to this CSV schema (DESIGN.md §6):

   ```csv
   date,region,pathogen,value
   2023-10-02,AB,fluA,12.4
   ```

   `region` is one of `BC, AB, ON, QC, ATL`. Only `fluA` rows are used. Each region is normalized by the median of its first four weeks.
2. Run `npm run import:real -- path/to/export.csv`. This writes `data/season-2023-24.real.json` and regenerates `lib/data/seasonIndex.generated.ts`.
3. If you later add or remove the real file by hand, run `npm run gen:data` to regenerate the season index (the loader imports the real file only when the index points at it). Then restart the dev server.

The real season is evidence only: the replay always runs on the reconstructed season, so the demo numbers do not change when the real file is present. It is shown on the **Evidence** page (`/evidence`), plotted against the reconstructed curve per region with the source and download date. Lab series stay reconstructed, and the labels say so.

A real export is already imported: `data/real/healthinfobase-fluA-2023-24.csv` was reshaped from `https://health-infobase.canada.ca/src/data/wastewater/wastewater_aggregate.csv` (linked from https://health-infobase.canada.ca/wastewater/, downloaded 2026-10-25) with `npx tsx scripts/reshape-healthinfobase.ts wastewater_aggregate.csv data/real/healthinfobase-fluA-2023-24.csv`. Rows are weekly city aggregates (`fluA`, `w_avg`), dated at the end of the sampling week.

## Publication lag

The Ottawa wastewater lead is measured by sample date; public dashboards publish days later. Settings → Signals → *Wastewater publication lag* (an assumption, default 0) makes the engine see a reading only once sample date + lag ≤ the replay date. `npx tsx scripts/lag-sensitivity.ts` prints leads, stockouts, net benefit and the Jan 8 Atlantic card for lag 0, 3, 5 and 7 days in both seasons; the same table is on `/evidence`.

## Presenter mode

The demo is told from the point of view of **Mia Lily, Replenishment Planner, Atlantic** (children's fever and cold medicine), the signed-in planner shown in the header. Her name is on the decisions she makes, the brief's approval line for Atlantic cards and the SAP order's *Created by*.

Press **P** or click **Presenter mode** in the header. This resets to the week of Oct 2, 2023 on the default season, clears decisions, selects Atlantic (Mia's region, which stays selected) and autoplays at one week per 1.5 s. Before entering each week, the presenter auto-approves that week's recommended options, including the season's first card, except at one scripted pause point:

- **Pause:** Atlantic's first store move, week of Jan 8, 2024. Playback stops and the Atlantic tile and its card are highlighted. The pause card is never auto-approved.

After the last week (Mar 25, 2024) it opens the Scoreboard.

| Key | Action |
|---|---|
| `P` | Start (or stop) presenter mode |
| `Space` | Play / pause; resumes after a pause point |
| `→` / `←` | Step one week (→ applies the presenter rules) |
| `B` | Open the brief for the highlighted card |
| `A` | Approve the highlighted card (or the open brief's card); opens the SAP order. `A` again or `Enter` confirms |
| `E` | Edit quantity in the brief |
| `R` | Reject (opens the reason dialog) |
| `S` | Scoreboard |
| `Esc` | Close the dialog, modal or brief drawer |