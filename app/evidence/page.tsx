import EvidenceCharts from "@/components/EvidenceCharts";
import { monthTicks, seasonDomain } from "@/lib/chartData";
import { loadRealSeason, loadReconstructedSeason } from "@/lib/data/loadSeason";
import { REGION_BY_ID, REGION_IDS } from "@/lib/data/regions";
import {
  downloadedOn,
  REAL_SOURCE_FILE,
  REAL_SOURCE_PAGE,
  regionEvidence,
  RISE_SHARE,
  RISE_WINDOW_WEEKS,
} from "@/lib/evidenceData";
import { formatCad, formatDate } from "@/lib/format";
import { DEMO_CARD_ID, lagSensitivity, type LagCard, type LagRow } from "@/lib/lagSensitivity";

// Evidence (read-only). Computed once at build time from the same engine the replay runs on, with
// default assumptions. The replay itself always runs on the reconstructed season.

const short = (iso: string | null) => (iso ? formatDate(iso).replace(/, \d{4}$/, "") : "none");
const days = (n: number | null) => (n === null ? "—" : String(n));
const signedDays = (n: number | null) => (n === null ? "—" : n === 0 ? "same week" : `${Math.abs(n)} days ${n < 0 ? "earlier" : "later"}`);
const cardText = (c: LagCard | null) => (c ? `${short(c.asOf)}: ${c.cases.toLocaleString("en-CA")} cases, EV ${formatCad(c.evCad)}` : "does not appear");

function LagTable({ rows, seasonId }: { rows: LagRow[]; seasonId: LagRow["seasonId"] }) {
  const sel = rows.filter((r) => r.seasonId === seasonId);
  const isDemo = seasonId === "2023-24";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <caption className="mb-1 text-left text-xs font-semibold text-ink">{sel[0]?.seasonLabel}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="py-1.5 pr-3 font-medium">Publication lag</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Atlantic lead, watch</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Atlantic lead, rising</th>
            {REGION_IDS.map((id) => (
              <th key={id} scope="col" className="py-1.5 pr-3 text-right font-medium" title={REGION_BY_ID[id].name}>
                {id} lead
              </th>
            ))}
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Stockout region-days, status quo → Rhume</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Net benefit</th>
            <th scope="col" className="py-1.5 font-medium">{isDemo ? "Jan 8 Atlantic card" : "First Atlantic store move"}</th>
          </tr>
        </thead>
        <tbody>
          {sel.map((r) => (
            <tr key={r.lagDays} className={`border-b border-line last:border-b-0 ${r.lagDays === 0 ? "font-semibold" : ""}`}>
              <th scope="row" className="py-1.5 pr-3 text-left font-medium text-ink">
                {r.lagDays} days{r.lagDays === 0 ? " (demo default)" : ""}
              </th>
              <td className="py-1.5 pr-3 text-right tabular">{days(r.atlLeadWatch)}</td>
              <td className="py-1.5 pr-3 text-right tabular">{days(r.atlLeadRising)}</td>
              {REGION_IDS.map((id) => (
                <td key={id} className="py-1.5 pr-3 text-right tabular">
                  {days(r.leads[id])}
                </td>
              ))}
              <td className="py-1.5 pr-3 text-right tabular">
                {r.stockoutStatusQuo} → {r.stockoutRhume}
              </td>
              <td className="py-1.5 pr-3 text-right tabular">{formatCad(r.netBenefitCad)}</td>
              <td className="py-1.5 tabular">
                {isDemo
                  ? r.demoCard
                    ? cardText(r.demoCard)
                    : `does not appear; first store move ${cardText(r.firstAtlStoreMove)}`
                  : cardText(r.firstAtlStoreMove)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EvidencePage() {
  const reconstructed = loadReconstructedSeason();
  const real = loadRealSeason();
  const regions = real ? regionEvidence(real, reconstructed) : [];
  const downloaded = real ? downloadedOn(real) : null;
  const lagRows = lagSensitivity();
  const demo0 = lagRows.find((r) => r.seasonId === "2023-24" && r.lagDays === 0)!;
  const demo7 = lagRows.find((r) => r.seasonId === "2023-24" && r.lagDays === 7)!;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <div>
        <p className="section-label">Evidence</p>
        <h1 className="text-[22px] leading-7 font-semibold text-ink">Real wastewater, and the warning left after publication lag</h1>
        <p className="text-sm text-muted">
          Read-only. The replay runs on the reconstructed season; this page checks it against the public record and stress-tests the lead time.
        </p>
      </div>

      <section className="card p-4" aria-labelledby="real-data">
        <h2 id="real-data" className="section-label mb-1">
          Real flu A wastewater vs our reconstruction, 2023–24
        </h2>
        {real ? (
          <>
            <p className="mb-3 text-sm text-ink">
              Source: Public Health Agency of Canada, Health Infobase wastewater dashboard (
              <a className="underline" href={REAL_SOURCE_PAGE}>
                {REAL_SOURCE_PAGE}
              </a>
              ), file{" "}
              <a className="underline" href={REAL_SOURCE_FILE}>
                wastewater_aggregate.csv
              </a>
              , measure <code>fluA</code>, city aggregate rows (Metro Vancouver, Edmonton, Toronto, Montreal, Halifax). Downloaded{" "}
              {downloaded ? formatDate(downloaded) : "n/a"}.{" "}
              {regions.reduce((s, e) => s + e.realRows, 0)} weekly readings in the Oct 2, 2023 to Mar 31, 2024 window. Lab series stay reconstructed.
            </p>
            <EvidenceCharts regions={regions} domain={seasonDomain(reconstructed)} ticks={monthTicks(reconstructed)} />
            <p className="mt-2 text-xs text-muted">
              Both lines are on one scale: weekly average (Sunday to Saturday, dated at the week&apos;s end) minus the median of the first four weeks,
              as a share of that series&apos; own season peak. Real values are concentrations; ours are multiples of baseline, so only timing and shape are
              comparable. Dotted lines mark the first rise.
            </p>

            <table className="mt-3 w-full text-sm">
              <caption className="mb-1 text-left text-xs text-muted">
                First rise = first week the {RISE_WINDOW_WEEKS}-week trailing mean reaches {Math.round(RISE_SHARE * 100)}% of its season maximum
                (retrospective). Engine rule = first reading where the wastewater check passes (≥ 1.5× baseline, two rises in a row).
              </caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th scope="col" className="py-1.5 pr-3 font-medium">Region</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Real first rise (week ending)</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Reconstructed first rise</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Real vs reconstructed</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Engine rule on real data</th>
                  <th scope="col" className="py-1.5 font-medium">Engine rule on reconstructed</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((e) => (
                  <tr key={e.regionId} className="border-b border-line last:border-b-0">
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium text-ink">
                      {REGION_BY_ID[e.regionId].name} <span className="font-normal text-muted">({REGION_BY_ID[e.regionId].city})</span>
                    </th>
                    <td className="py-1.5 pr-3 tabular">{e.realFirstRise ? formatDate(e.realFirstRise) : "none"}</td>
                    <td className="py-1.5 pr-3 tabular">{e.reconstructedFirstRise ? formatDate(e.reconstructedFirstRise) : "none"}</td>
                    <td className="py-1.5 pr-3 tabular">{signedDays(e.riseGapDays)}</td>
                    <td className="py-1.5 pr-3 tabular">{e.realFirstW ? formatDate(e.realFirstW) : "never"}</td>
                    <td className="py-1.5 tabular">{e.reconstructedFirstW ? formatDate(e.reconstructedFirstW) : "never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">
              Read with care: real early-season values sit at the lab&apos;s detection floor, so a ratio-to-baseline rule fires on noise in October
              for several cities. Production replaces that rule with change-point detection (Models). The replay keeps the reconstructed curves.
            </p>
          </>
        ) : (
          <p className="text-sm text-ink">
            Real data was not fetched: no <code>data/season-2023-24.real.json</code> is present. Nothing on this page is drawn from real
            wastewater. See README, &ldquo;Real wastewater data&rdquo;.
          </p>
        )}
      </section>

      <section className="card p-4" aria-labelledby="lag">
        <h2 id="lag" className="section-label mb-1">
          Publication lag sensitivity
        </h2>
        <p className="mb-3 text-sm text-ink">
          The 14 to 21-day wastewater lead (Ottawa study) is measured by sample date, but public dashboards publish days later. With a lag of L days the
          engine only sees a reading once its sample date + L ≤ the replay date (Settings, &ldquo;Wastewater publication lag&rdquo;, an
          assumption, default 0). Lead = lab onset (first reported positivity ≥ 5%) minus the first flag, in days; reconstructed seasons, default
          assumptions otherwise. At 7 days the Atlantic rising lead drops from {days(demo0.atlLeadRising)} to {days(demo7.atlLeadRising)} days, and
          net benefit from {formatCad(demo0.netBenefitCad)} to {formatCad(demo7.netBenefitCad)}.
        </p>
        <div className="flex flex-col gap-4">
          <LagTable rows={lagRows} seasonId="2023-24" />
          <LagTable rows={lagRows} seasonId="2024-25" />
        </div>
        <p className="mt-2 text-xs text-muted">
          The engine runs on Mondays and wastewater is sampled twice a week (Monday and Thursday), so lag acts in steps: 1 to 3 days hides
          Monday&apos;s reading, 4 to 7 days also hides Thursday&apos;s. That is why 5 and 7 days match, and why 3 days can look worse than 5: which
          noisy reading is latest decides whether &ldquo;two rises in a row&rdquo; holds that Monday. Demo card: {DEMO_CARD_ID}.
        </p>
      </section>
    </div>
  );
}
