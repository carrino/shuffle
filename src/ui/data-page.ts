// /data — loaded observations, per-collector fit summaries, and the
// "spectrum or different in kind" view: overlaid per-collector run-length
// distributions. Each fit links to the explore page pre-loaded with the
// fitted MashConfig so it can be simulated and swept.

import './theme.css';
import { mountNav } from './nav';
import { mountChart } from './charts';
import { makeStaticStore } from '../data/store';
import { analyzeString, fitAll, type FitResult } from '../sim/fit';
import type { MashConfig } from '../sim/mash';

mountNav('data.html');
const app = document.getElementById('app')!;
app.innerHTML = `<p class="muted">Loading data/mashes.jsonl…</p>`;

const store = makeStaticStore();

function exploreUrl(cfg: MashConfig): string {
  const p = new URLSearchParams({
    split: String(cfg.splitMean),
    splitSd: String(cfg.splitSd),
    mu: String(cfg.mu),
    offset: String(cfg.offsetMean),
    offsetSd: String(cfg.offsetSd),
    remnant: cfg.remnantEnd,
    posDep: String(cfg.positionDependence ?? 0),
  });
  return `index.html?${p.toString()}`;
}

store
  .read()
  .then(({ records, invalid }) => {
    app.innerHTML = '';

    if (invalid.length > 0) {
      const div = document.createElement('div');
      div.className = 'card check fail';
      div.innerHTML = `<h3><span class="status">✗</span> ${invalid.length} invalid line(s) skipped</h3>
        <ul>${invalid
          .map((l) => `<li>line ${l.lineNumber}: ${l.errors.join('; ')}</li>`)
          .join('')}</ul>`;
      app.appendChild(div);
    }

    if (records.length === 0) {
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `<p style="margin-top:0">No observations yet.
        Grab a friend and a two-color deck, then use the
        <a href="capture.html">capture tool</a> — each observation is one line
        appended to <code>data/mashes.jsonl</code> via git commit.</p>`;
      app.appendChild(div);
      return;
    }

    // ---- records table ----------------------------------------------------
    const recCard = document.createElement('div');
    recCard.className = 'card';
    recCard.innerHTML = `<h2 style="margin-top:0">Observations (${records.length})</h2>
      <div style="overflow-x:auto"><table class="data"><thead><tr>
        <th>ts</th><th>collector</th><th>technique</th><th>deck</th>
        <th>n</th><th>intended</th><th>actual split</th><th>remnant</th><th>runs</th>
      </tr></thead><tbody>${records
        .map((r) => {
          const a = analyzeString(r);
          return `<tr><td>${r.ts.slice(0, 10)}</td><td>${esc(r.collector)}</td>
            <td>${esc(r.technique)}</td><td>${esc(r.deck)}</td><td>${r.n}</td>
            <td>${r.intendedSplit}</td><td>${a.actualSplit}</td>
            <td>${a.remnantSize} (${a.remnantEnd})</td><td>${a.runs.length}</td></tr>`;
        })
        .join('')}</tbody></table></div>`;
    app.appendChild(recCard);

    // ---- per-collector fits ----------------------------------------------
    const fits = fitAll(records);
    const fitCard = document.createElement('div');
    fitCard.className = 'card';
    fitCard.innerHTML = `<h2 style="margin-top:0">Fitted mash configs</h2>
      <p class="muted">Grouped per collector — pooled only as the labeled last
      row, never by default. mu = mean interior run length (SE in parens);
      offset is a proxy from leading ordered blocks.</p>
      <div style="overflow-x:auto"><table class="data"><thead><tr>
        <th>collector</th><th>records</th><th>split</th><th>mu</th>
        <th>mu by thirds</th><th>offset</th><th>remnant</th><th>pos.dep</th><th></th>
      </tr></thead><tbody>${fits
        .map(
          (f, i) => `<tr>
          <td>${f.collector === 'POOLED' ? '<em>POOLED</em>' : esc(f.collector)}</td>
          <td>${f.recordCount}</td>
          <td>${f.config.splitMean} ± ${f.config.splitSd}</td>
          <td>${f.config.mu} (±${round2(f.stats.muSe)})</td>
          <td>${f.stats.muByThird.join(' / ')}</td>
          <td>${f.config.offsetMean} ± ${f.config.offsetSd}</td>
          <td>${f.config.remnantEnd} (~${f.stats.meanRemnant})</td>
          <td>${f.config.positionDependence}</td>
          <td><a href="${exploreUrl(f.config)}" data-fit="${i}">simulate →</a></td>
        </tr>`,
        )
        .join('')}</tbody></table></div>
      <p class="muted">“simulate →” opens Explore pre-loaded with that config —
      run it live or feed it to the sweep from there.</p>`;
    app.appendChild(fitCard);

    // ---- run-length distributions (the spectrum view) ---------------------
    renderRunLengths(fits.filter((f) => f.collector !== 'POOLED'));
  })
  .catch((err: unknown) => {
    app.innerHTML = `<div class="card check fail"><h3>Failed to load data</h3>
      <p class="muted">${esc(String(err))}</p></div>`;
  });

function renderRunLengths(fits: FitResult[]): void {
  if (fits.length === 0) return;
  const section = document.createElement('section');
  section.innerHTML = `<h2>Run-length distributions by collector</h2>
    <p class="muted">Normalized interior-run histograms. Curves stacking on a
    smooth spectrum ⇒ everyone mashes alike, just clumpier or cleaner; a
    separated shape ⇒ a different technique in kind.</p>`;
  const grid = document.createElement('div');
  grid.className = 'chart-grid';
  section.appendChild(grid);
  app.appendChild(section);

  const maxLen = Math.max(...fits.map((f) => f.stats.runHistogram.length));
  const x = Array.from({ length: maxLen }, (_, i) => i + 1);
  // Categorical slots: first three are validated all-pairs; beyond that we
  // still plot but the legend carries identity (series count warning below).
  const colors = ['--series-1', '--series-2', '--series-3', '--series-4'];
  const shown = fits.slice(0, 4);
  mountChart(grid, {
    title: 'P(run length = L)',
    subtitle:
      shown.length < fits.length
        ? `first ${shown.length} collectors shown — refine before comparing more`
        : `${shown.length} collector(s)`,
    x,
    xLabel: 'run length',
    series: shown.map((f, i) => ({
      label: f.collector,
      colorVar: colors[i]!,
      values: x.map((len) => {
        const c = f.stats.runHistogram[len - 1] ?? 0;
        return c / Math.max(1, f.stats.runCount);
      }),
      points: true,
    })),
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
