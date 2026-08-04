// Trajectory experiments: run T independent shuffle trajectories from a
// sorted deck, record per-shuffle metric means, z-distances from uniform,
// and "shuffles to mix" per metric.
//
// Framework-free; used by tests, the validation suite, the explore page and
// the sweep worker.

import { makePRNG, makeDeck, resetSorted, type PRNG } from './prng';
import {
  makeMetricComputer,
  uniformReference,
  METRIC_NAMES,
  type MetricName,
} from './metrics';

export type ShuffleFn = (deck: Int16Array, scratch: Int16Array, rng: PRNG) => void;

export interface CurveOptions {
  n: number;
  /** shuffles per trajectory */
  K: number;
  /** number of trajectories */
  T: number;
  seed: number;
  /** MC samples for the linear-functional uniform reference */
  lfSamples?: number;
}

export interface MetricCurve {
  /** mean of the metric over T trajectories, index k-1 = after k shuffles */
  mean: Float64Array;
  /** SD of the metric over T trajectories */
  sd: Float64Array;
  /**
   * z-distance of the trajectory mean from the uniform reference:
   * (mean - refMean) / (refSD / sqrt(T)). This scales with sqrt(T): more
   * trajectories detect smaller residual bias, so "mixed at" is a
   * statistical statement at the chosen T.
   */
  zOfMean: Float64Array;
  /** bias in units of a single permutation's SD: (mean - refMean) / refSD */
  effect: Float64Array;
}

export interface CurveResult {
  n: number;
  K: number;
  T: number;
  curves: Record<MetricName, MetricCurve>;
  /** per-metric shuffles-to-mix (Infinity if never mixed within K) */
  mixedAt: Record<MetricName, number>;
  /** worst (max) over metrics — NEVER report this without the per-metric ks */
  shufflesToMix: number;
}

/**
 * "Mixed at k" for one metric: the smallest k whose z-of-mean satisfies
 * |z| < ENTER_BAND and every later k stays within STAY_BAND (the looser stay
 * band absorbs MC noise once genuinely mixed). A shuffle that cycles (faro)
 * keeps leaving the band, so it never mixes under this definition.
 */
export const ENTER_BAND = 2;
export const STAY_BAND = 3;

export function mixedAtFromZ(z: Float64Array): number {
  let candidate = Infinity;
  for (let i = 0; i < z.length; i++) {
    const abs = Math.abs(z[i]!);
    if (candidate === Infinity) {
      if (abs < ENTER_BAND) candidate = i + 1;
    } else if (abs >= STAY_BAND) {
      candidate = Infinity; // left the band: not actually mixed yet
    }
  }
  return candidate;
}

export function metricCurves(shuffle: ShuffleFn, opts: CurveOptions): CurveResult {
  const { n, K, T, seed } = opts;
  const computer = makeMetricComputer(n, opts.lfSamples ?? 100_000);
  const deck = makeDeck(n);
  const scratch = new Int16Array(n);
  const rng = makePRNG(seed);

  const sum: Record<string, Float64Array> = {};
  const sumsq: Record<string, Float64Array> = {};
  for (const m of METRIC_NAMES) {
    sum[m] = new Float64Array(K);
    sumsq[m] = new Float64Array(K);
  }

  for (let t = 0; t < T; t++) {
    resetSorted(deck);
    for (let k = 0; k < K; k++) {
      shuffle(deck, scratch, rng);
      const vals = computer.compute(deck);
      for (const m of METRIC_NAMES) {
        const v = vals[m];
        sum[m]![k] = sum[m]![k]! + v;
        sumsq[m]![k] = sumsq[m]![k]! + v * v;
      }
    }
  }

  const curves = {} as Record<MetricName, MetricCurve>;
  const mixedAt = {} as Record<MetricName, number>;
  for (const m of METRIC_NAMES) {
    const ref = uniformReference(n, m);
    const mean = new Float64Array(K);
    const sd = new Float64Array(K);
    const zOfMean = new Float64Array(K);
    const effect = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      const mu = sum[m]![k]! / T;
      mean[k] = mu;
      sd[k] = Math.sqrt(Math.max(0, sumsq[m]![k]! / T - mu * mu));
      effect[k] = (mu - ref.mean) / ref.sd;
      zOfMean[k] = (effect[k]! * Math.sqrt(T));
    }
    curves[m] = { mean, sd, zOfMean, effect };
    mixedAt[m] = mixedAtFromZ(zOfMean);
  }

  let worst = 0;
  for (const m of METRIC_NAMES) worst = Math.max(worst, mixedAt[m]);
  return { n, K, T, curves, mixedAt, shufflesToMix: worst };
}
