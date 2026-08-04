// Thin theme-aware wrapper around uPlot (canvas, ~45kB) for the handful of
// chart shapes the app needs: metric curves with a uniform reference band,
// overlay lines, and log-scale anchor plots. Charts rebuild automatically on
// theme change so both modes use their own validated series steps.

import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface SeriesSpec {
  label: string;
  /** CSS custom property name, e.g. '--series-1' */
  colorVar: string;
  values: ArrayLike<number>;
  dash?: number[];
  /** draw point markers (used for measured-vs-exact overlays) */
  points?: boolean;
  width?: number;
}

export interface ChartSpec {
  title: string;
  subtitle?: string;
  /** shared x values */
  x: ArrayLike<number>;
  series: SeriesSpec[];
  xLabel?: string;
  yLabel?: string;
  /** horizontal reference band (e.g. uniform mean ± 2 SD) */
  band?: { lo: number; hi: number; label?: string };
  /** horizontal reference line (e.g. uniform mean) */
  refLine?: number;
  logY?: boolean;
  height?: number;
}

interface Mounted {
  el: HTMLElement;
  spec: ChartSpec;
  plot: uPlot | null;
  ro: ResizeObserver;
}

const mounted = new Set<Mounted>();

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function buildPlot(m: Mounted): void {
  m.plot?.destroy();
  const { spec, el } = m;
  const width = Math.max(260, el.clientWidth - 4);
  const height = spec.height ?? 210;
  const axisColor = cssVar('--text-muted');
  const gridColor = cssVar('--grid');

  const xs = Array.from(spec.x as ArrayLike<number>);
  const data: uPlot.AlignedData = [
    xs,
    ...spec.series.map((s) => Array.from(s.values).map((v) => (spec.logY ? Math.max(v, 1e-6) : v))),
  ];

  const series: uPlot.Series[] = [
    {},
    ...spec.series.map<uPlot.Series>((s) => ({
      label: s.label,
      stroke: cssVar(s.colorVar),
      width: s.width ?? 2,
      dash: s.dash,
      points: s.points
        ? { show: true, size: 7, fill: cssVar(s.colorVar) }
        : { show: false },
    })),
  ];

  const axisFont = '11px system-ui, sans-serif';
  const opts: uPlot.Options = {
    width,
    height,
    series,
    legend: { show: spec.series.length > 1 },
    cursor: { drag: { x: false, y: false } },
    scales: { x: { time: false }, ...(spec.logY ? { y: { distr: 3 as const } } : {}) },
    axes: [
      {
        stroke: axisColor,
        grid: { stroke: gridColor, width: 1 },
        ticks: { stroke: gridColor },
        font: axisFont,
        label: spec.xLabel,
        labelFont: axisFont,
        // integer shuffle counts only
        incrs: [1, 2, 5, 10, 20],
      },
      {
        stroke: axisColor,
        grid: { stroke: gridColor, width: 1 },
        ticks: { stroke: gridColor },
        font: axisFont,
        label: spec.yLabel,
        labelFont: axisFont,
        size: 52,
      },
    ],
    hooks: {
      drawClear: [
        (u) => {
          // uniform reference band + line, drawn beneath the series
          const ctx = u.ctx;
          const { band, refLine } = spec;
          const xMin = u.bbox.left;
          const xMax = u.bbox.left + u.bbox.width;
          if (band) {
            const yLo = u.valToPos(band.lo, 'y', true);
            const yHi = u.valToPos(band.hi, 'y', true);
            ctx.save();
            ctx.fillStyle = cssVar('--band');
            ctx.fillRect(xMin, Math.min(yLo, yHi), xMax - xMin, Math.abs(yLo - yHi));
            ctx.restore();
          }
          if (refLine !== undefined) {
            const y = u.valToPos(refLine, 'y', true);
            ctx.save();
            ctx.strokeStyle = cssVar('--axis');
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(xMin, y);
            ctx.lineTo(xMax, y);
            ctx.stroke();
            ctx.restore();
          }
        },
      ],
    },
  };

  m.plot = new uPlot(opts, data, el);
}

/** Mount a chart into a container; returns a disposer. */
export function mountChart(container: HTMLElement, spec: ChartSpec): () => void {
  const card = document.createElement('div');
  card.className = 'chart-card';
  const h = document.createElement('h3');
  h.textContent = spec.title;
  card.appendChild(h);
  if (spec.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'sub';
    sub.textContent = spec.subtitle;
    card.appendChild(sub);
  }
  const el = document.createElement('div');
  card.appendChild(el);
  container.appendChild(card);

  const m: Mounted = {
    el,
    spec,
    plot: null,
    ro: new ResizeObserver(() => {
      if (m.plot && Math.abs(m.plot.width - el.clientWidth) > 8) buildPlot(m);
    }),
  };
  buildPlot(m);
  m.ro.observe(el);
  mounted.add(m);
  return () => {
    m.ro.disconnect();
    m.plot?.destroy();
    mounted.delete(m);
    card.remove();
  };
}

// Rebuild all charts when the color scheme flips so dark-mode series steps
// (validated separately) apply.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  for (const m of mounted) buildPlot(m);
});
