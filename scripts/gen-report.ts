// Generates results/validation.json — the CI-published validation report
// consumed by the /validate page (which can also re-run everything live).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runValidation, FAST_OPTIONS, FULL_OPTIONS } from '../src/sim/validate';

const opts = process.env.FULL_VALIDATION ? FULL_OPTIONS : FAST_OPTIONS;
console.log(`Running validation (${process.env.FULL_VALIDATION ? 'full' : 'fast'} profile)…`);

const t0 = performance.now();
const report = runValidation(opts, (msg, frac) =>
  console.log(`  [${(frac * 100).toFixed(0).padStart(3)}%] ${msg}`),
);
report.generatedAt = new Date().toISOString();

const out = resolve(import.meta.dirname, '../results');
mkdirSync(out, { recursive: true });
writeFileSync(
  resolve(out, 'validation.json'),
  JSON.stringify(report, (_k, v) => (v instanceof Float64Array ? Array.from(v) : (v === Infinity ? 'never' : v)), 1),
);

console.log(`\n${report.pass ? 'PASS' : 'FAIL'} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
for (const c of report.checks) {
  console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}`);
  for (const d of c.details) console.log(`      ${d}`);
}
process.exit(report.pass ? 0 : 1);
