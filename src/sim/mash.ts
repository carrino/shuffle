// The mash operator: a run-length interleave model for sleeved "mash"
// shuffles, NOT a GSR drop model.
//
// Physical mechanic (this is the important part): the small packet is lifted
// from the BOTTOM of the deck (splitMean ± splitSd cards) and mashed into
// the rest from the top — its leading cards become the new top of the deck.
// In a 100-card deck with a ~35 split, the cards at old positions ~65–67
// become new positions 0–2, interleaving proceeds downward from there, and
// the unconsumed tail of the big packet settles as one ordered block at the
// bottom. Because the bottom block moves to the top on every shuffle, cards
// CYCLE through the deck — there are no cold spots by design.
//
// Before any interleaving happens, the lifted packet's head "hangs over"
// the top: the first `overhang` cards drop as one block (old positions
// ~65-67 becoming new 0-2 IS an overhang of 3), and interleaving starts
// below them. In pass 1 — before real clump data — the randomness comes
// entirely from the bottom-cut size (splitMean ± splitSd) and the overhang
// (overhangMean ± overhangSd).
//
// The interleave itself is a run-length model: on entering a packet a run
// length is drawn from a shifted-geometric distribution with mean mu (mu=1 ⇒
// every run is 1 card ⇒ perfect interleaving; larger mu ⇒ clumpier),
// truncated to what remains. Interleaving runs until the SMALL packet is
// exhausted; the big packet's remainder drops as one ordered block (a 30/70
// mash of 100 cards leaves a ~40-card ordered remnant). The baseline
// question is "how many shuffles at mu=1 (perfect interleaving)?"; fitted
// real-world clump rates (mu > 1) then adjust it.

import type { PRNG } from './prng';

export interface MashConfig {
  /** mean size of the small (bottom-lifted) packet, e.g. 35 of 100 */
  splitMean: number;
  /** SD of the small packet size (0 = exact) */
  splitSd: number;
  /** mean run length; 1 = perfect interleaving, >1 = clumpy */
  mu: number;
  /**
   * Mean overhang: how many lifted-packet cards sit above the mesh as one
   * block before interleaving starts. NEGATIVE means the lifted packet is
   * seated below flush, so |overhang| big-packet cards stay on top before
   * the first lifted card. 0 = flush (interleaving starts immediately with
   * the lifted packet). Directly observable in two-color data as the
   * leading run: small-color run = +overhang, big-color run = -overhang.
   */
  overhangMean: number;
  /** SD of the overhang */
  overhangSd: number;
  /**
   * Optional EMPIRICAL run-length distribution (index i = P(run length
   * i+1)), e.g. fitted from real two-color data. When present it replaces
   * the geometric(mu) model entirely (mu and positionDependence are
   * ignored); runs are sampled from it and truncated to what remains.
   */
  runDist?: readonly number[];
  /**
   * Which end of the result the big packet's ordered remnant lands on.
   * 'bottom' is the physical default (mash into the top, remainder settles
   * underneath); 'top' models mashing the lifted packet in from below.
   */
  remnantEnd: 'top' | 'bottom';
  /**
   * Optional mu profile along the deck: effective mu at build position t
   * (0..1) is mu * (1 + positionDependence * (2t-1)^2) — clumpier at the
   * ends for positive values, 0 = uniform mu everywhere.
   */
  positionDependence?: number;
  /**
   * Interleave model. 'runs' (default) is the mash run-length model
   * (geometric(mu) or runDist). 'gsr' replaces it with the classic GSR drop
   * rule — each card comes from a packet with probability proportional to
   * its remaining size — while keeping the same cut and overhang mechanics.
   * This is the apples-to-apples riffle baseline: same hands, different
   * interleave. mu, runDist and positionDependence are ignored.
   */
  interleave?: 'runs' | 'gsr';
}

export const DEFAULT_MASH: MashConfig = {
  splitMean: 35,
  splitSd: 3,
  mu: 1,
  overhangMean: 3,
  overhangSd: 2,
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

/** Sample from an empirical run-length distribution, truncated to cap. */
function runLengthEmpirical(dist: readonly number[], cap: number, rng: PRNG): number {
  if (cap <= 1) return cap;
  let u = rng.nextFloat();
  let total = 0;
  for (const p of dist) total += p;
  u *= total; // tolerate unnormalized histograms
  for (let i = 0; i < dist.length; i++) {
    u -= dist[i]!;
    if (u <= 0) return Math.min(i + 1, cap);
  }
  return Math.min(dist.length, cap);
}

export interface MashDraw {
  /** actual small-packet size this shuffle */
  split: number;
  /** actual overhang this shuffle */
  overhang: number;
}

/**
 * One mash shuffle, in place. `scratch` must be the same length as `deck`.
 * Returns the sampled split/overhang (used by fitting round-trips).
 *
 * With split s, the small packet A is the deck's bottom s cards
 * (A[i] = deck[n-s+i]); the big packet B is the top n-s. A's first
 * `overhang` cards drop as one block on top, then run-length interleaving
 * alternates starting from B.
 */
export function mash(deck: Int16Array, scratch: Int16Array, rng: PRNG, cfg: MashConfig): MashDraw {
  const n = deck.length;
  const { a: A, b: B } = buffers(n);

  const s = clamp(Math.round(cfg.splitMean + cfg.splitSd * rng.nextGaussian()), 1, n - 1);
  const nB = n - s;
  const overhang =
    cfg.overhangSd === 0
      ? clamp(Math.round(cfg.overhangMean), -(nB - 1), s)
      : clamp(Math.round(cfg.overhangMean + cfg.overhangSd * rng.nextGaussian()), -(nB - 1), s);

  // Lift the BOTTOM s cards as the small packet A; the top n-s stay as B.
  for (let i = 0; i < s; i++) A[i] = deck[nB + i]!;
  for (let i = 0; i < nB; i++) B[i] = deck[i]!;

  const fromTop = cfg.remnantEnd === 'bottom';
  const posDep = cfg.positionDependence ?? 0;

  // Build: the overhang block first — from A if overhang > 0 (its head is
  // the new top card), from B if overhang < 0 (the lifted packet seated
  // below flush) — then run-length interleaving from the OTHER packet,
  // consuming the small packet completely. For remnantEnd='bottom' we
  // consume packet heads and build top-down; for remnantEnd='top' we
  // consume packet tails and build bottom-up (the lead packet's tail
  // becomes the new bottom card) — the remnant (B's unconsumed part) then
  // sits on top. Within-packet order is preserved in both directions.
  let ia = 0;
  let ib = 0;
  let k = 0; // cards written
  if (overhang > 0) {
    for (let i = 0; i < overhang && ia < s; i++, ia++, k++) {
      scratch[fromTop ? k : n - 1 - k] = fromTop ? A[ia]! : A[s - 1 - ia]!;
    }
  } else if (overhang < 0) {
    for (let i = 0; i < -overhang && ib < nB; i++, ib++, k++) {
      scratch[fromTop ? k : n - 1 - k] = fromTop ? B[ib]! : B[nB - 1 - ib]!;
    }
  }
  if (cfg.interleave === 'gsr') {
    // GSR drop rule: one card at a time, side chosen with probability
    // proportional to its remaining size. B's tail still lands as a block
    // once A empties (handled by the leftover loops below).
    while (ia < s && ib < nB) {
      const remA = s - ia;
      const remB = nB - ib;
      if (rng.nextFloat() * (remA + remB) < remA) {
        scratch[fromTop ? k : n - 1 - k] = fromTop ? A[ia]! : A[s - 1 - ia]!;
        ia++;
      } else {
        scratch[fromTop ? k : n - 1 - k] = fromTop ? B[ib]! : B[nB - 1 - ib]!;
        ib++;
      }
      k++;
    }
  }
  // interleaving starts opposite the overhang block (or with A when flush)
  let turnA = overhang <= 0;
  while (ia < s && ib < nB) {
    const t = k / n;
    const muEff = Math.max(1, cfg.mu * (1 + posDep * (2 * t - 1) * (2 * t - 1)));
    const draw = (cap: number): number =>
      cfg.runDist && cfg.runDist.length > 0
        ? runLengthEmpirical(cfg.runDist, cap, rng)
        : runLength(muEff, cap, rng);
    if (turnA) {
      const len = draw(s - ia);
      for (let i = 0; i < len; i++, ia++, k++) {
        scratch[fromTop ? k : n - 1 - k] = fromTop ? A[ia]! : A[s - 1 - ia]!;
      }
    } else {
      const len = draw(nB - ib);
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
  return { split: s, overhang };
}

/** Partially-applied form matching the ShuffleFn signature. */
export function makeMashShuffle(cfg: MashConfig) {
  return (deck: Int16Array, scratch: Int16Array, rng: PRNG): void => {
    mash(deck, scratch, rng, cfg);
  };
}
