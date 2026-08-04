// Web Worker: runs the config-grid sweep off the main thread, streaming
// progress and per-config rows back to the page.
import { runSweep, DEFAULT_SWEEP, type SweepOptions } from '../sim/sweep';

self.onmessage = (e: MessageEvent<Partial<SweepOptions> | null>) => {
  const opts: SweepOptions = { ...DEFAULT_SWEEP, ...(e.data ?? {}) };
  const result = runSweep(
    opts,
    (done, total, label) => self.postMessage({ type: 'progress', done, total, label }),
    (row) => self.postMessage({ type: 'row', row }),
  );
  self.postMessage({ type: 'result', result });
};
