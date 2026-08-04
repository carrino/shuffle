// Trajectory experiments: run T independent shuffle trajectories from a
// sorted deck, record per-shuffle metric means/SDs, and certify mixedness by
// EQUIVALENCE TESTING (TOST-style) — never fail-to-reject.
//
// The mixedness definition (documented on /validate and in the README):
//
// (1) THEORY LAYER (pure GSR only): M(eps) = first m with exact
//     Bayer-Diaconis TV(m) <= eps, from src/sim/anchors.ts (M_KNEE, M_FAIR,
//     M_STRICT).
// (2) EMPIRICAL LAYER (any operator): certifiedMixed(c, alpha) — the first
//     shuffle k such that for EVERY certification metric the (1 - alpha)
//     confidence interval of the trajectory mean lies entirely inside
//     [ref - c*SD_uniform, ref + c*SD_uniform] and remains inside for all
//     later simulated k. Defaults c = 0.25, alpha = 0.05. Fail-to-reject
//     certifies sooner with LESS data, which is backwards; equivalence bands
//     make more data certify more honestly (as T grows the criterion
//     converges to |bias| < c*SD, it never weakens). If the CI half-width
//     cannot beat c*SD at this T, the outcome is "cannot-certify" —
//     explicitly distinct from "not mixed".
// (3) CALIBRATION INVARIANT (CI-gated, see validate.ts): certifiedMixed on
//     pure GSR must land within ±1 shuffle of M_FAIR for n=52 and n=100.
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
  /** certification options (defaults c=0.25, alpha=0.05) */
  cert?: Partial<CertOptions>;
}

export interface MetricCurve {
  /** mean of the metric over T trajectories, index k-1 = after k shuffles */
  mean: Float64Array;
  /** SD of the metric over T trajectories */
  sd: Float64Array;
  /** bias in units of a single permutation's SD: (mean - refMean) / refSD */
  effect: Float64Array;
}

export interface CertOptions {
  /** equivalence band half-width in units of the uniform single-deck SD */
  c: number;
  /** CI level for the trajectory mean is 1 - alpha */
  alpha: number;
}

export const DEFAULT_CERT: CertOptions = { c: 0.25, alpha: 0.05 };

export type CertStatus =
  | { status: 'certified'; k: number }
  | { status: 'not-certified' }
  | { status: 'cannot-certify' };

export interface CertificationResult {
  perMetric: Record<MetricName, CertStatus>;
  /** certified only if every metric certifies; k = worst metric's k */
  overall: CertStatus;
  /** the binding (worst) metric — always named, never a bare scalar */
  bindingMetric: MetricName | null;
  options: CertOptions & { T: number };
}

export interface CurveResult {
  n: number;
  K: number;
  T: number;
  curves: Record<MetricName, MetricCurve>;
  cert: CertificationResult;
  /** convenience: overall certified k, Infinity otherwise (inspect cert!) */
  shufflesToMix: number;
}

/**
 * TOST-style certification of a trajectory result. See module docstring.
 */
export function certifiedMixed(
  result: Pick<CurveResult, 'n' | 'K' | 'T' | 'curves'>,
  opts?: Partial<CertOptions>,
): CertificationResult {
  const { c, alpha } = { ...DEFAULT_CERT, ...opts };
  const z = invNorm(1 - alpha / 2);
  const perMetric = {} as Record<MetricName, CertStatus>;

  for (const m of METRIC_NAMES) {
    const ref = uniformReference(result.n, m);
    const curve = result.curves[m];
    const band = c * ref.sd;

    let widthEverFits = false;
    let lastViolation = -1; // 0-based index of the last k whose CI is not inside
    for (let i = 0; i < result.K; i++) {
      const half = (z * curve.sd[i]!) / Math.sqrt(result.T);
      if (half < band) widthEverFits = true;
      const inside = Math.abs(curve.mean[i]! - ref.mean) + half <= band;
      if (!inside) lastViolation = i;
    }

    if (!widthEverFits) {
      perMetric[m] = { status: 'cannot-certify' };
    } else if (lastViolation === result.K - 1) {
      // still (or again) outside at the horizon — not mixed within K
      perMetric[m] = { status: 'not-certified' };
    } else {
      perMetric[m] = { status: 'certified', k: lastViolation + 2 };
    }
  }

  let overall: CertStatus = { status: 'certified', k: 0 };
  let bindingMetric: MetricName | null = null;
  for (const m of METRIC_NAMES) {
    const s = perMetric[m];
    if (s.status === 'cannot-certify') {
      overall = { status: 'cannot-certify' };
      bindingMetric = m;
      break;
    }
    if (s.status === 'not-certified') {
      overall = { status: 'not-certified' };
      bindingMetric = m;
      break;
    }
    if (overall.status === 'certified' && s.k >= overall.k) {
      overall = s;
      bindingMetric = m;
    }
  }

  return { perMetric, overall, bindingMetric, options: { c, alpha, T: result.T } };
}

export function certK(s: CertStatus): number {
  return s.status === 'certified' ? s.k : Infinity;
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
  for (const m of METRIC_NAMES) {
    const ref = uniformReference(n, m);
    const mean = new Float64Array(K);
    const sd = new Float64Array(K);
    const effect = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      const mu = sum[m]![k]! / T;
      mean[k] = mu;
      sd[k] = Math.sqrt(Math.max(0, sumsq[m]![k]! / T - mu * mu));
      effect[k] = (mu - ref.mean) / ref.sd;
    }
    curves[m] = { mean, sd, effect };
  }

  const cert = certifiedMixed({ n, K, T, curves }, opts.cert);
  return { n, K, T, curves, cert, shufflesToMix: certK(cert.overall) };
}

/**
 * Inverse standard normal CDF (Acklam's rational approximation, |err| < 1e-9
 * over the alphas we use). Needed for the (1 - alpha) CI quantile.
 */
export function invNorm(p: number): number {
  if (p <= 0 || p >= 1) throw new Error(`invNorm: p=${p} out of (0,1)`);
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const cc = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pLow = 0.02425;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((cc[0]! * q + cc[1]!) * q + cc[2]!) * q + cc[3]!) * q + cc[4]!) * q + cc[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p <= 1 - pLow) {
    q = p - 0.5;
    r = q * q;
    return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((cc[0]! * q + cc[1]!) * q + cc[2]!) * q + cc[3]!) * q + cc[4]!) * q + cc[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
}
