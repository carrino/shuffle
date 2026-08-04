// Randomness metrics. Each takes a deck (values 0..n-1, index 0 = top) and
// returns a scalar; the uniform-reference mean/SD for each is documented
// beside it and exposed via uniformReference() so callers can form z-scores.
//
// NOTE: adjacency retention (how many originally-adjacent pairs remain
// adjacent) is deliberately NOT a headline metric here. A perfectly clean
// interleave separates every pair of neighbours in one pass, so an
// adjacency metric reports "random" for a faro shuffle — a highly
// structured, fully invertible arrangement. Our metrics are chosen to catch
// exactly that failure mode (rising sequences, rank correlation, linear
// functionals all flag a faro as non-random).

import { makePRNG, fisherYates, makeDeck, type PRNG } from './prng';

/**
 * Number of rising sequences: maximal chains of consecutive values
 * v, v+1, v+2, ... that appear in left-to-right position order.
 * Equals 1 + #{v : pos(v+1) < pos(v)} (descents of the inverse permutation).
 *
 * Uniform reference (n=100): mean (n+1)/2 = 50.5, variance (n+1)/12 ≈ 8.42
 * (SD ≈ 2.90). This is THE Bayer-Diaconis statistic: after one riffle of a
 * sorted deck there are at most 2 rising sequences; after k riffles at most
 * 2^k — hence the log2 floor on shuffles-to-mix.
 */
export function risingSequences(deck: Int16Array, posBuf: Int16Array): number {
  const n = deck.length;
  fillPositions(deck, posBuf);
  let count = 1;
  for (let v = 0; v + 1 < n; v++) {
    if (posBuf[v + 1]! < posBuf[v]!) count++;
  }
  return count;
}

/**
 * Mean displacement between consecutive values: mean over v of
 * |pos(v+1) - pos(v)|.
 *
 * Uniform reference: two distinct uniform positions in an n-card deck have
 * E|X - Y| = (n+1)/3, so the mean ≈ 33.67 for n=100. (The n-1 terms are
 * correlated, so the SD of the mean is estimated by Monte Carlo, not
 * analytically.) In a freshly interleaved deck consecutive values sit near
 * each other, so this starts near 1-2 and grows toward (n+1)/3.
 */
export function adjacentPairDisplacement(deck: Int16Array, posBuf: Int16Array): number {
  const n = deck.length;
  fillPositions(deck, posBuf);
  let sum = 0;
  for (let v = 0; v + 1 < n; v++) {
    sum += Math.abs(posBuf[v + 1]! - posBuf[v]!);
  }
  return sum / (n - 1);
}

/**
 * Spearman rank correlation between the current order and the starting
 * (sorted) order. Since values are 0..n-1 and start sorted, this is
 * rho = 1 - 6 * sum_v (pos(v) - v)^2 / (n(n^2-1)).
 *
 * Uniform reference: mean 0, SD = 1/sqrt(n-1) ≈ 0.1005 for n=100.
 */
export function spearmanToStart(deck: Int16Array, posBuf: Int16Array): number {
  const n = deck.length;
  fillPositions(deck, posBuf);
  let d2 = 0;
  for (let v = 0; v < n; v++) {
    const d = posBuf[v]! - v;
    d2 += d * d;
  }
  return 1 - (6 * d2) / (n * (n * n - 1));
}

/**
 * Random linear functionals: k fixed weight vectors (generated once from a
 * fixed seed) dotted with the position-of-value vector; the statistic is the
 * max |z| across the k functionals, with each z formed against a uniform
 * mean/SD estimated from 10^5 Fisher-Yates permutations (cached per n).
 *
 * Uniform reference: each functional's z is ~N(0,1), so max|z| over k=5 has
 * mean ≈ 1.57 and SD ≈ 0.55 (half-normal order statistics; validated by MC).
 * This is a "catch anything linear" net: any shuffle that leaves a linear
 * trace in card positions (e.g. cards drifting toward their old
 * neighbourhood) shows up here even if the other metrics miss it.
 */
export const LINEAR_FUNCTIONAL_COUNT = 5;
const LINEAR_FUNCTIONAL_SEED = 0x5eed1234;

export interface LinearFunctionalRef {
  n: number;
  weights: Float64Array[]; // k vectors of length n
  means: Float64Array; // per-functional uniform mean
  sds: Float64Array; // per-functional uniform SD
}

const lfCache = new Map<string, LinearFunctionalRef>();

export function linearFunctionalRef(n: number, mcSamples = 100_000): LinearFunctionalRef {
  const key = `${n}:${mcSamples}`;
  const cached = lfCache.get(key);
  if (cached) return cached;

  const wrng = makePRNG(LINEAR_FUNCTIONAL_SEED);
  const weights: Float64Array[] = [];
  for (let j = 0; j < LINEAR_FUNCTIONAL_COUNT; j++) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = wrng.nextFloat() * 2 - 1;
    weights.push(w);
  }

  // Estimate each functional's mean/SD under uniform permutations.
  const rng = makePRNG(LINEAR_FUNCTIONAL_SEED ^ 0x9e3779b9);
  const deck = makeDeck(n);
  const pos = new Int16Array(n);
  const sums = new Float64Array(LINEAR_FUNCTIONAL_COUNT);
  const sumsq = new Float64Array(LINEAR_FUNCTIONAL_COUNT);
  for (let t = 0; t < mcSamples; t++) {
    fisherYates(deck, rng);
    fillPositions(deck, pos);
    for (let j = 0; j < LINEAR_FUNCTIONAL_COUNT; j++) {
      const w = weights[j]!;
      let s = 0;
      for (let v = 0; v < n; v++) s += w[v]! * pos[v]!;
      sums[j] = sums[j]! + s;
      sumsq[j] = sumsq[j]! + s * s;
    }
  }
  const means = new Float64Array(LINEAR_FUNCTIONAL_COUNT);
  const sds = new Float64Array(LINEAR_FUNCTIONAL_COUNT);
  for (let j = 0; j < LINEAR_FUNCTIONAL_COUNT; j++) {
    const mean = sums[j]! / mcSamples;
    means[j] = mean;
    sds[j] = Math.sqrt(Math.max(0, sumsq[j]! / mcSamples - mean * mean));
  }
  const ref: LinearFunctionalRef = { n, weights, means, sds };
  lfCache.set(key, ref);
  return ref;
}

export function randomLinearFunctionals(
  deck: Int16Array,
  posBuf: Int16Array,
  ref: LinearFunctionalRef,
): number {
  fillPositions(deck, posBuf);
  let maxAbsZ = 0;
  for (let j = 0; j < LINEAR_FUNCTIONAL_COUNT; j++) {
    const w = ref.weights[j]!;
    let s = 0;
    for (let v = 0; v < deck.length; v++) s += w[v]! * posBuf[v]!;
    const z = Math.abs((s - ref.means[j]!) / ref.sds[j]!);
    if (z > maxAbsZ) maxAbsZ = z;
  }
  return maxAbsZ;
}

/**
 * Indicator: is the original top card back on top? Trajectory means estimate
 * P(pos(0) = 0). Uniform reference: mean 1/n, SD sqrt((1/n)(1 - 1/n)).
 *
 * NOT part of the certification battery: the mash mechanic lifts the bottom
 * packet to the top every shuffle, so the top card always changes
 * mechanically — the statistic only measures sleight of hand there. It IS
 * still a strong GSR-only diagnostic: for GSR the known excess is ~ lambda/2
 * in relative terms with lambda = n/2^m, i.e. P ≈ (1 + lambda/2)/n — see
 * topCardHomeGSRTheory and the /validate overlay, where this bias visibly
 * outlives rising-sequence saturation.
 */
export function topCardHome(deck: Int16Array): number {
  return deck[0] === 0 ? 1 : 0;
}

/** GSR asymptotic P(top card at home) after m riffles (valid for small lambda). */
export function topCardHomeGSRTheory(n: number, m: number): number {
  const lambda = n / 2 ** m;
  return Math.min(1, (1 + lambda / 2) / n);
}

/**
 * Expected correct guesses by an adversary who guesses each card before it
 * is revealed, top to bottom, with full memory — the "exploitable during
 * play" metric, expected to certify last.
 *
 * Uniform reference (EXACT, strategy-independent): with full memory and any
 * strategy that guesses an unrevealed card, P(correct | k cards unrevealed)
 * = 1/k whatever the history, so the per-step indicators are independent
 * Bernoulli(1/k): mean H_n = sum 1/k (≈ 5.187 for n=100) and variance
 * sum (1/k)(1 - 1/k). The MC uniform-reference validation re-verifies both.
 *
 * The implemented guesser tracks rising-sequence threads: revealed cards
 * chain into threads (x extends x-1); guess (1) the successor of the most
 * recently extended thread — this rides clumpy runs, (2) else the successor
 * of the longest revealed thread, (3) else the smallest unrevealed value.
 * A heuristic lower bound on the optimal adversary, deterministic given the
 * deck.
 */
export interface GuesserScratch {
  revealed: Uint8Array;
  chainLen: Int16Array;
  tails: Int16Array; // open tails (revealed value whose successor is unrevealed)
  tailPos: Int16Array; // value -> index in tails, -1 if absent
}

export function makeGuesserScratch(n: number): GuesserScratch {
  return {
    revealed: new Uint8Array(n),
    chainLen: new Int16Array(n),
    tails: new Int16Array(n),
    tailPos: new Int16Array(n),
  };
}

export function sequentialGuesser(deck: Int16Array, s: GuesserScratch): number {
  const n = deck.length;
  s.revealed.fill(0);
  s.tailPos.fill(-1);
  let tailCount = 0;
  let minUnrevealed = 0;
  let lastRevealed = -1;
  let correct = 0;

  const removeTail = (v: number): void => {
    const i = s.tailPos[v]!;
    if (i < 0) return;
    const last = s.tails[tailCount - 1]!;
    s.tails[i] = last;
    s.tailPos[last] = i;
    s.tailPos[v] = -1;
    tailCount--;
  };

  for (let i = 0; i < n; i++) {
    // ---- guess ----
    let guess: number;
    if (lastRevealed >= 0 && lastRevealed + 1 < n && s.revealed[lastRevealed + 1] === 0) {
      guess = lastRevealed + 1; // ride the current run
    } else {
      let best = -1;
      let bestLen = 0;
      for (let t = 0; t < tailCount; t++) {
        const v = s.tails[t]!;
        if (s.chainLen[v]! > bestLen) {
          bestLen = s.chainLen[v]!;
          best = v;
        }
      }
      guess = best >= 0 ? best + 1 : minUnrevealed;
    }

    // ---- reveal ----
    const x = deck[i]!;
    if (x === guess) correct++;
    s.revealed[x] = 1;
    s.chainLen[x] = x > 0 && s.revealed[x - 1] === 1 ? s.chainLen[x - 1]! + 1 : 1;
    // x may fill a gap: propagate the merged chain length rightward so the
    // merged chain's tail is ranked by its true length
    for (let j = x + 1; j < n && s.revealed[j] === 1; j++) {
      s.chainLen[j] = s.chainLen[j - 1]! + 1;
    }
    if (x > 0 && s.tailPos[x - 1]! >= 0) removeTail(x - 1); // successor now revealed
    if (x + 1 < n && s.revealed[x + 1] === 0) {
      s.tails[tailCount] = x;
      s.tailPos[x] = tailCount;
      tailCount++;
    }
    while (minUnrevealed < n && s.revealed[minUnrevealed] === 1) minUnrevealed++;
    lastRevealed = x;
  }
  return correct;
}

/** posBuf[value] = index of value in deck. */
export function fillPositions(deck: Int16Array, posBuf: Int16Array): void {
  for (let i = 0; i < deck.length; i++) posBuf[deck[i]!] = i;
}

// ---------------------------------------------------------------------------
// Metric registry: uniform references (documented above, centralized here so
// experiment code can form z-scores).

export type MetricName =
  | 'risingSequences'
  | 'adjacentPairDisplacement'
  | 'spearmanToStart'
  | 'maxLinearFunctionalZ'
  | 'sequentialGuesser';

export const METRIC_NAMES: readonly MetricName[] = [
  'risingSequences',
  'adjacentPairDisplacement',
  'spearmanToStart',
  'maxLinearFunctionalZ',
  'sequentialGuesser',
];

export interface UniformRef {
  mean: number;
  sd: number;
  /** true if mean/SD are exact theory; false if Monte Carlo estimates. */
  exact: boolean;
}

// max|z| of k iid |N(0,1)|: E ≈ 1.570, SD ≈ 0.556 for k=5 (order-statistic
// integration; cross-checked by the Monte Carlo uniform-reference test).
const MAX_ABS_Z_5_MEAN = 1.5698;
const MAX_ABS_Z_5_SD = 0.5562;

export function uniformReference(n: number, metric: MetricName): UniformRef {
  switch (metric) {
    case 'risingSequences':
      return { mean: (n + 1) / 2, sd: Math.sqrt((n + 1) / 12), exact: true };
    case 'adjacentPairDisplacement':
      // Mean is exact; SD of the mean over correlated terms is MC-calibrated
      // for n=100/52 (see uniform-reference validation, which measures it).
      return { mean: (n + 1) / 3, sd: adjSdApprox(n), exact: false };
    case 'spearmanToStart':
      return { mean: 0, sd: 1 / Math.sqrt(n - 1), exact: true };
    case 'maxLinearFunctionalZ':
      return { mean: MAX_ABS_Z_5_MEAN, sd: MAX_ABS_Z_5_SD, exact: false };
    case 'sequentialGuesser': {
      // exact: independent Bernoulli(1/k) steps under uniform (see docstring)
      let mean = 0;
      let variance = 0;
      for (let k = 1; k <= n; k++) {
        mean += 1 / k;
        variance += (1 / k) * (1 - 1 / k);
      }
      return { mean, sd: Math.sqrt(variance), exact: true };
    }
  }
}

// MC-calibrated SD of adjacentPairDisplacement under uniform (tools-side
// calibration): n=52 -> 1.508, n=60 -> 1.615, n=100 -> 2.109. Roughly ~ n/48.
function adjSdApprox(n: number): number {
  if (n === 52) return 1.508;
  if (n === 60) return 1.615;
  if (n === 100) return 2.109;
  return n / 48; // rough fallback; MC tests pin the sizes we actually use
}

export interface MetricComputer {
  compute(deck: Int16Array): Record<MetricName, number>;
}

/** Preallocates buffers + uniform LF reference for a deck size. */
export function makeMetricComputer(n: number, lfSamples = 100_000): MetricComputer {
  const posBuf = new Int16Array(n);
  const ref = linearFunctionalRef(n, lfSamples);
  const guesserScratch = makeGuesserScratch(n);
  return {
    compute(deck: Int16Array) {
      return {
        risingSequences: risingSequences(deck, posBuf),
        adjacentPairDisplacement: adjacentPairDisplacement(deck, posBuf),
        spearmanToStart: spearmanToStart(deck, posBuf),
        maxLinearFunctionalZ: randomLinearFunctionals(deck, posBuf, ref),
        sequentialGuesser: sequentialGuesser(deck, guesserScratch),
      };
    },
  };
}
