// /sweep — run the mash config grid in a worker, browse results in a
// sortable table, inspect any config against the GSR baseline, export CSV.

import './theme.css';
import { mountNav } from './nav';
import { mountChart } from './charts';
import { uniformReference, METRIC_NAMES, type MetricName } from '../sim/metrics';
import { sweepToCsv, DEFAULT_SWEEP, type SweepResult, type SweepRow } from '../sim/sweep';

mountNav('sweep.html');
const app = document.getElementById('app')!;
app.innerHTML = `
  <div class="card">
    <p style="margin-top:0">Grid: bottom-cut {30%, 40%, 50% of the deck ±3,
    varied 40%±10%} × mu {1.0 (perfect interleaving), 1.3, 2.0, 3.0} ×
    overhang {flush 1±0, small 3±2, varied 6±4} — 48 configs, remnant at
    bottom. Each config's per-metric certification is measured from
    trajectory curves against the uniform references, alongside a GSR
    baseline at the same settings. Runs in a Web Worker.</p>
    <label>Deck size
      <select id="deckSize" style="width:12em">
        <option value="60">60 (standard)</option>
        <option value="100" selected>100 (commander)</option>
      </select>
    </label>
    <label>Trajectories per config
      <input id="traj" type="number" value="${DEFAULT_SWEEP.T}" min="100" max="5000" step="100" style="width:7em">
    </label>
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
      <button id="run">Run sweep</button>
      <button id="csv" class="secondary" disabled>Export CSV</button>
      <span class="muted" id="status"></span>
    </div>
    <div class="progress" id="prog" style="display:none;margin-top:10px"><div style="width:0%"></div></div>
  </div>
  <div id="results"></div>
  <div id="detail"></div>`;

const runBtn = document.getElementById('run') as HTMLButtonElement;
const csvBtn = document.getElementById('csv') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;
const prog = document.getElementById('prog')!;
const progBar = prog.firstElementChild as HTMLElement;
const resultsEl = document.getElementById('results')!;
const detailEl = document.getElementById('detail')!;

let result: SweepResult | null = null;
let sortKey = 'shufflesToMix';
let sortDir = 1;
let selected = -1;
const detailDisposers: (() => void)[] = [];

runBtn.addEventListener('click', () => {
  runBtn.disabled = true;
  csvBtn.disabled = true;
  prog.style.display = 'block';
  resultsEl.innerHTML = '';
  detailEl.innerHTML = '';
  const T = Number((document.getElementById('traj') as HTMLInputElement).value) || DEFAULT_SWEEP.T;
  const n = Number((document.getElementById('deckSize') as HTMLSelectElement).value) === 60 ? 60 : 100;
  const worker = new Worker(new URL('./sweep.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === 'progress') {
      progBar.style.width = `${((msg.done / msg.total) * 100).toFixed(0)}%`;
      statusEl.textContent = `${msg.done}/${msg.total} — ${msg.label}`;
    } else if (msg.type === 'result') {
      worker.terminate();
      result = msg.result as SweepResult;
      runBtn.disabled = false;
      csvBtn.disabled = false;
      prog.style.display = 'none';
      statusEl.textContent = `done — ${result.rows.length} configs, T=${result.options.T}`;
      renderTable();
    }
  };
  worker.postMessage({ T, n });
});

csvBtn.addEventListener('click', () => {
  if (!result) return;
  const blob = new Blob([sweepToCsv(result)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sweep-n${result.options.n}-T${result.options.T}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

const COLS: { key: string; label: string; value: (r: SweepRow) => number | string }[] = [
  { key: 'splitLabel', label: 'split', value: (r) => r.splitLabel },
  { key: 'mu', label: 'mu', value: (r) => r.config.mu },
  { key: 'overhangLabel', label: 'overhang', value: (r) => r.overhangLabel },
  ...METRIC_NAMES.map((m) => ({
    key: `m_${m}`,
    label: shortMetric(m),
    value: (r: SweepRow) => certCell(r.cert.perMetric[m]),
  })),
  { key: 'shufflesToMix', label: 'certified', value: (r) => certCell(r.cert.overall) },
  { key: 'binding', label: 'binding', value: (r) => (r.cert.bindingMetric ? shortMetric(r.cert.bindingMetric) : '') },
];

function shortMetric(m: MetricName): string {
  return {
    risingSequences: 'rising',
    adjacentPairDisplacement: 'adjΔ',
    spearmanToStart: 'spearman',
    maxLinearFunctionalZ: 'lin.func',
    sequentialGuesser: 'guesser',
  }[m];
}

// numbers sort numerically; statuses sort after any number
function certCell(s: { status: string; k?: number }): number | string {
  return s.status === 'certified' ? s.k! : s.status === 'not-certified' ? 'never' : 'cannot certify';
}

function renderTable(): void {
  if (!result) return;
  // cert columns mix numbers and statuses: numbers sort first, then
  // 'never', then 'cannot certify'
  const rank = (v: number | string): number =>
    typeof v === 'number' ? v : v === 'never' ? 1e9 : 1e9 + 1;
  const rows = [...result.rows].sort((a, b) => {
    const col = COLS.find((c) => c.key === sortKey)!;
    const va = col.value(a);
    const vb = col.value(b);
    const cmp =
      typeof va === 'number' || typeof vb === 'number'
        ? rank(va) - rank(vb)
        : String(va).localeCompare(String(vb));
    return cmp * sortDir || a.index - b.index;
  });

  resultsEl.innerHTML = `
    <div class="card">
    <p style="margin-top:0">GSR baseline (n=${result.options.n}, T=${result.options.T}):
    per-metric certified at ${METRIC_NAMES.map((m) => `${shortMetric(m)} <strong>${fmtCell(certCell(result!.baseline.cert.perMetric[m]))}</strong>`).join(', ')}
    — overall <strong>${fmtCell(certCell(result.baseline.cert.overall))}</strong>
    (binding ${result.baseline.cert.bindingMetric ?? '—'}).
    Log₂ floor: <strong>${result.log2Floor}</strong>.
    "certified at k" = every later k keeps the ${'95'}% CI of the trajectory
    mean inside ref ± 0.25·SD<sub>uniform</sub> (TOST equivalence — see
    /validate for the full definition); <em>never</em> = not within
    K=${result.options.K}. Click a row for curves.</p>
    <div style="overflow-x:auto"><table class="data"><thead><tr>
      ${COLS.map((c) => `<th data-key="${c.key}">${c.label}${c.key === sortKey ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}
    </tr></thead><tbody>
      ${rows
        .map(
          (r) => `<tr data-index="${r.index}" style="cursor:pointer${r.index === selected ? ';font-weight:700' : ''}">
        ${COLS.map((c) => `<td>${fmtCell(c.value(r))}</td>`).join('')}</tr>`,
        )
        .join('')}
    </tbody></table></div></div>`;

  resultsEl.querySelectorAll('th').forEach((th) => {
    th.addEventListener('click', () => {
      const key = (th as HTMLElement).dataset.key!;
      if (sortKey === key) sortDir = -sortDir;
      else {
        sortKey = key;
        sortDir = 1;
      }
      renderTable();
    });
  });
  resultsEl.querySelectorAll('tbody tr').forEach((tr) => {
    tr.addEventListener('click', () => {
      selected = Number((tr as HTMLElement).dataset.index);
      renderTable();
      renderDetail();
    });
  });
}

function renderDetail(): void {
  if (!result) return;
  const row = result.rows.find((r) => r.index === selected);
  if (!row) return;
  for (const d of detailDisposers) d();
  detailDisposers.length = 0;
  detailEl.innerHTML = `<h2>split ${row.splitLabel} · mu ${row.config.mu} · overhang ${row.overhangLabel}
    <span class="muted">certified ${fmtCell(certCell(row.cert.overall))}, binding ${row.cert.bindingMetric ?? '—'}
    (GSR: ${fmtCell(certCell(result.baseline.cert.overall))}; floor ${result.log2Floor})</span></h2>`;
  const grid = document.createElement('div');
  grid.className = 'chart-grid';
  detailEl.appendChild(grid);
  const K = result.options.K;
  const x = Array.from({ length: K }, (_, i) => i + 1);
  for (const m of METRIC_NAMES) {
    const ref = uniformReference(result.options.n, m);
    detailDisposers.push(
      mountChart(grid, {
        title: `${shortMetric(m)} — ${fmtCell(certCell(row.cert.perMetric[m]))}`,
        subtitle: `uniform ${ref.mean.toFixed(2)} ± ${ref.sd.toFixed(2)}; log₂ floor at k=${result.log2Floor}`,
        x,
        xLabel: 'shuffles',
        series: [
          { label: 'mash', colorVar: '--series-3', values: Array.from(row.curves[m].mean as ArrayLike<number>) },
          { label: 'GSR', colorVar: '--series-1', values: Array.from(result.baseline.curves[m].mean as ArrayLike<number>) },
        ],
        band: { lo: ref.mean - 2 * ref.sd, hi: ref.mean + 2 * ref.sd },
        refLine: ref.mean,
      }),
    );
  }
  detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function fmtCell(v: number | string): string {
  return typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'never') : v;
}
