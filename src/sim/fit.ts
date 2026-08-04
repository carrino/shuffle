// Fit mash parameters from real two-color observation strings.
//
// Identifiability notes (what a single post-mash color string can and cannot
// tell you, given the capture protocol of R small packet over B big packet):
// - Run lengths ARE directly observable: packets are identified by color and
//   model runs alternate packets, so color runs = model runs, except that
//   the big packet's remnant merges with the zone's final B run. We
//   therefore exclude the terminal run at the remnant end from mu fitting.
// - Actual split = R count (the whole small packet is red).
// - Remnant end/size = the longest terminal B run.
// - The offset habit is only visible as a leading ordered B block at the
//   opposite end from the remnant (mashing the small packet deeper leaves
//   the top cards untouched). Under zero offset that leading run has mean
//   ~mu/2 (it starts mid-alternation half the time), so we report
//   max(0, leadingRun − mu) as the offset estimate. It is a proxy, not an
//   exact inverse — good enough to flag a habitual offset.
// - Position dependence: mean run length by thirds of the interleave zone,
//   least-squares fit of the (2t−1)² profile used by the operator.
//
// Fits are grouped per collector and NEVER pooled by default — the whole
// point of collecting per-person data is to see whether technique is a
// spectrum or different in kind. A pooled fit is emitted alongside, clearly
// labeled.

import type { MashRecord } from '../data/schema';
import type { MashConfig } from './mash';

export interface StringAnalysis {
  n: number;
  /** actual small-packet size = R count */
  actualSplit: number;
  intendedSplit: number;
  /** 'top' | 'bottom' — end with the longest terminal B run */
  remnantEnd: 'top' | 'bottom';
  remnantSize: number;
  /** interior run lengths (interleave zone only, remnant excluded) */
  runs: number[];
  /** run lengths with their zone position t in 0..1 (for position dependence) */
  runPositions: { length: number; t: number }[];
  /** leading ordered B block at the non-remnant end */
  leadingBlock: number;
}

export function analyzeString(record: MashRecord): StringAnalysis {
  const s = record.string;
  const n = s.length;
  const actualSplit = [...s].filter((c) => c === 'R').length;

  // terminal B runs at each end
  let topB = 0;
  while (topB < n && s[topB] === 'B') topB++;
  let botB = 0;
  while (botB < n && s[n - 1 - botB] === 'B') botB++;
  const remnantEnd: 'top' | 'bottom' = topB > botB ? 'top' : 'bottom';
  const remnantSize = Math.max(topB, botB);
  const leadingBlock = Math.min(topB, botB);

  // interleave zone = everything except the remnant run
  const zoneStart = remnantEnd === 'top' ? remnantSize : 0;
  const zoneEnd = remnantEnd === 'bottom' ? n - remnantSize : n; // exclusive
  const runs: number[] = [];
  const runPositions: { length: number; t: number }[] = [];
  let i = zoneStart;
  while (i < zoneEnd) {
    const c = s[i];
    let j = i;
    while (j < zoneEnd && s[j] === c) j++;
    const length = j - i;
    runs.push(length);
    const mid = (i + j) / 2;
    runPositions.push({ length, t: zoneEnd === zoneStart ? 0.5 : (mid - zoneStart) / (zoneEnd - zoneStart) });
    i = j;
  }

  return {
    n,
    actualSplit,
    intendedSplit: record.intendedSplit,
    remnantEnd,
    remnantSize,
    runs,
    runPositions,
    leadingBlock,
  };
}

export interface FitResult {
  collector: string; // 'POOLED' for the pooled fit
  recordCount: number;
  config: MashConfig;
  /** diagnostics beyond the config */
  stats: {
    muSe: number;
    runCount: number;
    /** histogram of interior run lengths, index 0 = length 1 */
    runHistogram: number[];
    meanRemnant: number;
    splitBias: number; // mean(actual − intended)
    /** mean run length in each third of the zone (position dependence, raw) */
    muByThird: [number, number, number];
  };
}

export function fitRecords(collector: string, records: MashRecord[]): FitResult {
  const analyses = records.map(analyzeString);

  const allRuns: number[] = [];
  const allRunPositions: { length: number; t: number }[] = [];
  const splits: number[] = [];
  const offsets: number[] = [];
  const remnants: number[] = [];
  let remnantTopVotes = 0;
  let splitBiasSum = 0;

  for (const a of analyses) {
    allRuns.push(...a.runs);
    allRunPositions.push(...a.runPositions);
    splits.push(a.actualSplit);
    offsets.push(a.leadingBlock);
    remnants.push(a.remnantSize);
    if (a.remnantEnd === 'top') remnantTopVotes++;
    splitBiasSum += a.actualSplit - a.intendedSplit;
  }

  const mu = mean(allRuns);
  const muSd = sd(allRuns);
  const splitMean = mean(splits);
  const splitSd = sd(splits);

  // Position dependence: least squares of length ≈ mu0·(1 + d·(2t−1)²)
  // over interior runs. Solve for mu0 and d via the two-regressor normal
  // equations with x = (2t−1)².
  const xs = allRunPositions.map((r) => (2 * r.t - 1) * (2 * r.t - 1));
  const ys = allRunPositions.map((r) => r.length);
  const { intercept, slope } = linearFit(xs, ys);
  const positionDependence = intercept > 0.5 ? slope / intercept : 0;

  const muByThird: [number, number, number] = [
    mean(allRunPositions.filter((r) => r.t < 1 / 3).map((r) => r.length)),
    mean(allRunPositions.filter((r) => r.t >= 1 / 3 && r.t < 2 / 3).map((r) => r.length)),
    mean(allRunPositions.filter((r) => r.t >= 2 / 3).map((r) => r.length)),
  ];

  const rawOffset = mean(offsets);
  const offsetMean = Math.max(0, rawOffset - mu);

  const histogram: number[] = [];
  for (const r of allRuns) {
    histogram[r - 1] = (histogram[r - 1] ?? 0) + 1;
  }
  for (let i = 0; i < histogram.length; i++) histogram[i] = histogram[i] ?? 0;

  return {
    collector,
    recordCount: records.length,
    config: {
      splitMean: round2(splitMean),
      splitSd: round2(splitSd),
      mu: round2(mu),
      offsetMean: round2(offsetMean),
      offsetSd: round2(sd(offsets)),
      remnantEnd: remnantTopVotes * 2 > analyses.length ? 'top' : 'bottom',
      positionDependence: round2(positionDependence),
    },
    stats: {
      muSe: allRuns.length > 0 ? muSd / Math.sqrt(allRuns.length) : 0,
      runCount: allRuns.length,
      runHistogram: histogram,
      meanRemnant: round2(mean(remnants)),
      splitBias: round2(splitBiasSum / Math.max(1, analyses.length)),
      muByThird: [round2(muByThird[0]), round2(muByThird[1]), round2(muByThird[2])],
    },
  };
}

/** Per-collector fits plus a clearly-labeled pooled fit. Never pool silently. */
export function fitAll(records: MashRecord[]): FitResult[] {
  const byCollector = new Map<string, MashRecord[]>();
  for (const r of records) {
    const list = byCollector.get(r.collector) ?? [];
    list.push(r);
    byCollector.set(r.collector, list);
  }
  const fits = [...byCollector.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([collector, recs]) => fitRecords(collector, recs));
  if (byCollector.size > 1) fits.push(fitRecords('POOLED', records));
  return fits;
}

// ---------------------------------------------------------------------------

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}
function linearFit(xs: number[], ys: number[]): { intercept: number; slope: number } {
  const n = xs.length;
  if (n < 2) return { intercept: mean(ys), slope: 0 };
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const slope = sxx < 1e-9 ? 0 : sxy / sxx;
  return { intercept: my - slope * mx, slope };
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
