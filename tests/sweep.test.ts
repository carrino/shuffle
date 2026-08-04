import { describe, it, expect } from 'vitest';
import { buildGrid, runSweep, sweepToCsv, type SweepOptions } from '../src/sim/sweep';
import { METRIC_NAMES } from '../src/sim/metrics';

const tiny: SweepOptions = { n: 100, T: 120, K: 16, seed: 99, lfSamples: 10_000 };

describe('sweep', () => {
  it('grid is the documented 4×4×3 = 48 configs', () => {
    expect(buildGrid().length).toBe(48);
  });

  const result = runSweep(tiny);

  it('produces one row per config with per-metric ks and worst', () => {
    expect(result.rows.length).toBe(48);
    for (const row of result.rows) {
      for (const m of METRIC_NAMES) {
        const k = row.mixedAt[m];
        expect(k === Infinity || (k >= 1 && k <= tiny.K)).toBe(true);
      }
      const finite = METRIC_NAMES.map((m) => row.mixedAt[m]).filter(Number.isFinite);
      const expected = finite.length === METRIC_NAMES.length ? Math.max(...finite) : Infinity;
      expect(row.shufflesToMix).toBe(expected);
    }
  });

  it('no config beats the log2 floor', () => {
    expect(result.log2Floor).toBe(6);
    for (const row of result.rows) {
      expect(row.shufflesToMix).toBeGreaterThanOrEqual(result.log2Floor);
    }
  });

  it('clumpier runs mix slower: rising-sequence bias is monotone in mu (given split variance)', () => {
    // Counter to faro intuition, WITH split variance (every grid split has
    // sd>0) cleaner alternation mixes FASTER at every split: the ±3-card
    // split jitter breaks the perfect-interleave degeneracy, while long
    // clumpy runs preserve ordered blocks. (The non-mixing faro corner needs
    // an exact sd=0 equal split — covered by the mash limit tests.) mixedAt
    // is too noisy at tiny T for pairwise ordering, so compare the
    // underlying signal: rising-sequence bias summed over mid-curve k.
    const bias = (row: (typeof result.rows)[number]) => {
      let s = 0;
      for (const k of [6, 7, 8, 9, 10]) {
        s += Math.abs((row.curves.risingSequences.effect as ArrayLike<number>)[k - 1]!);
      }
      return s;
    };
    const mus = [1.1, 1.3, 2.0, 3.0];
    for (const a of result.rows) {
      const i = mus.indexOf(a.config.mu);
      if (i < 0 || i === mus.length - 1) continue;
      const b = result.rows.find(
        (r) =>
          r.config.mu === mus[i + 1] &&
          r.splitLabel === a.splitLabel &&
          r.offsetLabel === a.offsetLabel,
      )!;
      // noise per term ~1/sqrt(T); allow generous slack, ordering must hold
      expect(bias(a)).toBeLessThanOrEqual(bias(b) + 1.5);
    }
  });

  it('CSV has a header plus one line per config, never a bare worst-only view', () => {
    const csv = sweepToCsv(result);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(49);
    for (const m of METRIC_NAMES) expect(lines[0]).toContain(`mixedAt_${m}`);
    expect(lines[0]).toContain('shufflesToMix_worst');
  });
});
