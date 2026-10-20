// No look-ahead (DESIGN.md §7). Every engine read of a dated series goes through visible().

export interface Dated { date: string }

/** Points with date <= asOf, in their original (date) order. Never index raw series directly. */
export function visible<T extends Dated>(series: readonly T[], asOf: string): T[] {
  // Series are sorted by date, so binary-search the cut point.
  let lo = 0;
  let hi = series.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (series[mid].date <= asOf) lo = mid + 1;
    else hi = mid;
  }
  return series.slice(0, lo);
}

/** Latest visible point as of asOf, or undefined. */
export function latestVisible<T extends Dated>(series: readonly T[], asOf: string): T | undefined {
  const v = visible(series, asOf);
  return v[v.length - 1];
}
