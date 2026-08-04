import { describe, it, expect } from 'vitest';
import {
  EXACT_TV_52,
  EXACT_TV_60,
  EXACT_TV_100,
  exactTV,
  theoryMilestones,
  mShufflesFor,
  M_KNEE_52,
  M_FAIR_52,
  M_STRICT_52,
  M_KNEE_100,
  M_FAIR_100,
  M_STRICT_100,
} from '../src/sim/anchors';

describe('Bayer-Diaconis exact TV anchors', () => {
  it('52-card table matches the published values (m=1..8)', () => {
    // Bayer & Diaconis (1992), Table 1 — the literature cross-check that
    // guards the generated table (and the generating script's convention).
    const published = [1.0, 1.0, 1.0, 1.0, 0.924, 0.614, 0.334, 0.167];
    for (let m = 1; m <= 8; m++) {
      expect(Math.abs(EXACT_TV_52[m - 1]! - published[m - 1]!)).toBeLessThan(5e-4);
    }
  });

  it('tables are monotone non-increasing and asymptotically halve', () => {
    for (const table of [EXACT_TV_52, EXACT_TV_60, EXACT_TV_100]) {
      for (let i = 1; i < table.length; i++) {
        expect(table[i]!).toBeLessThanOrEqual(table[i - 1]! + 1e-12);
      }
      // In the tail TV(m+1)/TV(m) -> 1/2 (the 2x-per-shuffle decay).
      const last = table.length - 1;
      const ratio = table[last]! / table[last - 1]!;
      expect(ratio).toBeGreaterThan(0.45);
      expect(ratio).toBeLessThan(0.55);
    }
  });

  it('has the expected lengths and helper semantics', () => {
    expect(EXACT_TV_52.length).toBe(16);
    expect(EXACT_TV_100.length).toBe(16);
    expect(exactTV(52, 5)).toBeCloseTo(0.923733, 6);
    expect(exactTV(100, 1)).toBe(1);
    expect(exactTV(100, 99)).toBe(0); // beyond table
    expect(exactTV(52, 0)).toBe(1);
  });

  it('theory-layer milestones M(eps) match the table', () => {
    // M_KNEE(52) = 7 is the classic "seven shuffles suffice" point
    expect(M_KNEE_52).toBe(7);
    expect(M_FAIR_52).toBe(10);
    expect(M_STRICT_52).toBe(13);
    expect(M_KNEE_100).toBe(8);
    expect(M_FAIR_100).toBe(12);
    expect(M_STRICT_100).toBe(14);
    expect(theoryMilestones(60)).toEqual({ knee: 7, fair: 11, strict: 13 });
    expect(EXACT_TV_60.length).toBe(16);
    expect(exactTV(60, 7)).toBeCloseTo(0.40618, 5);
    // boundary semantics: first m with TV <= eps
    expect(mShufflesFor(52, EXACT_TV_52[6]!)).toBe(7);
    expect(mShufflesFor(100, 1)).toBe(1);
    expect(mShufflesFor(100, 1e-9)).toBe(Infinity); // beyond the table
  });
});
