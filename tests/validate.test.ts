import { describe, it, expect } from 'vitest';
import { runValidation, FAST_OPTIONS, FULL_OPTIONS } from '../src/sim/validate';

// The PHASE 1 gate. CI runs the fast profile; FULL_VALIDATION=1 runs the
// full-size profile (more permutations/trajectories, tighter MC error).
const opts = process.env.FULL_VALIDATION ? FULL_OPTIONS : FAST_OPTIONS;

describe(`phase 1 validation gate (${process.env.FULL_VALIDATION ? 'full' : 'fast'})`, () => {
  const report = runValidation(opts);

  it('overall: all checks pass', () => {
    const failing = report.checks.filter((c) => !c.pass);
    expect(
      failing.map((c) => `${c.name}\n  ${c.details.join('\n  ')}`).join('\n'),
    ).toBe('');
    expect(report.pass).toBe(true);
  });

  for (const id of [
    'a-uniform-refs',
    'b-riffle-invariant',
    'c-faro-control',
    'd-gsr-convergence-52',
    'd-gsr-convergence-100',
    'e-log2-floor',
  ]) {
    it(`check ${id} passes`, () => {
      const check = report.checks.find((c) => c.id === id);
      expect(check, `check ${id} missing from report`).toBeDefined();
      expect(check!.details.join('\n')).not.toContain('FAIL');
      expect(check!.pass).toBe(true);
    });
  }

  it('reports the log2 floor: 6 for n=100, 5 for n=52', () => {
    expect(report.log2Floor.n100).toBe(6);
    expect(report.log2Floor.n52).toBe(5);
  });
});
