// The mash operator: a run-length interleave model for sleeved "mash"
// shuffles, NOT a GSR drop model.
//
// Physical picture: cut off a small packet (splitMean ± splitSd cards,
// optionally offset into the deck by offsetMean ± offsetSd — the
// bridge-style "top card always changes" habit), then mash the two packets
// together. The result is built as alternating runs: on entering a packet a
// run length is drawn from a shifted-geometric distribution with mean mu
// (mu=1 ⇒ every run is 1 card ⇒ strict alternation ⇒ faro-like; mu≈2 ⇒
// GSR-like; mu>2 ⇒ clumpy), truncated to what remains. Interleaving runs
// until the SMALL packet is exhausted; the big packet's remainder drops as
// one ordered block (a 30/70 mash of 100 cards leaves a ~40-card ordered
// remnant) on the configured end.

import type { PRNG } from './prng';

export interface MashConfig {
  /** mean size of the small packet (e.g. 30 of 100) */
  splitMean: number;
  /** SD of the small packet size (0 = exact) */
  splitSd: number;
  /** mean run length; 1 = strict alternation, ~2 = GSR-like, >2 = clumpy */
  mu: number;
  /** mean of the pre-cut offset (cards rotated top→bottom before splitting) */
  offsetMean: number;
  /** SD of the pre-cut offset */
  offsetSd: number;
  /** which end of the resulting deck the big packet's ordered remnant lands on */
  remnantEnd: 'top' | 'bottom';
  /**
   * Optional mu profile along the deck: effective mu at build position t
   * (0..1) is mu * (1 + positionDependence * (2t-1)^2) — clumpier at the
   * ends for positive values, 0 = uniform mu everywhere.
   */
  positionDependence?: number;
}

export const DEFAULT_MASH: MashConfig = {
  splitMean: 30,
  splitSd: 3,
  mu: 1.3,
  offsetMean: 0,
  offsetSd: 0,
  remnantEnd: 'bottom',
  positionDependence: 0,
};

// Per-deck-size packet buffers so repeated mashes allocate nothing.
const bufCache = new Map<number, { a: Int16Array; b: Int16Array }>();
function buffers(n: number): { a: Int16Array; b: Int16Array } {
  let b = bufCache.get(n);
  if (!b) {
    b = { a: new Int16Array(n), b: new Int16Array(n) };
    bufCache.set(n, b);
  }
  return b;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Shifted geometric on {1,2,…} with mean mu (p = 1/mu), truncated to cap. */
function runLength(mu: number, cap: number, rng: PRNG): number {
  if (cap <= 1) return cap;
  const p = 1 / Math.max(1, mu);
  let len = 1;
  while (len < cap && rng.nextFloat() > p) len++;
  return len;
}

export interface MashDraw {
  /** actual small-packet size this shuffle */
  split: number;
  /** actual pre-cut offset this shuffle */
  offset: number;
}

/**
 * One mash shuffle, in place. `scratch` must be the same length as `deck`.
 * Returns the sampled split/offset (used by fitting round-trips).
 */
export function mash(deck: Int16Array, scratch: Int16Array, rng: PRNG, cfg: MashConfig): MashDraw {
  const n = deck.length;
  const { a: A, b: B } = buffers(n);

  const s = clamp(Math.round(cfg.splitMean + cfg.splitSd * rng.nextGaussian()), 1, n - 1);
  const offset =
    cfg.offsetMean === 0 && cfg.offsetSd === 0
      ? 0
      : clamp(Math.round(cfg.offsetMean + cfg.offsetSd * rng.nextGaussian()), 0, n - 1);

  // Pre-cut rotation by `offset`, then split: small packet = top s cards.
  for (let i = 0; i < s; i++) A[i] = deck[(i + offset) % n]!;
  for (let i = s; i < n; i++) B[i - s] = deck[(i + offset) % n]!;
  const nB = n - s;

  const fromTop = cfg.remnantEnd === 'bottom';
  const posDep = cfg.positionDependence ?? 0;

  // Build the interleave zone consuming the small packet completely. For
  // remnantEnd='bottom' we consume packet heads and build top-down; for
  // remnantEnd='top' we consume packet tails and build bottom-up — the
  // remnant (B's unconsumed part) then sits at the top. Within-packet order
  // is preserved in both directions.
  let ia = 0;
  let ib = 0;
  let k = 0; // cards written
  let turnA = rng.nextInt(2) === 0;
  while (ia < s && ib < nB) {
    const t = k / n;
    const muEff = Math.max(1, cfg.mu * (1 + posDep * (2 * t - 1) * (2 * t - 1)));
    if (turnA) {
      const len = runLength(muEff, s - ia, rng);
      for (let i = 0; i < len; i++, ia++, k++) {
        scratch[fromTop ? k : n - 1 - k] = fromTop ? A[ia]! : A[s - 1 - ia]!;
      }
    } else {
      const len = runLength(muEff, nB - ib, rng);
      for (let i = 0; i < len; i++, ib++, k++) {
        scratch[fromTop ? k : n - 1 - k] = fromTop ? B[ib]! : B[nB - 1 - ib]!;
      }
    }
    turnA = !turnA;
  }
  // Leftovers drop as ordered blocks (normally only B has any; A can run the
  // table if the small packet outlasts the big one).
  while (ia < s) {
    scratch[fromTop ? k : n - 1 - k] = fromTop ? A[ia]! : A[s - 1 - ia]!;
    ia++;
    k++;
  }
  while (ib < nB) {
    scratch[fromTop ? k : n - 1 - k] = fromTop ? B[ib]! : B[nB - 1 - ib]!;
    ib++;
    k++;
  }
  deck.set(scratch);
  return { split: s, offset };
}

/** Partially-applied form matching the ShuffleFn signature. */
export function makeMashShuffle(cfg: MashConfig) {
  return (deck: Int16Array, scratch: Int16Array, rng: PRNG): void => {
    mash(deck, scratch, rng, cfg);
  };
}
