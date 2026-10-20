# Rhume

A prototype for the UBC BizTech Product+ 2026 SAP case, "Sensing the Shift". Rhume replays the 2023–24 Canadian flu season week by week. It stages each Shoppers Drug Mart region from public-health signals, proposes stock moves, writes a defendable decision brief for each one and "executes" approved moves as simulated SAP documents. A scoreboard compares the outcome with today's sales-following replenishment.

- The engine decides and the AI only explains. Stage, confidence, quantities, costs, expected values and the recommended option come from deterministic code in `lib/engine`. The language model writes prose with `{{placeholders}}`, and code fills in every number.
- No look-ahead. On each replay date, the engine, the charts and the briefs see only the data available on that date.
- Works offline. Briefs come from `data/briefs-cache.json`. If no API key is set or the network is down, a deterministic template brief is used and labelled *Template brief*.

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
export ANTHROPIC_API_KEY=sk-ant-...      # never commit this; .env* is git-ignored
export LLM_MODEL=claude-sonnet-5-5       # optional; check the current model id in the Anthropic docs first
npm run prewarm                          # writes data/briefs-cache.json
git add data/briefs-cache.json && git commit -m "Prewarm briefs"
```

The prewarm script runs the default season in auto mode. It generates a brief for every card, for both presenter pause points (including the path where the first pause card is not approved) and for each weekly summary, and logs counts of AI, template and failed briefs. Briefs are cached by evidence-pack hash, so changing a Settings value creates new packs. Those are generated live (with a key) or fall back to the template.

## Real wastewater data (optional)

1. Download the wastewater export from the Health Infobase dashboard and reshape it to this CSV schema (DESIGN.md §6):

   ```csv
   date,region,pathogen,value
   2023-10-02,AB,fluA,12.4
   ```

   `region` is one of `BC, AB, ON, QC, ATL`. Only `fluA` rows are used. Each region is normalized by the median of its first four weeks.
2. Run `npm run import:real -- path/to/export.csv`. This writes `data/season-2023-24.real.json` and regenerates `lib/data/seasonIndex.generated.ts`.
3. If you later add or remove the real file by hand, run `npm run gen:data` to regenerate the season index (the loader imports the real file only when the index points at it). Then restart the dev server.

The Header badge switches to *Real data: Health Infobase export*. Lab series stay reconstructed, and the labels say so.

## Presenter mode

Press **P** or click **Presenter mode** in the header. This resets to the week of Oct 2, 2023 on the default season, clears decisions and autoplays at one week per 1.5 s. Before entering each week, the presenter auto-approves that week's recommended options, except at two scripted pause points. At a pause point it stops, highlights the card and selects its region. Pause cards are never auto-approved.

- **Pause 1:** the first card of the season (Ontario store move, week of Nov 13, 2023).
- **Pause 2:** the first Atlantic store move (week of Jan 8, 2024).

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

Hotkeys never fire while you type in a form field.

**Demo script (90 s, PRD §10):**

1. "This is the 2023–24 flu season, replayed week by week. The system only sees what was known on each date." Press `P`.
2. Pause 1: "Toronto's wastewater rose two readings in a row and Alberta is already peaking. The first region always gets the least warning." Press `A`, `A` to approve (a card left undecided expires as do nothing), then `Space`.
3. Playback continues. Atlantic turns *watch* in December on the neighbour signal, and its DC pre-position card is auto-decided.
4. Pause 2: Atlantic's first store move. Press `B` and read the recommendation, the evidence against and what would change it. Press `A` to show the SAP order, then `A` to confirm. Press `Space`.
5. End on the Scoreboard: Atlantic's lead over its lab signal and stockout days versus following last week's sales, in this simulation.
6. If asked about limits, switch the scenario to 2024–25 (synchronized). When regions peak together, the lead shrinks.

## Deploy (Vercel)

Import the repository with the default Next.js settings. There is one optional environment variable, `ANTHROPIC_API_KEY`, needed only for live generation; `LLM_MODEL` is optional too. With `data/briefs-cache.json` committed, the deployed demo serves cached AI briefs without a key. For the Summit, also run `npm run build && npm start` locally as a backup in case the venue Wi-Fi fails.

## Data honesty

| Data | Default source | Label shown in the UI |
|---|---|---|
| Wastewater flu A by city | Reconstructed curves matching Statistics Canada's published 2023–24 onset timing | "Reconstructed from published onset timing (Statistics Canada, 2023–24)" |
| Same, real mode | CSV export from the Health Infobase wastewater dashboard, reshaped to our schema | "Real data: Health Infobase export, downloaded [date]" |
| Reported lab positivity | Reconstructed: true illness curve shifted by a configurable lag, with a reporting delay | "Reconstructed; lag is an assumption" |
| Store and DC stock, demand, sales | Simulated from business-case assumptions | "Simulated" |
| SAP documents (stock transport order, allocation table) | Simulated; sub-areas and child-share indices are simulated | "Simulated, no SAP connection" |
| Thresholds, costs, lead times, probabilities | Assumptions (DESIGN.md §8) | "Assumption" in Settings |

Reconstructed or simulated data is never called real.

## Known limits

- One product group, five aggregate regions. Stores are not modelled individually; the allocation table's five sub-areas per region are a simulated split.
- Signal curves are reconstructed from onset timing; their shapes, the lab lag and the reporting delay are assumptions.
- The outcome table is a simulation under stated assumptions, not the business-case model. Status quo and Rhume share the same simulated demand.
- In the 2024–25 synchronized scenario, neighbour timing gives little warning, so lead days shrink. This is shown on purpose.
- No SAP, Joule Studio or Business Data Cloud connection. SAP documents are display-only.
- The executive summary and the briefs explain engine output. They never change the recommendation, and the validator rejects any digit written by the model.
- Decisions live in one browser's `localStorage`. There are no accounts and no multi-user state.
- Changing a Settings value changes evidence-pack hashes, so prewarmed briefs no longer match. They are regenerated live or fall back to the template.
