// Deterministic PRNG (DESIGN.md §5): mulberry32 plus a seeded normal sampler.

export const DEFAULT_SEED = 20231002;

export type Rng = () => number;

/** mulberry32: returns a function producing uniform floats in [0, 1). */
export function mulberry32(seed: number = DEFAULT_SEED): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeded normal sampler (Box–Muller). Each call consumes two uniforms and
 * returns one N(mean, sd) draw, so the draw sequence depends only on call order.
 */
export function normalSampler(rng: Rng): (mean?: number, sd?: number) => number {
  return function normal(mean = 0, sd = 1): number {
    let u1 = rng();
    if (u1 <= Number.EPSILON) u1 = Number.EPSILON; // avoid log(0)
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sd * z;
  };
}
