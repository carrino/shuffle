// / (explore) — play with a MashConfig and watch the metric curves respond.
// A single config is milliseconds of simulation, so re-sim runs debounced on
// the main thread; the GSR baseline is computed once and overlaid.

import './theme.css';
import { mountNav } from './nav';
import { mountChart } from './charts';
import { metricCurves, type CurveResult, type CertStatus } from '../sim/experiment';
import { gsr } from '../sim/operators';
import { makeMashShuffle, type MashConfig } from '../sim/mash';
import { uniformReference, METRIC_NAMES, type MetricName } from '../sim/metrics';
import { theoryMilestones } from '../sim/anchors';

const N = 100;
const K = 32;
const T = 1000;
const LF_SAMPLES = 50_000;
const SEED = 0x0e4c1a2e;

const METRIC_LABELS: Record<MetricName, string> = {
  risingSequences: 'Rising sequences',
  adjacentPairDisplacement: 'Adjacent-pair displacement',
  spearmanToStart: 'Spearman ρ vs start',
  maxLinearFunctionalZ: 'Max |z| of 5 linear functionals',
  topCardHome: 'P(top card at home)',
  sequentialGuesser: 'Sequential guesser',
};

const MILESTONES = theoryMilestones(100);
const LOG2_FLOOR = 6; // ceil(log2((100+1)/2))

mountNav('index.html');
const app = document.getElementById('app')!;

interface SliderSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => {
  const v = Number(params.get(k));
  return Number.isFinite(v) && params.has(k) ? v : d;
};

const SLIDERS: SliderSpec[] = [
  { key: 'splitMean', label: 'Small packet size', min: 5, max: 50, step: 1, value: num('split', 30) },
  { key: 'splitSd', label: 'Split variability ±', min: 0, max: 15, step: 0.5, value: num('splitSd', 3) },
  { key: 'mu', label: 'Run length mu (1 = perfect alternation)', min: 1, max: 4, step: 0.05, value: num('mu', 1.3) },
  { key: 'offsetMean', label: 'Cut offset', min: 0, max: 25, step: 1, value: num('offset', 10) },
  { key: 'offsetSd', label: 'Offset variability ±', min: 0, max: 10, step: 0.5, value: num('offsetSd', 6) },
  { key: 'positionDependence', label: 'Clumpier ends (mu profile)', min: 0, max: 3, step: 0.1, value: num('posDep', 0) },
];

app.innerHTML = `
<style>
  .sliders { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 4px 20px; }
  .sliders label { display: flex; justify-content: space-between; margin-top: 10px; }
  .sliders input[type=range] { width: 100%; accent-color: var(--series-3); padding: 6px 0; }
  .readout { display: flex; gap: 18px; flex-wrap: wrap; align-items: baseline; }
  .readout .big { font-size: 2.2rem; font-weight: 800; }
  .readout .item { font-variant-numeric: tabular-nums; }
  .readout .item .muted { display: block; }
</style>
<div class="card">
  <p style="margin-top:0">A mash shuffle of a ${N}-card sleeved deck: cut off a
  small packet, interleave in runs (mu = mean run length), the big packet's
  remainder drops as an ordered block. GSR (blue) is the classic riffle model
  for comparison; gray band = uniform mean ± 2 SD. Mixedness is
  <strong>certifiedMixed(c=0.25, α=0.05)</strong> over T=${T} trajectories:
  the first shuffle where every metric's 95% CI fits inside
  ref ± 0.25·SD<sub>uniform</sub> and stays there (equivalence testing — see
  <a href="validate.html">/validate</a> for the full definition and the
  calibration against the exact GSR theory anchors M_KNEE/M_FAIR, drawn as
  vertical lines on every chart with the log₂ floor).</p>
  <p><strong>Try zeroing the cut offset with a 30-card split:</strong> the
  interleave only ever reaches ~2× the split depth, so the bottom of the deck
  is <em>frozen</em> — a habitual no-cut 30/70 mash never mixes, no matter how
  many shuffles. The cut offset (or a bigger split) is what rescues it.</p>
  <div class="sliders" id="sliders"></div>
  <label style="margin-top:10px">Remnant block lands on
    <select id="remnant">
      <option value="bottom">bottom</option>
      <option value="top">top</option>
    </select>
  </label>
</div>
<div class="card readout" id="readout"></div>
<div class="chart-grid" id="charts"></div>`;

const slidersEl = document.getElementById('sliders')!;
for (const s of SLIDERS) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<label for="sl-${s.key}">${s.label}<span id="v-${s.key}">${s.value}</span></label>
    <input type="range" id="sl-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}">`;
  slidersEl.appendChild(wrap);
}
const remnantSel = document.getElementById('remnant') as HTMLSelectElement;
remnantSel.value = params.get('remnant') === 'top' ? 'top' : 'bottom';

function currentConfig(): MashConfig {
  const get = (k: string) => Number((document.getElementById(`sl-${k}`) as HTMLInputElement).value);
  return {
    splitMean: get('splitMean'),
    splitSd: get('splitSd'),
    mu: get('mu'),
    offsetMean: get('offsetMean'),
    offsetSd: get('offsetSd'),
    remnantEnd: remnantSel.value as 'top' | 'bottom',
    positionDependence: get('positionDependence'),
  };
}

let baseline: CurveResult | null = null;
const disposers: (() => void)[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function resim(): void {
  const cfg = currentConfig();
  baseline ??= metricCurves(gsr, { n: N, K, T, seed: SEED, lfSamples: LF_SAMPLES });
  const result = metricCurves(makeMashShuffle(cfg), {
    n: N,
    K,
    T,
    seed: SEED + 1,
    lfSamples: LF_SAMPLES,
  });

  // readout
  const readout = document.getElementById('readout')!;
  readout.innerHTML =
    `<span class="item"><span class="big">${fmtCert(result.cert.overall)}</span>
      <span class="muted">certifiedMixed (c=0.25, α=0.05) — binding: ${
        result.cert.bindingMetric ? METRIC_LABELS[result.cert.bindingMetric] : '—'
      }</span></span>` +
    METRIC_NAMES.map(
      (m) => `<span class="item"><strong>${fmtCert(result.cert.perMetric[m])}</strong>
        <span class="muted">${METRIC_LABELS[m]}</span></span>`,
    ).join('') +
    `<span class="item"><strong>${fmtCert(baseline.cert.overall)}</strong>
      <span class="muted">GSR certified (baseline)</span></span>
     <span class="item"><strong>${MILESTONES.knee} / ${MILESTONES.fair}</strong>
      <span class="muted">M_KNEE / M_FAIR (GSR theory)</span></span>
     <span class="item"><strong>${LOG2_FLOOR}</strong><span class="muted">log₂ floor</span></span>`;

  // charts
  for (const d of disposers) d();
  disposers.length = 0;
  const charts = document.getElementById('charts')!;
  const x = Array.from({ length: K }, (_, i) => i + 1);
  for (const m of METRIC_NAMES) {
    const ref = uniformReference(N, m);
    disposers.push(
      mountChart(charts, {
        title: METRIC_LABELS[m],
        subtitle: `mash ${fmtCert(result.cert.perMetric[m])} · GSR ${fmtCert(baseline.cert.perMetric[m])} · uniform ${ref.mean.toFixed(2)} ± ${ref.sd.toFixed(2)}`,
        x,
        xLabel: 'shuffles',
        series: [
          { label: 'mash', colorVar: '--series-3', values: Array.from(result.curves[m].mean) },
          { label: 'GSR', colorVar: '--series-1', values: Array.from(baseline.curves[m].mean) },
        ],
        band: { lo: ref.mean - 2 * ref.sd, hi: ref.mean + 2 * ref.sd },
        refLine: ref.mean,
        vLines: [
          { x: LOG2_FLOOR, label: 'floor' },
          { x: MILESTONES.knee, label: 'M_KNEE' },
          { x: MILESTONES.fair, label: 'M_FAIR' },
        ],
      }),
    );
  }

  // keep the URL shareable
  const p = new URLSearchParams({
    split: String(cfg.splitMean),
    splitSd: String(cfg.splitSd),
    mu: String(cfg.mu),
    offset: String(cfg.offsetMean),
    offsetSd: String(cfg.offsetSd),
    remnant: cfg.remnantEnd,
    posDep: String(cfg.positionDependence ?? 0),
  });
  history.replaceState(null, '', `?${p.toString()}`);
}

function schedule(): void {
  for (const s of SLIDERS) {
    document.getElementById(`v-${s.key}`)!.textContent = (
      document.getElementById(`sl-${s.key}`) as HTMLInputElement
    ).value;
  }
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(resim, 120);
}

for (const s of SLIDERS) {
  document.getElementById(`sl-${s.key}`)!.addEventListener('input', schedule);
}
remnantSel.addEventListener('change', schedule);

function fmtCert(s: CertStatus): string {
  return s.status === 'certified' ? String(s.k) : s.status === 'not-certified' ? 'never' : 'cannot certify';
}

resim();
