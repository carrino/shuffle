// Web Worker: runs the full Phase 1 validation suite off the main thread.
import { runValidation, FAST_OPTIONS, type ValidationOptions } from '../sim/validate';

self.onmessage = (e: MessageEvent<ValidationOptions | null>) => {
  const opts = e.data ?? FAST_OPTIONS;
  const report = runValidation(opts, (msg, frac) => {
    self.postMessage({ type: 'progress', msg, frac });
  });
  self.postMessage({ type: 'report', report });
};
