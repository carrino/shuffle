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
};

// The report may arrive as live objects (worker) or JSON (CI file):
// Float64Array→number[], Infinity→'never'. Normalize the differences away.
type Loose = ValidationReport;
function num(v: number | string): number {
  return typeof v === 'string' ? Infinity : v;
}

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
  (${report.log2Floor.n52} for 52).</p>`;
  reportRoot.appendChild(head);

  for (const check of report.checks) renderCheck(check);

  renderAnchorChart(report);
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
    const mixed = num(result.mixedAt[m] as unknown as number | string);
    mountChart(grid, {
      title: METRIC_LABELS[m],
      subtitle: `mixed at ${Number.isFinite(mixed) ? mixed : 'never'} (T=${result.T}) · uniform ${ref.mean.toFixed(2)} ± ${ref.sd.toFixed(2)}`,
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
