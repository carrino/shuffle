// PHASE 1 validation suite — the gate everything else depends on.
//
// Runs headless under vitest (CI fails if any check fails) and in the
// browser on the /validate page (same code, same numbers).
//
// Mixedness here follows the two-layer definition in experiment.ts:
// the THEORY layer M(eps) from the exact anchors (M_KNEE / M_FAIR /
// M_STRICT), and the EMPIRICAL layer certifiedMixed(c, alpha) — TOST-style
// equivalence certification, never fail-to-reject. Check (f) is the
// calibration invariant binding the two layers together: certifiedMixed on
// pure GSR must land within ±1 shuffle of M_FAIR, else the metric battery
// is blind (too early) or c/T is miscalibrated (too late).

import { makePRNG, makeDeck, fisherYates } from './prng';
import { gsr, faro } from './operators';
import {
  makeMetricComputer,
  risingSequences,
  uniformReference,
  topCardHomeGSRTheory,
  METRIC_NAMES,
  type MetricName,
} from './metrics';
import {
  metricCurves,
  certK,
  invNorm,
  DEFAULT_CERT,
  type CurveResult,
  type CertStatus,
} from './experiment';
import { EXACT_TV_52, EXACT_TV_100, exactTV, theoryMilestones } from './anchors';

export interface ValidationOptions {
  /** samples for the uniform-reference check */
  uniformSamples: number;
  /** trajectories for convergence curves */
  trajectories: number;
  /** MC samples for the linear-functional reference */
  lfSamples: number;
  seed: number;
}

export const FAST_OPTIONS: ValidationOptions = {
  uniformSamples: 50_000,
  trajectories: 2000,
  lfSamples: 50_000,
  seed: 0xc0ffee,
};

export const FULL_OPTIONS: ValidationOptions = {
  uniformSamples: 200_000,
  trajectories: 5000,
  lfSamples: 100_000,
  seed: 0xc0ffee,
};

export interface CheckResult {
  id: string;
  name: string;
  pass: boolean;
  details: string[];
}

export interface ValidationReport {
  pass: boolean;
  options: ValidationOptions;
  checks: CheckResult[];
  /** curves (with certification) for the /validate page charts */
  gsr52: CurveResult;
  gsr100: CurveResult;
  faro52: CurveResult;
  faro100: CurveResult;
  anchors: { tv52: readonly number[]; tv100: readonly number[] };
  milestones: {
    n52: { knee: number; fair: number; strict: number };
    n100: { knee: number; fair: number; strict: number };
  };
  /** ceil(log2((n+1)/2)) — no riffle-family shuffle can be random before this */
  log2Floor: { n52: number; n100: number };
  /**
   * GSR-only top-card diagnostic (NOT a certification metric — the mash
   * mechanic cycles the bottom to the top, so the top card always changes):
   * measured P(top card at home) vs the (1+λ/2)/n law, for the overlay.
   */
  topCard: {
    n52: { measured: number[]; theory: number[] };
    n100: { measured: number[]; theory: number[] };
  };
  generatedAt?: string;
}

/**
 * Empirical ratio between rising-sequence mean bias (in single-permutation
 * SDs) and the exact TV distance, in the asymptotic regime. Measured ≈ 2.7
 * and stable over m for both n=52 and n=100; check (d) re-verifies stability
 * on every run before using it to predict the certification boundary.
 */
export const RISING_BIAS_TV_RATIO = 2.7;

/**
 * Anchor-predicted certification shuffle for the rising-sequence metric:
 * first m with RATIO*TV(m) + z/sqrt(T) <= c (bias plus CI half-width, both
 * in single-deck SD units, inside the equivalence band).
 */
export function predictedRisingCertifiedAt(n: 52 | 100, T: number): number {
  const z = invNorm(1 - DEFAULT_CERT.alpha / 2);
  for (let m = 1; m <= 40; m++) {
    if (RISING_BIAS_TV_RATIO * exactTV(n, m) + z / Math.sqrt(T) <= DEFAULT_CERT.c) return m;
  }
  return Infinity;
}

export function log2Floor(n: number): number {
  return Math.ceil(Math.log2((n + 1) / 2));
}

export function runValidation(
  opts: ValidationOptions = FAST_OPTIONS,
  progress?: (msg: string, frac: number) => void,
): ValidationReport {
  const checks: CheckResult[] = [];
  const report = (msg: string, frac: number) => progress?.(msg, frac);

  // ---- (a) Uniform references --------------------------------------------
  report('Uniform reference check (n=100)…', 0.05);
  checks.push(checkUniformReferences(100, opts));

  // ---- (b) Single-riffle invariant ---------------------------------------
  report('Single-riffle invariant…', 0.3);
  checks.push(checkRiffleInvariant(opts));

  // ---- curves (used by c, d, e, f) ---------------------------------------
  report('GSR trajectories n=52…', 0.4);
  const gsr52 = metricCurves(gsr, {
    n: 52, K: 18, T: opts.trajectories, seed: opts.seed + 1, lfSamples: opts.lfSamples,
  });
  report('GSR trajectories n=100…', 0.6);
  const gsr100 = metricCurves(gsr, {
    n: 100, K: 22, T: opts.trajectories, seed: opts.seed + 2, lfSamples: opts.lfSamples,
  });
  report('Faro control…', 0.85);
  const faroFn = (deck: Int16Array, scratch: Int16Array) => faro(deck, scratch, false);
  // Faro is deterministic — 2 identical trajectories give exact means with
  // zero CI width, so certification judges pure bias.
  const faro52 = metricCurves(faroFn, {
    n: 52, K: 24, T: 2, seed: opts.seed + 3, lfSamples: opts.lfSamples,
  });
  const faro100 = metricCurves(faroFn, {
    n: 100, K: 60, T: 2, seed: opts.seed + 4, lfSamples: opts.lfSamples,
  });

  // ---- (c) Faro control ---------------------------------------------------
  checks.push(checkFaroControl(faro52, faro100));

  // ---- (d) GSR convergence vs anchors ------------------------------------
  report('Checking convergence against anchors…', 0.94);
  const topCard52 = gsrTopCardCurve(52, gsr52.K, opts.trajectories, opts.seed + 7);
  const topCard100 = gsrTopCardCurve(100, gsr100.K, opts.trajectories, opts.seed + 8);
  checks.push(checkGsrConvergence(52, gsr52, opts.trajectories, topCard52));
  checks.push(checkGsrConvergence(100, gsr100, opts.trajectories, topCard100));

  // ---- (e) rising-sequence floor ------------------------------------------
  checks.push(checkLog2Floor(gsr52, gsr100));

  // ---- (f) calibration invariant ------------------------------------------
  checks.push(checkCalibration(gsr52, gsr100));

  report('Done', 1);
  return {
    pass: checks.every((c) => c.pass),
    options: opts,
    checks,
    gsr52,
    gsr100,
    faro52,
    faro100,
    anchors: { tv52: EXACT_TV_52, tv100: EXACT_TV_100 },
    milestones: { n52: theoryMilestones(52), n100: theoryMilestones(100) },
    log2Floor: { n52: log2Floor(52), n100: log2Floor(100) },
    topCard: {
      n52: {
        measured: Array.from(topCard52),
        theory: Array.from({ length: gsr52.K }, (_, i) => topCardHomeGSRTheory(52, i + 1)),
      },
      n100: {
        measured: Array.from(topCard100),
        theory: Array.from({ length: gsr100.K }, (_, i) => topCardHomeGSRTheory(100, i + 1)),
      },
    },
  };
}

/** GSR-only P(top card at home) curve — the late-stage diagnostic. */
export function gsrTopCardCurve(n: number, K: number, T: number, seed: number): Float64Array {
  const deck = makeDeck(n);
  const scratch = new Int16Array(n);
  const rng = makePRNG(seed);
  const hits = new Float64Array(K);
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < n; i++) deck[i] = i;
    for (let k = 0; k < K; k++) {
      gsr(deck, scratch, rng);
      if (deck[0] === 0) hits[k] = hits[k]! + 1;
    }
  }
  for (let k = 0; k < K; k++) hits[k] = hits[k]! / T;
  return hits;
}

// ---------------------------------------------------------------------------

function checkUniformReferences(n: number, opts: ValidationOptions): CheckResult {
  const N = opts.uniformSamples;
  const computer = makeMetricComputer(n, opts.lfSamples);
  const deck = makeDeck(n);
  const rng = makePRNG(opts.seed);
  const sum = new Map<MetricName, number>();
  const sumsq = new Map<MetricName, number>();
  for (const m of METRIC_NAMES) {
    sum.set(m, 0);
    sumsq.set(m, 0);
  }
  for (let t = 0; t < N; t++) {
    fisherYates(deck, rng);
    const vals = computer.compute(deck);
    for (const m of METRIC_NAMES) {
      sum.set(m, sum.get(m)! + vals[m]);
      sumsq.set(m, sumsq.get(m)! + vals[m] * vals[m]);
    }
  }
  const details: string[] = [];
  let pass = true;
  for (const m of METRIC_NAMES) {
    const ref = uniformReference(n, m);
    const mean = sum.get(m)! / N;
    const sd = Math.sqrt(Math.max(0, sumsq.get(m)! / N - mean * mean));
    const se = ref.sd / Math.sqrt(N);
    const zMean = (mean - ref.mean) / se;
    // Exact references: mean within 4 MC standard errors, SD within 3%.
    // MC-calibrated references: mean within 5 SE, SD within 5%.
    const zTol = ref.exact ? 4 : 5;
    const sdTol = ref.exact ? 0.03 : 0.05;
    const meanOk = Math.abs(zMean) < zTol;
    const sdOk = Math.abs(sd / ref.sd - 1) < sdTol;
    pass &&= meanOk && sdOk;
    details.push(
      `${m}: mean ${mean.toFixed(4)} vs ref ${ref.mean.toFixed(4)} ` +
        `(z=${zMean.toFixed(2)}, tol ±${zTol}) ${meanOk ? 'OK' : 'FAIL'}; ` +
        `sd ${sd.toFixed(4)} vs ref ${ref.sd.toFixed(4)} ` +
        `(${((sd / ref.sd - 1) * 100).toFixed(1)}%, tol ±${sdTol * 100}%) ${sdOk ? 'OK' : 'FAIL'}`,
    );
  }
  return {
    id: 'a-uniform-refs',
    name: `Uniform references (n=${n}, ${N.toLocaleString()} random permutations)`,
    pass,
    details,
  };
}

function checkRiffleInvariant(opts: ValidationOptions): CheckResult {
  // Hard theorem: k GSR riffles from sorted produce at most 2^k rising
  // sequences. Any violation is a bug in gsr() or risingSequences().
  const details: string[] = [];
  let pass = true;
  for (const n of [52, 100]) {
    const deck = makeDeck(n);
    const scratch = new Int16Array(n);
    const pos = new Int16Array(n);
    const rng = makePRNG(opts.seed + 99);
    let worstExcess = 0;
    const trials = 400;
    for (let trial = 0; trial < trials; trial++) {
      for (let i = 0; i < n; i++) deck[i] = i;
      for (let k = 1; k <= 8; k++) {
        gsr(deck, scratch, rng);
        const rs = risingSequences(deck, pos);
        const bound = Math.min(2 ** k, n);
        if (rs > bound) {
          pass = false;
          worstExcess = Math.max(worstExcess, rs - bound);
        }
      }
    }
    details.push(
      `n=${n}: ${trials} trajectories × 8 riffles, rising sequences ≤ 2^k everywhere` +
        (worstExcess > 0 ? ` VIOLATED (worst excess ${worstExcess})` : ' — OK'),
    );
  }
  return { id: 'b-riffle-invariant', name: 'Single-riffle invariant (rising sequences ≤ 2^k)', pass, details };
}

function checkFaroControl(faro52: CurveResult, faro100: CurveResult): CheckResult {
  const details: string[] = [];
  let pass = true;

  // Out-faro on 52 returns to the starting order in exactly 8 shuffles.
  {
    const deck = makeDeck(52);
    const scratch = new Int16Array(52);
    let period = -1;
    for (let k = 1; k <= 16; k++) {
      faro(deck, scratch, false);
      if (deck.every((v, i) => v === i)) {
        period = k;
        break;
      }
    }
    const ok = period === 8;
    pass &&= ok;
    details.push(`out-faro period on 52 cards: ${period} (expected exactly 8) ${ok ? 'OK' : 'FAIL'}`);
  }

  // Repeated faro never certifies: the trajectory is periodic (rising
  // sequences cycle 2,4,8,16,32,13,26,1 for n=52, re-entering full order),
  // so no metric's mean can stay inside the equivalence band.
  for (const [n, result] of [[52, faro52], [100, faro100]] as const) {
    const deck = makeDeck(n);
    const scratch = new Int16Array(n);
    const pos = new Int16Array(n);
    let minRs = Infinity;
    let maxRs = 0;
    for (let k = 0; k < 64; k++) {
      faro(deck, scratch, false);
      const rs = risingSequences(deck, pos);
      minRs = Math.min(minRs, rs);
      maxRs = Math.max(maxRs, rs);
    }
    const overall = result.cert.overall.status;
    const ok = overall !== 'certified' && minRs === 1;
    pass &&= ok;
    details.push(
      `n=${n}: rising sequences over 64 faros stay in [${minRs}, ${maxRs}] re-entering full ` +
        `order (min=1); certification outcome: ${overall} (must not certify) ${ok ? 'OK' : 'FAIL'}`,
    );
  }
  return { id: 'c-faro-control', name: 'Faro control (perfect interleave never certifies)', pass, details };
}

const GENERIC_METRICS: readonly MetricName[] = [
  'adjacentPairDisplacement',
  'spearmanToStart',
  'maxLinearFunctionalZ',
  'sequentialGuesser',
];

function fmtCert(s: CertStatus): string {
  return s.status === 'certified' ? `certified at ${s.k}` : s.status;
}

function checkGsrConvergence(
  n: 52 | 100,
  result: CurveResult,
  T: number,
  topCardMeasured: Float64Array,
): CheckResult {
  const details: string[] = [];
  let pass = true;

  // Non-rising metrics certify in a sane window (they saturate before the
  // rising-sequence statistic — see check e for why that's expected).
  const genericMax = n === 52 ? 9 : 10;
  for (const m of GENERIC_METRICS) {
    const s = result.cert.perMetric[m];
    const ok = s.status === 'certified' && s.k >= 2 && s.k <= genericMax;
    pass &&= ok;
    details.push(`${m}: ${fmtCert(s)} (expected certified in 2..${genericMax}) ${ok ? 'OK' : 'FAIL'}`);
  }

  // Rising sequences — the Bayer-Diaconis statistic — certifies exactly
  // where the exact anchors predict: mean bias ≈ RISING_BIAS_TV_RATIO×TV(m).
  // Two checks: the bias/TV ratio is stable in the well-measured asymptotic
  // regime, and the observed certification is within ±2 of the prediction.
  const rs = result.curves.risingSequences;
  const ratios: number[] = [];
  for (let m = 1; m <= result.K; m++) {
    const tv = exactTV(n, m);
    if (tv < 0.8 && tv * RISING_BIAS_TV_RATIO * Math.sqrt(T) > 6) {
      ratios.push(Math.abs(rs.effect[m - 1]!) / tv);
    }
  }
  const ratioOk = ratios.length >= 3 && ratios.every((r) => r > 1.8 && r < 3.8);
  pass &&= ratioOk;
  details.push(
    `rising-sequence bias / exact TV ratio over asymptotic regime: ` +
      `[${ratios.map((r) => r.toFixed(2)).join(', ')}] (expected all in 1.8..3.8) ${ratioOk ? 'OK' : 'FAIL'}`,
  );

  const predicted = predictedRisingCertifiedAt(n, T);
  const observed = certK(result.cert.perMetric.risingSequences);
  const mixOk = Number.isFinite(observed) && Math.abs(observed - predicted) <= 2;
  pass &&= mixOk;
  details.push(
    `risingSequences: ${fmtCert(result.cert.perMetric.risingSequences)}, anchor-predicted ` +
      `${predicted} at T=${T} (tolerance ±2) ${mixOk ? 'OK' : 'FAIL'}`,
  );

  // GSR-only diagnostic (not a certification metric): P(top card at home)
  // tracks the excess law P ≈ (1 + λ/2)/n with λ = n/2^m — pooled deviation
  // from theory over the λ ≤ 1.5 regime within MC error.
  {
    const sdTop = Math.sqrt((1 / n) * (1 - 1 / n));
    const ms: number[] = [];
    let dev = 0;
    for (let m = 1; m <= result.K; m++) {
      const lambda = n / 2 ** m;
      if (lambda <= 1.5) {
        ms.push(m);
        dev += topCardMeasured[m - 1]! - topCardHomeGSRTheory(n, m);
      }
    }
    const pooledSe = sdTop / Math.sqrt(T) / Math.sqrt(ms.length);
    const avgDev = dev / ms.length;
    const ok = Math.abs(avgDev) < 4 * pooledSe;
    pass &&= ok;
    details.push(
      `topCardHome (GSR diagnostic) vs (1+λ/2)/n over m=${ms[0]}..${ms[ms.length - 1]}: pooled ` +
        `deviation ${avgDev.toExponential(2)} (tol ±${(4 * pooledSe).toExponential(2)}) ${ok ? 'OK' : 'FAIL'}`,
    );
  }

  return {
    id: `d-gsr-convergence-${n}`,
    name: `GSR convergence vs exact anchors (n=${n}, T=${T})`,
    pass,
    details,
  };
}

function checkLog2Floor(gsr52: CurveResult, gsr100: CurveResult): CheckResult {
  const details: string[] = [];
  let pass = true;
  for (const [n, result] of [[52, gsr52], [100, gsr100]] as const) {
    const floor = log2Floor(n);
    // With fewer than ceil(log2((n+1)/2)) riffles the deck cannot even reach
    // the MEAN rising-sequence count of a uniform permutation (≤ 2^k of
    // them), so the rising-sequence metric provably cannot certify below the
    // floor. Weaker metrics CAN saturate earlier — that is exactly why the
    // floor matters and why the binding metric is always named.
    const k = certK(result.cert.perMetric.risingSequences);
    const ok = k >= floor;
    pass &&= ok;
    const early = METRIC_NAMES.filter((m) => certK(result.cert.perMetric[m]) < floor);
    details.push(
      `n=${n}: floor ceil(log2((n+1)/2)) = ${floor}; risingSequences certified at ` +
        `${k} (must be ≥ floor) ${ok ? 'OK' : 'FAIL'}` +
        (early.length > 0
          ? `; note: [${early.join(', ')}] certify below the floor — weak metrics alone are not evidence of mixing`
          : ''),
    );
  }
  return { id: 'e-log2-floor', name: 'Rising-sequence floor (information-theoretic minimum)', pass, details };
}

function checkCalibration(gsr52: CurveResult, gsr100: CurveResult): CheckResult {
  // THE calibration invariant: certifiedMixed on pure GSR must land within
  // ±1 shuffle of M_FAIR (theory layer, TV ≤ 0.05) for both deck sizes.
  // Earlier ⇒ the battery is blind to late-stage structure — fail the build
  // rather than weaken the definition. Later ⇒ c or T is miscalibrated —
  // adjust c, never the metrics.
  const details: string[] = [];
  let pass = true;
  for (const [n, result] of [[52, gsr52], [100, gsr100]] as const) {
    const fair = theoryMilestones(n).fair;
    const overall = result.cert.overall;
    const k = certK(overall);
    const ok = Number.isFinite(k) && Math.abs(k - fair) <= 1;
    pass &&= ok;
    details.push(
      `n=${n}: GSR certifiedMixed(c=${result.cert.options.c}, alpha=${result.cert.options.alpha}, ` +
        `T=${result.T}) = ${fmtCert(overall)} (binding: ${result.cert.bindingMetric ?? '—'}); ` +
        `M_FAIR = ${fair} (tolerance ±1) ${ok ? 'OK' : 'FAIL'}`,
    );
  }
  return {
    id: 'f-calibration',
    name: 'Calibration invariant (empirical certification ≡ theory layer at M_FAIR ± 1)',
    pass,
    details,
  };
}
