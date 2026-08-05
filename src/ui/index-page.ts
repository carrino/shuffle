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
import { theoryMilestones, type AnchoredDeckSize } from '../sim/anchors';

const K = 32;
const T = 1000;
const LF_SAMPLES = 50_000;
const SEED = 0x0e4c1a2e;

const METRIC_LABELS: Record<MetricName, string> = {
  risingSequences: 'Rising sequences',
  adjacentPairDisplacement: 'Adjacent-pair displacement',
  spearmanToStart: 'Spearman ρ vs start',
  maxLinearFunctionalZ: 'Max |z| of 5 linear functionals',
  sequentialGuesser: 'Sequential guesser',
};

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

// deck size: 60 (standard) or 100 (commander); everything downstream —
// uniform references, GSR baseline, theory milestones, log2 floor — is
// parametric in n, with exact TV anchors baked in for both sizes
const nParam = num('n', 100);
let deckN: AnchoredDeckSize = nParam === 40 ? 40 : nParam === 60 ? 60 : 100;

// A fitted empirical run-length distribution can arrive via ?rd=p1,p2,…
// (the /data "simulate" links). While active it replaces the geometric(mu)
// model; touching the mu slider reverts to geometric.
// max cut: past half is easy to grab on small decks (23 of 40, 35 of 60);
// commander is physically capped around half
function maxCut(n: number): number {
  return n === 100 ? 50 : Math.round(n * 0.575);
}

let runDist: number[] | null = (() => {
  const rd = params.get('rd');
  if (!rd) return null;
  const vals = rd.split(',').map(Number);
  return vals.length > 0 && vals.every((v) => Number.isFinite(v) && v >= 0) ? vals : null;
})();

const SLIDERS: SliderSpec[] = [
  { key: 'splitMean', label: 'Bottom-cut size (lifted packet)', min: 5, max: maxCut(deckN), step: 1, value: num('split', Math.round(deckN * 0.35)) },
  { key: 'splitSd', label: 'Cut wobble (SD, fresh draw each shuffle)', min: 0, max: 15, step: 0.5, value: num('splitSd', 3) },
  { key: 'mu', label: 'Interleave clump size (1 = perfect, 2 = pairs…)', min: 1, max: 4, step: 0.05, value: num('mu', 1) },
  { key: 'overhangMean', label: 'Overhang (− = big packet leads)', min: -10, max: 15, step: 1, value: num('overhang', 3) },
  { key: 'overhangSd', label: 'Overhang wobble (SD, fresh draw each shuffle)', min: 0, max: 8, step: 0.5, value: num('overhangSd', 2) },
  { key: 'positionDependence', label: 'End clumping (bigger clumps at top & bottom)', min: 0, max: 3, step: 0.1, value: num('posDep', 0) },
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
  <p style="margin-top:0">A mash shuffle of an <span id="deckNLabel">${deckN}</span>-card sleeved deck: lift the
  BOTTOM packet, its first few cards (the overhang) become the new top, then
  interleave down into the rest — clump size is how many cards fall together
  from one side before the other side gets in (1 = perfect one-at-a-time
  alternation) — and the big packet's remainder settles at the bottom, so
  cards cycle and nothing freezes. GSR (blue) is a <strong>fixed
  baseline</strong> — the classic riffle model with its standard assumptions
  (binomial half-cut, no overhang), computed once per deck size and unmoved
  by the sliders. Orange is <strong>GSR with your hands</strong>: the same
  cut, wobble and overhang the sliders describe, but GSR's drop rule instead
  of the clump-size interleave — apples-to-apples against the green mash
  curve, isolating what the interleave model itself contributes.
  Read the <strong>first chart</strong>: it plots how far the worst metric
  still is from uniform on a log scale, where each shuffle's halving is a
  straight line and the certification margin is visible — on the raw
  per-metric charts below, every curve reaches the gray ±2 SD band (single-deck
  spread) within a few shuffles, but certification tests the trajectory
  <em>mean</em> against a band 8× narrower — the <strong>green
  stripe</strong> inside the gray band, with a <strong>dot on each
  curve</strong> at the shuffle where that curve certifies. Mixedness is
  <strong>certifiedMixed(c=0.25, α=0.05)</strong> over T=${T} trajectories:
  the first shuffle where every metric's 95% CI fits inside
  ref ± 0.25·SD<sub>uniform</sub> and stays there (equivalence testing — see
  <a href="validate.html">/validate</a> for the full definition and the
  calibration against the exact GSR theory anchors M_KNEE/M_FAIR, drawn as
  vertical lines on every chart with the log₂ floor).</p>
  <p><strong>Pass 1 (before real clump data):</strong> with perfect
  interleaving the only randomness is the bottom-cut size and the overhang.
  The wobble numbers are <strong>standard deviations</strong> of a fresh
  Gaussian draw every shuffle (not hard ± bounds — a 6±5 overhang sometimes
  draws 14, sometimes −3). Zero both wobbles and the shuffle is a fixed
  permutation — it cycles forever and never mixes (the faro lesson). Real
  hands wobble, and that wobble is what mixes.</p>
  <label style="margin-top:10px">Deck size
    <select id="deckSize">
      <option value="40">40 (draft)</option>
      <option value="60">60 (standard)</option>
      <option value="100">100 (commander)</option>
    </select>
  </label>
  <div class="sliders" id="sliders"></div>
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
// remnant end has no UI control (mashing into the bottom of the deck is not
// a real technique); fitted configs can still request 'top' via the URL
const remnantEnd: 'top' | 'bottom' = params.get('remnant') === 'top' ? 'top' : 'bottom';
const deckSel = document.getElementById('deckSize') as HTMLSelectElement;
deckSel.value = String(deckN);
deckSel.addEventListener('change', () => {
  const oldN = deckN;
  const v = Number(deckSel.value);
  deckN = v === 40 ? 40 : v === 60 ? 60 : 100;
  document.getElementById('deckNLabel')!.textContent = String(deckN);
  // rescale the cut proportionally and re-clamp the slider range
  const split = document.getElementById('sl-splitMean') as HTMLInputElement;
  split.max = String(maxCut(deckN));
  split.value = String(Math.max(5, Math.min(maxCut(deckN), Math.round((Number(split.value) * deckN) / oldN))));
  schedule();
});

function currentConfig(): MashConfig {
  const get = (k: string) => Number((document.getElementById(`sl-${k}`) as HTMLInputElement).value);
  return {
    splitMean: get('splitMean'),
    splitSd: get('splitSd'),
    mu: get('mu'),
    overhangMean: get('overhangMean'),
    overhangSd: get('overhangSd'),
    remnantEnd,
    positionDependence: get('positionDependence'),
    runDist: runDist ?? undefined,
  };
}

const baselines = new Map<number, CurveResult>();
const disposers: (() => void)[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function resim(): void {
  const cfg = currentConfig();
  const milestones = theoryMilestones(deckN);
  const log2Floor = Math.ceil(Math.log2((deckN + 1) / 2));
  let baseline = baselines.get(deckN);
  if (!baseline) {
    baseline = metricCurves(gsr, { n: deckN, K, T, seed: SEED, lfSamples: LF_SAMPLES });
    baselines.set(deckN, baseline);
  }
  const result = metricCurves(makeMashShuffle(cfg), {
    n: deckN,
    K,
    T,
    seed: SEED + 1,
    lfSamples: LF_SAMPLES,
  });
  // Apples-to-apples riffle: identical cut + overhang params, GSR drop rule.
  const gsrDyn = metricCurves(
    makeMashShuffle({
      splitMean: cfg.splitMean,
      splitSd: cfg.splitSd,
      mu: 1,
      overhangMean: cfg.overhangMean,
      overhangSd: cfg.overhangSd,
      remnantEnd: cfg.remnantEnd,
      interleave: 'gsr',
    }),
    { n: deckN, K, T, seed: SEED + 2, lfSamples: LF_SAMPLES },
  );

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
    `<span class="item"><strong>${fmtCert(gsrDyn.cert.overall)}</strong>
      <span class="muted">GSR + your cut/overhang</span></span>
     <span class="item"><strong>${fmtCert(baseline.cert.overall)}</strong>
      <span class="muted">GSR certified (fixed baseline)</span></span>
     <span class="item"><strong>${milestones.knee} / ${milestones.fair}</strong>
      <span class="muted">M_KNEE / M_FAIR (GSR theory, n=${deckN})</span></span>
     <span class="item"><strong>${log2Floor}</strong><span class="muted">log₂ floor</span></span>`;

  // charts
  for (const d of disposers) d();
  disposers.length = 0;
  const charts = document.getElementById('charts')!;
  const x = Array.from({ length: K }, (_, i) => i + 1);

  // Headline chart: worst-metric standardized bias on a log scale — the
  // quantity certification actually gates on. Exponential decay renders as
  // a straight line; certification happens where a curve falls below the
  // c=0.25 margin (plus CI width) and stays.
  const worstEffect = (r: CurveResult): number[] =>
    x.map((_, k) =>
      Math.max(...METRIC_NAMES.map((m) => Math.abs(r.curves[m].effect[k]!))),
    );
  disposers.push(
    mountChart(charts, {
      title: 'Distance from random — worst metric (log scale)',
      subtitle: `|trajectory mean − uniform| in single-deck SDs; dashes = certification margin c=0.25; gray = below measurement noise at T=${T}`,
      x,
      xLabel: 'shuffles',
      logY: true,
      height: 240,
      series: [
        { label: 'mash', colorVar: '--series-3', values: worstEffect(result), certAt: certDot(result.cert.overall) },
        { label: 'GSR + your hands', colorVar: '--series-2', values: worstEffect(gsrDyn), certAt: certDot(gsrDyn.cert.overall) },
        { label: 'GSR (fixed)', colorVar: '--series-1', values: worstEffect(baseline), certAt: certDot(baseline.cert.overall) },
      ],
      refLine: 0.25,
      band: { lo: 1e-6, hi: 1 / Math.sqrt(T) },
      vLines: [
        { x: log2Floor, label: 'floor' },
        { x: milestones.knee, label: 'M_KNEE' },
        { x: milestones.fair, label: 'M_FAIR' },
      ],
    }),
  );

  for (const m of METRIC_NAMES) {
    const ref = uniformReference(deckN, m);
    disposers.push(
      mountChart(charts, {
        title: METRIC_LABELS[m],
        subtitle: `mash ${fmtCert(result.cert.perMetric[m])} · GSR+hands ${fmtCert(gsrDyn.cert.perMetric[m])} · GSR ${fmtCert(baseline.cert.perMetric[m])} · uniform ${ref.mean.toFixed(2)} ± ${ref.sd.toFixed(2)}`,
        x,
        xLabel: 'shuffles',
        series: [
          { label: 'mash', colorVar: '--series-3', values: Array.from(result.curves[m].mean), certAt: certDot(result.cert.perMetric[m]) },
          { label: 'GSR + your hands', colorVar: '--series-2', values: Array.from(gsrDyn.curves[m].mean), certAt: certDot(gsrDyn.cert.perMetric[m]) },
          { label: 'GSR (fixed)', colorVar: '--series-1', values: Array.from(baseline.curves[m].mean), certAt: certDot(baseline.cert.perMetric[m]) },
        ],
        band: { lo: ref.mean - 2 * ref.sd, hi: ref.mean + 2 * ref.sd },
        innerBand: { lo: ref.mean - 0.25 * ref.sd, hi: ref.mean + 0.25 * ref.sd },
        refLine: ref.mean,
        vLines: [
          { x: log2Floor, label: 'floor' },
          { x: milestones.knee, label: 'M_KNEE' },
          { x: milestones.fair, label: 'M_FAIR' },
        ],
      }),
    );
  }

  // keep the URL shareable
  const p = new URLSearchParams({
    n: String(deckN),
    split: String(cfg.splitMean),
    splitSd: String(cfg.splitSd),
    mu: String(cfg.mu),
    overhang: String(cfg.overhangMean),
    overhangSd: String(cfg.overhangSd),
    remnant: cfg.remnantEnd,
    posDep: String(cfg.positionDependence ?? 0),
  });
  if (runDist) p.set('rd', runDist.join(','));
  history.replaceState(null, '', `?${p.toString()}`);
}

function schedule(): void {
  for (const s of SLIDERS) {
    document.getElementById(`v-${s.key}`)!.textContent = (
      document.getElementById(`sl-${s.key}`) as HTMLInputElement
    ).value;
  }
  if (runDist) {
    document.getElementById('v-mu')!.textContent = 'fitted dist.';
  }
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(resim, 120);
}

for (const s of SLIDERS) {
  document.getElementById(`sl-${s.key}`)!.addEventListener('input', schedule);
}
// moving the mu slider reverts from a fitted empirical distribution
document.getElementById('sl-mu')!.addEventListener('input', () => {
  runDist = null;
});

function fmtCert(s: CertStatus): string {
  return s.status === 'certified' ? String(s.k) : s.status === 'not-certified' ? 'never' : 'cannot certify';
}

/** x position of a certification dot, or undefined when never certified */
function certDot(s: CertStatus): number | undefined {
  return s.status === 'certified' ? s.k : undefined;
}

resim();
