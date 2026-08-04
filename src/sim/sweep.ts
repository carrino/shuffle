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
export interface OverhangChoice {
  label: string;
  overhangMean: number;
  overhangSd: number;
}

// Grid: split {30%, 40%, 50%, varied 40%} of the deck × mu {1.0 (perfect
// interleave), 1.3, 2.0, 3.0} × overhang {flush, small, varied}. Split
// means scale with deck size (60 or 100); the ±3 hand wobble is absolute.
export function splitChoices(n: number): readonly SplitChoice[] {
  const at = (frac: number) => Math.round(n * frac);
  return [
    { label: `${at(0.3)}±3`, splitMean: at(0.3), splitSd: 3 },
    { label: `${at(0.4)}±3`, splitMean: at(0.4), splitSd: 3 },
    { label: `${at(0.5)}±3`, splitMean: at(0.5), splitSd: 3 },
    { label: `varied ${at(0.4)}±${Math.round(n / 10)}`, splitMean: at(0.4), splitSd: Math.round(n / 10) },
  ];
}
export const MU_CHOICES: readonly number[] = [1.0, 1.3, 2.0, 3.0];
export const OVERHANG_CHOICES: readonly OverhangChoice[] = [
  { label: 'flush 1±0', overhangMean: 1, overhangSd: 0 },
  { label: 'small 3±2', overhangMean: 3, overhangSd: 2 },
  { label: 'varied 6±4', overhangMean: 6, overhangSd: 4 },
];

export interface SweepRow {
  index: number;
  splitLabel: string;
  overhangLabel: string;
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

export function buildGrid(n = 100): { splitChoice: SplitChoice; mu: number; overhangChoice: OverhangChoice }[] {
  const grid: { splitChoice: SplitChoice; mu: number; overhangChoice: OverhangChoice }[] = [];
  for (const splitChoice of splitChoices(n)) {
    for (const mu of MU_CHOICES) {
      for (const overhangChoice of OVERHANG_CHOICES) {
        grid.push({ splitChoice, mu, overhangChoice });
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
  const grid = buildGrid(opts.n);
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
  grid.forEach(({ splitChoice, mu, overhangChoice }, i) => {
    const config: MashConfig = {
      splitMean: splitChoice.splitMean,
      splitSd: splitChoice.splitSd,
      mu,
      overhangMean: overhangChoice.overhangMean,
      overhangSd: overhangChoice.overhangSd,
      remnantEnd: 'bottom',
      positionDependence: 0,
    };
    const label = `split ${splitChoice.label}, mu ${mu}, overhang ${overhangChoice.label}`;
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
      overhangLabel: overhangChoice.label,
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
    'overhangMean',
    'overhangSd',
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
        row.config.overhangMean,
        row.config.overhangSd,
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
