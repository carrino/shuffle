// /validate — the Phase 1 report page. Renders the CI-generated report
// (results/validation.json) if present, and can re-run the whole suite live
// in a Web Worker. This page is the app's "trust me" page: every later
// result stands on these checks.

import './theme.css';
import { mountNav } from './nav';
import { mountChart } from './charts';
import { uniformReference, METRIC_NAMES, type MetricName } from '../sim/metrics';
import {
  RISING_BIAS_TV_RATIO,
  FAST_OPTIONS,
  type ValidationReport,
  type CheckResult,
} from '../sim/validate';

const METRIC_LABELS: Record<MetricName, string> = {
  risingSequences: 'Rising sequences',
  adjacentPairDisplacement: 'Adjacent-pair displacement',
  spearmanToStart: 'Spearman ρ vs start',
  maxLinearFunctionalZ: 'Max |z| of 5 linear functionals',
  sequentialGuesser: 'Sequential guesser (correct guesses)',
};

// The report may arrive as live objects (worker) or JSON (CI file):
// Float64Array→number[]. Certification statuses are plain JSON either way.
type Loose = ValidationReport;

mountNav('validate.html');

const app = document.getElementById('app')!;
const controls = document.createElement('div');
controls.className = 'card';
controls.innerHTML = `
  <button id="run">Re-run validation in this browser</button>
  <span class="muted" id="source"></span>
  <div class="progress" id="prog" style="display:none;margin-top:10px"><div style="width:0%"></div></div>
  <div class="muted" id="progmsg"></div>`;
app.appendChild(controls);

const reportRoot = document.createElement('div');
app.appendChild(reportRoot);

const sourceEl = controls.querySelector('#source') as HTMLElement;
const runBtn = controls.querySelector('#run') as HTMLButtonElement;
const prog = controls.querySelector('#prog') as HTMLElement;
const progBar = prog.firstElementChild as HTMLElement;
const progMsg = controls.querySelector('#progmsg') as HTMLElement;

runBtn.addEventListener('click', () => {
  runBtn.disabled = true;
  prog.style.display = 'block';
  const worker = new Worker(new URL('./validate.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (e) => {
    if (e.data.type === 'progress') {
      progBar.style.width = `${(e.data.frac * 100).toFixed(0)}%`;
      progMsg.textContent = e.data.msg;
    } else if (e.data.type === 'report') {
      worker.terminate();
      runBtn.disabled = false;
      prog.style.display = 'none';
      progMsg.textContent = '';
      sourceEl.textContent = ' — run live in this browser just now';
      render(e.data.report as Loose);
    }
  };
  worker.postMessage(FAST_OPTIONS);
});

// Prefer the CI-generated report; fall back to a live run.
fetch('results/validation.json')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((json: Loose) => {
    sourceEl.textContent = ` — CI report generated ${json.generatedAt ?? '(unknown time)'}`;
    render(json);
  })
  .catch(() => {
    sourceEl.textContent = ' — no CI report found, running live…';
    runBtn.click();
  });

function render(report: Loose): void {
  reportRoot.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'card';
  head.innerHTML = `<h2 style="margin-top:0">Phase 1 validation ${
    report.pass ? '<span class="pill pass">ALL CHECKS PASS</span>' : '<span class="pill fail">FAILING</span>'
  }</h2>
  <p>GSR baseline + metric validation against the <em>exact</em> Bayer–Diaconis
  total-variation anchors (computed once with big-rational arithmetic in
  <code>tools/exact_tv.py</code>, baked into <code>src/sim/anchors.ts</code>).
  Uniform samples: ${report.options.uniformSamples.toLocaleString()},
  trajectories: ${report.options.trajectories.toLocaleString()}, seed
  <code>0x${report.options.seed.toString(16)}</code>.
  Rising-sequence floor: no riffle-family shuffle of 100 cards can be uniform
  before ⌈log₂((n+1)/2)⌉ = <strong>${report.log2Floor.n100}</strong> shuffles
  (${report.log2Floor.n52} for 52).</p>
  <h3>The mixedness definition</h3>
  <p><strong>Theory layer</strong> (pure GSR): M(ε) = first m with exact
  TV(m) ≤ ε. For n=100: M_KNEE (ε=0.5) = <strong>${report.milestones.n100.knee}</strong>,
  M_FAIR (ε=0.05) = <strong>${report.milestones.n100.fair}</strong>,
  M_STRICT (ε=0.01) = <strong>${report.milestones.n100.strict}</strong>
  (52 cards: ${report.milestones.n52.knee} / ${report.milestones.n52.fair} /
  ${report.milestones.n52.strict} — M_KNEE is the classic "7 shuffles").
  TV ≤ ε means no single pre-specified event's probability shifts by more
  than ε from uniform; the bound is additive (small-probability bets can
  move a lot in relative terms) and per-event (cumulative edge over a whole
  sequential deal is bounded only by n·ε — hence the sequential-guesser
  metric).</p>
  <p><strong>Empirical layer</strong> (any operator): certifiedMixed(c, α) —
  equivalence testing, never fail-to-reject. The first shuffle k where
  EVERY metric's ${(100 * (1 - 0.05)).toFixed(0)}% CI of the trajectory mean
  fits inside ref ± c·SD<sub>uniform</sub> and stays inside for all later k
  (c=0.25, α=0.05). If the CI half-width cannot beat c·SD at this T, the
  outcome is "cannot-certify" — explicitly distinct from "not mixed".
  Check (f) below is the calibration invariant tying the layers together.</p>`;
  reportRoot.appendChild(head);

  for (const check of report.checks) renderCheck(check);

  renderAnchorChart(report);
  renderTopCardChart(report);
  renderCurves(report, 100);
  renderCurves(report, 52);
}

function renderCheck(check: CheckResult): void {
  const div = document.createElement('div');
  div.className = `card check ${check.pass ? '' : 'fail'}`;
  div.innerHTML = `<h3><span class="status">${check.pass ? '✓' : '✗'}</span> ${check.name}</h3>
    <ul>${check.details.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`;
  reportRoot.appendChild(div);
}

function renderCurves(report: Loose, n: 52 | 100): void {
  const result = n === 52 ? report.gsr52 : report.gsr100;
  const faroResult = n === 52 ? report.faro52 : report.faro100;
  const section = document.createElement('section');
  section.innerHTML = `<h2>Metric curves, n=${n} (GSR vs faro control)</h2>
    <p class="muted">Gray band = uniform mean ± 2 SD of a single permutation;
    dashed line = uniform mean. GSR walks into the band and stays; the faro
    control cycles forever (period ${n === 52 ? 8 : 30}) and never settles.</p>`;
  const grid = document.createElement('div');
  grid.className = 'chart-grid';
  section.appendChild(grid);
  reportRoot.appendChild(section);

  const K = result.K;
  const x = Array.from({ length: K }, (_, i) => i + 1);
  for (const m of METRIC_NAMES) {
    const ref = uniformReference(n, m);
    mountChart(grid, {
      title: METRIC_LABELS[m],
      subtitle: `${fmtCert(result.cert.perMetric[m])} (T=${result.T}) · uniform ${ref.mean.toFixed(2)} ± ${ref.sd.toFixed(2)}`,
      x,
      xLabel: 'shuffles',
      series: [
        { label: 'GSR', colorVar: '--series-1', values: clampLen(result.curves[m].mean, K) },
        { label: 'Faro', colorVar: '--series-2', values: clampLen(faroResult.curves[m].mean, K) },
      ],
      band: { lo: ref.mean - 2 * ref.sd, hi: ref.mean + 2 * ref.sd },
      refLine: ref.mean,
    });
  }
}

function renderTopCardChart(report: Loose): void {
  const section = document.createElement('section');
  section.innerHTML = `<h2>Top-card excess overlay (GSR-only diagnostic)</h2>
    <p class="muted">P(original top card back on top) for GSR vs the known
    asymptotic (1 + λ/2)/n with λ = n/2^m — a late-stage check on the GSR
    simulator (the bias outlives rising-sequence saturation). Not a
    certification metric: the mash mechanic cycles the bottom packet to the
    top, so the top card always changes unless someone is palming it.
    Log scale.</p>`;
  const grid = document.createElement('div');
  grid.className = 'chart-grid';
  section.appendChild(grid);
  reportRoot.appendChild(section);

  for (const n of [100, 52] as const) {
    const data = n === 52 ? report.topCard.n52 : report.topCard.n100;
    const K = data.theory.length;
    const x = Array.from({ length: K }, (_, i) => i + 1);
    mountChart(grid, {
      title: `P(top card at home), n=${n}`,
      subtitle: 'measured GSR (points) vs (1+λ/2)/n (line); dashed = uniform 1/n',
      x,
      xLabel: 'riffles',
      logY: true,
      series: [
        { label: 'theory', colorVar: '--series-1', values: data.theory },
        {
          label: 'measured',
          colorVar: '--series-2',
          values: clampLen(data.measured, K),
          points: true,
          width: 0.5,
        },
      ],
      refLine: 1 / n,
    });
  }
}

function fmtCert(s: { status: string; k?: number }): string {
  return s.status === 'certified' ? `certified at ${s.k}` : s.status;
}

function renderAnchorChart(report: Loose): void {
  const section = document.createElement('section');
  section.innerHTML = `<h2>Exact anchor overlay</h2>
    <p class="muted">Lines: exact Bayer–Diaconis TV distance to uniform
    (big-rational arithmetic, not simulation). Points: measured rising-sequence
    bias ÷ ${RISING_BIAS_TV_RATIO} from the simulated trajectories. The points
    landing on the exact curves is the anchor-consistency check (d) — the
    simulation decays at exactly the rate the theory demands. Log scale.</p>`;
  const grid = document.createElement('div');
  grid.className = 'chart-grid';
  section.appendChild(grid);
  reportRoot.appendChild(section);

  for (const n of [100, 52] as const) {
    const tv = n === 52 ? report.anchors.tv52 : report.anchors.tv100;
    const result = n === 52 ? report.gsr52 : report.gsr100;
    const effect = Array.from(result.curves.risingSequences.effect as ArrayLike<number>);
    const K = Math.min(result.K, tv.length);
    const x = Array.from({ length: K }, (_, i) => i + 1);
    mountChart(grid, {
      title: `TV to uniform, n=${n}`,
      subtitle: 'exact anchor vs measured rising-sequence bias',
      x,
      xLabel: 'riffles',
      logY: true,
      series: [
        { label: 'Exact TV', colorVar: '--series-1', values: tv.slice(0, K) },
        {
          label: `|bias| ÷ ${RISING_BIAS_TV_RATIO}`,
          colorVar: '--series-2',
          values: effect.slice(0, K).map((e) => Math.abs(e) / RISING_BIAS_TV_RATIO),
          points: true,
          width: 0.5,
        },
      ],
    });
  }
}

function clampLen(a: ArrayLike<number>, k: number): number[] {
  return Array.from(a).slice(0, k);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
