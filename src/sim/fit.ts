// Fit mash parameters from real flip-method observation strings.
//
// Identifiability notes (what a single post-mash color string can and cannot
// tell you, given the capture protocol: R marks the lifted BOTTOM packet,
// T the top packet; the mash lifts the R packet and mashes it
// into the top, so the string normally STARTS with R):
// - Run lengths ARE directly observable: packets are identified by color and
//   model runs alternate packets, so color runs = model runs, except that
//   the big packet's remnant merges with the zone's final T run and the
//   leading run is the overhang block (not mu-driven). We therefore exclude
//   the terminal run at the remnant end AND the leading small-color run
//   from mu fitting.
// - Actual split = R count (the whole lifted packet is R).
// - Remnant end/size = the longest terminal T run.
// - The OVERHANG is directly observable and SIGNED: the leading run at the
//   non-remnant end is the overhang block — small-color run = +overhang
//   (lifted packet's head above the mesh), big-color run = -overhang (the
//   lifted packet seated below flush). Either way that run is excluded
//   from mu fitting.
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
  /** 'top' | 'bottom' — end with the longest terminal T run */
  remnantEnd: 'top' | 'bottom';
  remnantSize: number;
  /** interior run lengths (zone only; remnant and overhang run excluded) */
  runs: number[];
  /** run lengths with their zone position t in 0..1 (for position dependence) */
  runPositions: { length: number; t: number }[];
  /** signed overhang: leading R run = +len, leading T run = -len */
  overhang: number;
}

export function analyzeString(record: MashRecord): StringAnalysis {
  const s = record.string;
  const n = s.length;
  const actualSplit = [...s].filter((c) => c === 'R').length;

  // terminal T runs at each end
  let topB = 0;
  while (topB < n && s[topB] === 'T') topB++;
  let botB = 0;
  while (botB < n && s[n - 1 - botB] === 'T') botB++;
  const remnantEnd: 'top' | 'bottom' = topB > botB ? 'top' : 'bottom';
  const remnantSize = Math.max(topB, botB);

  // interleave zone = everything except the remnant run
  const zoneStart = remnantEnd === 'top' ? remnantSize : 0;
  const zoneEnd = remnantEnd === 'bottom' ? n - remnantSize : n; // exclusive
  const allRuns: { length: number; t: number; color: string }[] = [];
  let i = zoneStart;
  while (i < zoneEnd) {
    const c = s[i]!;
    let j = i;
    while (j < zoneEnd && s[j] === c) j++;
    const length = j - i;
    const mid = (i + j) / 2;
    allRuns.push({
      length,
      t: zoneEnd === zoneStart ? 0.5 : (mid - zoneStart) / (zoneEnd - zoneStart),
      color: c,
    });
    i = j;
  }

  // the SIGNED overhang is the run at the NON-remnant end: R = the lifted
  // packet's head above the mesh (+), T = seated below flush (-). It is the
  // seating block either way, so it never counts toward mu.
  const leadIdx = remnantEnd === 'bottom' ? 0 : allRuns.length - 1;
  const lead = allRuns[leadIdx];
  const overhang = lead === undefined ? 0 : lead.color === 'R' ? lead.length : -lead.length;
  const interior = allRuns.filter((_, idx) => idx !== leadIdx);

  return {
    n,
    actualSplit,
    intendedSplit: record.intendedSplit,
    remnantEnd,
    remnantSize,
    runs: interior.map((r) => r.length),
    runPositions: interior.map((r) => ({ length: r.length, t: r.t })),
    overhang,
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
  const overhangs: number[] = [];
  const remnants: number[] = [];
  let remnantTopVotes = 0;
  let splitBiasSum = 0;

  for (const a of analyses) {
    allRuns.push(...a.runs);
    allRunPositions.push(...a.runPositions);
    splits.push(a.actualSplit);
    overhangs.push(a.overhang);
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
      overhangMean: round2(mean(overhangs)),
      overhangSd: round2(sd(overhangs)),
      remnantEnd: remnantTopVotes * 2 > analyses.length ? 'top' : 'bottom',
      positionDependence: round2(positionDependence),
      // the measured interleave distribution itself — mash() samples from
      // this directly when present, so simulation uses the real clump
      // shape, not just its geometric-mean approximation
      runDist: allRuns.length > 0
        ? histogram.map((c) => Math.round((c / allRuns.length) * 10000) / 10000)
        : undefined,
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
