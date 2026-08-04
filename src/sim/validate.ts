// PHASE 1 validation suite — the gate everything else depends on.
//
// Runs headless under vitest (CI fails if any check fails) and in the
// browser on the /validate page (same code, same numbers).
//
// A note on what "mixed" means here: mixedAt uses the z-distance of the
// trajectory MEAN from the uniform reference, so it scales with sqrt(T) —
// more trajectories detect smaller residual bias and push mixedAt later.
// That is a feature, not a bug: the check below verifies that the point
// where rising-sequence bias sinks below detectability is exactly where the
// EXACT Bayer-Diaconis TV anchors say it should be (bias ≈ RATIO * TV).

import { makePRNG, makeDeck, fisherYates } from './prng';
import { gsr, faro } from './operators';
import {
  makeMetricComputer,
  risingSequences,
  uniformReference,
  METRIC_NAMES,
  type MetricName,
} from './metrics';
import { metricCurves, mixedAtFromZ, ENTER_BAND, type CurveResult } from './experiment';
import { EXACT_TV_52, EXACT_TV_100, exactTV } from './anchors';

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
  /** curves for the /validate page charts */
  gsr52: CurveResult;
  gsr100: CurveResult;
  faro52: CurveResult;
  faro100: CurveResult;
  anchors: { tv52: readonly number[]; tv100: readonly number[] };
  /** ceil(log2((n+1)/2)) — no riffle-family shuffle can be random before this */
  log2Floor: { n52: number; n100: number };
  generatedAt?: string;
}

/**
 * Empirical ratio between rising-sequence mean bias (in single-permutation
 * SDs) and the exact TV distance, in the asymptotic regime. Measured ≈ 2.7
 * and stable over m for both n=52 and n=100; check (d) re-verifies stability
 * on every run before using it to predict the detection boundary.
 */
export const RISING_BIAS_TV_RATIO = 2.7;

export function predictedRisingMixedAt(n: 52 | 100, T: number): number {
  for (let m = 1; m <= 40; m++) {
    if (RISING_BIAS_TV_RATIO * exactTV(n, m) * Math.sqrt(T) < ENTER_BAND) return m;
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
  report('Single-riffle invariant…', 0.25);
  checks.push(checkRiffleInvariant(opts));

  // ---- curves (used by c and d) ------------------------------------------
  report('GSR trajectories n=52…', 0.35);
  const gsr52 = metricCurves(gsr, {
    n: 52, K: 16, T: opts.trajectories, seed: opts.seed + 1, lfSamples: opts.lfSamples,
  });
  report('GSR trajectories n=100…', 0.55);
  const gsr100 = metricCurves(gsr, {
    n: 100, K: 20, T: opts.trajectories, seed: opts.seed + 2, lfSamples: opts.lfSamples,
  });
  report('Faro control…', 0.8);
  const faroFn = (deck: Int16Array, scratch: Int16Array) => faro(deck, scratch, false);
  // Faro is deterministic — 2 identical trajectories suffice for curves; the
  // z-of-mean then reflects pure bias at an effective T of `trajectories`.
  const faro52 = metricCurves(faroFn, {
    n: 52, K: 24, T: 2, seed: opts.seed + 3, lfSamples: opts.lfSamples,
  });
  const faro100 = metricCurves(faroFn, {
    n: 100, K: 60, T: 2, seed: opts.seed + 4, lfSamples: opts.lfSamples,
  });

  // ---- (c) Faro control ---------------------------------------------------
  checks.push(checkFaroControl());

  // ---- (d) GSR convergence vs anchors ------------------------------------
  report('Checking convergence against anchors…', 0.92);
  checks.push(checkGsrConvergence(52, gsr52, opts.trajectories));
  checks.push(checkGsrConvergence(100, gsr100, opts.trajectories));

  // ---- (e) rising-sequence floor (reported, and sanity-asserted) ----------
  checks.push(checkLog2Floor(gsr52, gsr100));

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
    log2Floor: { n52: log2Floor(52), n100: log2Floor(100) },
  };
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

function checkFaroControl(): CheckResult {
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

  // Repeated faro never converges: rising sequences cycle (2,4,8,16,32,13,26,1
  // for n=52) and keep re-entering fully-ordered states — they never settle in
  // the uniform band. We assert the deterministic trajectory (i) returns to
  // rising-sequence count 1, and (ii) is outside the ±2-SD uniform band for
  // at least half of every period — i.e. mixedAt = never.
  for (const n of [52, 100] as const) {
    const deck = makeDeck(n);
    const scratch = new Int16Array(n);
    const pos = new Int16Array(n);
    const ref = uniformReference(n, 'risingSequences');
    const K = 64;
    const zs = new Float64Array(K);
    let minRs = Infinity;
    let maxRs = 0;
    for (let k = 0; k < K; k++) {
      faro(deck, scratch, false);
      const rs = risingSequences(deck, pos);
      minRs = Math.min(minRs, rs);
      maxRs = Math.max(maxRs, rs);
      // deterministic: treat as bias with an effective T of 2000
      zs[k] = ((rs - ref.mean) / ref.sd) * Math.sqrt(2000);
    }
    const mixed = mixedAtFromZ(zs);
    const ok = mixed === Infinity && minRs === 1;
    pass &&= ok;
    details.push(
      `n=${n}: rising sequences over 64 faros stay in [${minRs}, ${maxRs}], ` +
        `re-entering full order (min=1); mixedAt = ${mixed === Infinity ? 'never' : mixed} ` +
        `(expected never) ${ok ? 'OK' : 'FAIL'}`,
    );
  }
  return { id: 'c-faro-control', name: 'Faro control (perfect interleave does not mix)', pass, details };
}

const GENERIC_METRICS: readonly MetricName[] = [
  'adjacentPairDisplacement',
  'spearmanToStart',
  'maxLinearFunctionalZ',
];

function checkGsrConvergence(n: 52 | 100, result: CurveResult, T: number): CheckResult {
  const details: string[] = [];
  let pass = true;

  // Generic metrics settle at ~7-8 shuffles for n=52 (~8-10 for n=100).
  const genericMax = n === 52 ? 9 : 10;
  for (const m of GENERIC_METRICS) {
    const k = result.mixedAt[m];
    const ok = k >= 2 && k <= genericMax;
    pass &&= ok;
    details.push(`${m}: mixed at ${k} (expected 2..${genericMax}) ${ok ? 'OK' : 'FAIL'}`);
  }

  // Rising sequences — the Bayer-Diaconis statistic — stays detectable at
  // trajectory count T exactly as long as the exact anchors predict:
  // mean bias ≈ RISING_BIAS_TV_RATIO × TV(m). Two checks:
  // 1. the bias/TV ratio is stable in the well-measured asymptotic regime;
  // 2. observed mixedAt is within ±2 of the anchor-predicted boundary.
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

  const predicted = predictedRisingMixedAt(n, T);
  const observed = result.mixedAt.risingSequences;
  const mixOk = Number.isFinite(observed) && Math.abs(observed - predicted) <= 2;
  pass &&= mixOk;
  details.push(
    `risingSequences: mixed at ${observed}, anchor-predicted ${predicted} at T=${T} ` +
      `(tolerance ±2) ${mixOk ? 'OK' : 'FAIL'}`,
  );

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
    // them), so the rising-sequence metric provably cannot be mixed below the
    // floor. Weaker metrics CAN saturate earlier — that is exactly why the
    // floor matters and why we always report the worst metric.
    const ok = result.mixedAt.risingSequences >= floor;
    pass &&= ok;
    const early = METRIC_NAMES.filter((m) => result.mixedAt[m] < floor);
    details.push(
      `n=${n}: floor ceil(log2((n+1)/2)) = ${floor}; risingSequences mixed at ` +
        `${result.mixedAt.risingSequences} (must be ≥ floor) ${ok ? 'OK' : 'FAIL'}` +
        (early.length > 0
          ? `; note: [${early.join(', ')}] saturate below the floor — weak metrics alone are not evidence of mixing`
          : ''),
    );
  }
  return { id: 'e-log2-floor', name: 'Rising-sequence floor (information-theoretic minimum)', pass, details };
}
