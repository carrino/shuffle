// Config-grid sweep: which mash habits mix a 100-card deck, and how fast?
// Pure computation — runs inside the sweep Web Worker; the UI only renders.

import { metricCurves, certK, type CurveResult, type CertificationResult } from './experiment';
import { gsr } from './operators';
import { makeMashShuffle, type MashConfig } from './mash';
import { METRIC_NAMES } from './metrics';

export interface SweepOptions {
  n: number;
  /** trajectories per config */
  T: number;
  /** shuffles per trajectory */
  K: number;
  seed: number;
  lfSamples: number;
}

export const DEFAULT_SWEEP: SweepOptions = {
  n: 100,
  T: 800,
  // generous K: 30/70-split configs carry a ~40-card ordered remnant per
  // shuffle and need well over 20 shuffles before the bias is undetectable
  K: 30,
  seed: 0x5eeb,
  lfSamples: 50_000,
};

export interface SplitChoice {
  label: string;
  splitMean: number;
  splitSd: number;
}
export interface OffsetChoice {
  label: string;
  offsetMean: number;
  offsetSd: number;
}

// The grid from the project brief: split {30,40,50,varied} × mu {1.1,1.3,2.0,3.0}
// × offset {0, small, varied}.
export const SPLIT_CHOICES: readonly SplitChoice[] = [
  { label: '30±3', splitMean: 30, splitSd: 3 },
  { label: '40±3', splitMean: 40, splitSd: 3 },
  { label: '50±3', splitMean: 50, splitSd: 3 },
  { label: 'varied 40±10', splitMean: 40, splitSd: 10 },
];
export const MU_CHOICES: readonly number[] = [1.1, 1.3, 2.0, 3.0];
export const OFFSET_CHOICES: readonly OffsetChoice[] = [
  { label: 'none', offsetMean: 0, offsetSd: 0 },
  { label: 'small 5±2', offsetMean: 5, offsetSd: 2 },
  { label: 'varied 10±6', offsetMean: 10, offsetSd: 6 },
];

export interface SweepRow {
  index: number;
  splitLabel: string;
  offsetLabel: string;
  config: MashConfig;
  /** TOST certification — per-metric statuses plus the named binding metric */
  cert: CertificationResult;
  /** overall certified k for sorting (Infinity when not certified) */
  shufflesToMix: number;
  curves: CurveResult['curves'];
}

export interface SweepResult {
  options: SweepOptions;
  /** GSR baseline at the same n/T/K */
  baseline: CurveResult;
  rows: SweepRow[];
  log2Floor: number;
}

export function buildGrid(): { splitChoice: SplitChoice; mu: number; offsetChoice: OffsetChoice }[] {
  const grid: { splitChoice: SplitChoice; mu: number; offsetChoice: OffsetChoice }[] = [];
  for (const splitChoice of SPLIT_CHOICES) {
    for (const mu of MU_CHOICES) {
      for (const offsetChoice of OFFSET_CHOICES) {
        grid.push({ splitChoice, mu, offsetChoice });
      }
    }
  }
  return grid;
}

export function runSweep(
  opts: SweepOptions = DEFAULT_SWEEP,
  progress?: (done: number, total: number, label: string) => void,
  onRow?: (row: SweepRow) => void,
): SweepResult {
  const grid = buildGrid();
  const total = grid.length + 1;

  progress?.(0, total, 'GSR baseline');
  const baseline = metricCurves(gsr, {
    n: opts.n,
    K: opts.K,
    T: opts.T,
    seed: opts.seed,
    lfSamples: opts.lfSamples,
  });

  const rows: SweepRow[] = [];
  grid.forEach(({ splitChoice, mu, offsetChoice }, i) => {
    const config: MashConfig = {
      splitMean: splitChoice.splitMean,
      splitSd: splitChoice.splitSd,
      mu,
      offsetMean: offsetChoice.offsetMean,
      offsetSd: offsetChoice.offsetSd,
      remnantEnd: 'bottom',
      positionDependence: 0,
    };
    const label = `split ${splitChoice.label}, mu ${mu}, offset ${offsetChoice.label}`;
    progress?.(i + 1, total, label);
    const result = metricCurves(makeMashShuffle(config), {
      n: opts.n,
      K: opts.K,
      T: opts.T,
      seed: opts.seed + i + 1,
      lfSamples: opts.lfSamples,
    });
    const row: SweepRow = {
      index: i,
      splitLabel: splitChoice.label,
      offsetLabel: offsetChoice.label,
      config,
      cert: result.cert,
      shufflesToMix: result.shufflesToMix,
      curves: result.curves,
    };
    rows.push(row);
    onRow?.(row);
  });
  progress?.(total, total, 'done');

  return {
    options: opts,
    baseline,
    rows,
    log2Floor: Math.ceil(Math.log2((opts.n + 1) / 2)),
  };
}

/** CSV of the summary table (per-metric ks always included, never just the worst). */
export function sweepToCsv(result: SweepResult): string {
  const header = [
    'splitMean',
    'splitSd',
    'mu',
    'offsetMean',
    'offsetSd',
    ...METRIC_NAMES.map((m) => `certifiedAt_${m}`),
    'certifiedMixed_worst',
    'bindingMetric',
  ];
  const lines = [header.join(',')];
  for (const row of result.rows) {
    lines.push(
      [
        row.config.splitMean,
        row.config.splitSd,
        row.config.mu,
        row.config.offsetMean,
        row.config.offsetSd,
        ...METRIC_NAMES.map((m) => fmtCertCsv(row.cert.perMetric[m])),
        fmtCertCsv(row.cert.overall),
        row.cert.bindingMetric ?? '',
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}

function fmtCertCsv(s: { status: string; k?: number }): string {
  return s.status === 'certified' ? String(s.k) : s.status;
}
