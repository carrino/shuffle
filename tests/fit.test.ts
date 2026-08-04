import { describe, it, expect } from 'vitest';
import { analyzeString, fitRecords, fitAll } from '../src/sim/fit';
import { mash, type MashConfig } from '../src/sim/mash';
import { makePRNG, makeDeck, resetSorted } from '../src/sim/prng';
import type { MashRecord } from '../src/data/schema';

function rec(string: string, intendedSplit = 3, collector = 'x'): MashRecord {
  return {
    ts: '2026-08-04T12:00:00Z',
    collector,
    technique: 'mash',
    deck: 'test',
    intendedSplit,
    string,
    n: string.length,
  };
}

/**
 * Synthesize a two-color observation from a known MashConfig: run one mash
 * on an identity deck and color each card by its actual packet membership
 * (R = small packet), exactly what the capture protocol records.
 */
function synthesize(cfg: MashConfig, n: number, seed: number, count: number, collector = 'sim'): MashRecord[] {
  const rng = makePRNG(seed);
  const deck = makeDeck(n);
  const scratch = new Int16Array(n);
  const records: MashRecord[] = [];
  for (let i = 0; i < count; i++) {
    resetSorted(deck);
    const draw = mash(deck, scratch, rng, cfg);
    let s = '';
    for (let j = 0; j < n; j++) {
      const v = deck[j]!;
      const inSmall = (v - draw.offset + n) % n < draw.split;
      s += inSmall ? 'R' : 'B';
    }
    records.push({ ...rec(s, Math.round(cfg.splitMean), collector), n });
  }
  return records;
}

describe('analyzeString (hand-checked)', () => {
  it('splits runs, remnant and counts on RBRBBB', () => {
    const a = analyzeString(rec('RBRBBB', 2));
    expect(a.actualSplit).toBe(2);
    expect(a.remnantEnd).toBe('bottom');
    expect(a.remnantSize).toBe(3);
    expect(a.runs).toEqual([1, 1, 1]); // zone = RBR
    expect(a.leadingBlock).toBe(0);
  });

  it('detects a top remnant on BBBBRBRB', () => {
    const a = analyzeString(rec('BBBBRBRB', 2));
    expect(a.remnantEnd).toBe('top');
    expect(a.remnantSize).toBe(4);
    expect(a.runs).toEqual([1, 1, 1, 1]); // zone = RBRB
  });

  it('measures a leading big-color block opposite the remnant', () => {
    const a = analyzeString(rec('BBRRBRBBBB', 3));
    expect(a.remnantEnd).toBe('bottom');
    expect(a.remnantSize).toBe(4);
    expect(a.leadingBlock).toBe(2);
    expect(a.runs).toEqual([2, 2, 1, 1]); // zone = BBRRBR
  });
});

describe('fit roundtrip — synthesize from a known config, recover it', () => {
  it('recovers split, mu and bottom remnant', () => {
    const cfg: MashConfig = {
      splitMean: 30,
      splitSd: 3,
      mu: 1.4,
      offsetMean: 0,
      offsetSd: 0,
      remnantEnd: 'bottom',
      positionDependence: 0,
    };
    const fit = fitRecords('sim', synthesize(cfg, 100, 1234, 300));
    expect(fit.recordCount).toBe(300);
    expect(Math.abs(fit.config.splitMean - 30)).toBeLessThan(1);
    expect(Math.abs(fit.config.splitSd - 3)).toBeLessThan(1);
    // interior-run mu is biased slightly low by truncation at packet ends
    expect(Math.abs(fit.config.mu - 1.4)).toBeLessThan(0.15);
    expect(fit.config.remnantEnd).toBe('bottom');
    expect(Math.abs(fit.config.positionDependence ?? 0)).toBeLessThan(0.3);
    expect(fit.stats.meanRemnant).toBeGreaterThan(20); // ~70 − 30·1.4 ≈ 28
  });

  it('recovers a top remnant and a clumpier mu', () => {
    const cfg: MashConfig = {
      splitMean: 35,
      splitSd: 2,
      mu: 2.2,
      offsetMean: 0,
      offsetSd: 0,
      remnantEnd: 'top',
      positionDependence: 0,
    };
    const fit = fitRecords('sim', synthesize(cfg, 100, 77, 300));
    expect(fit.config.remnantEnd).toBe('top');
    expect(Math.abs(fit.config.splitMean - 35)).toBeLessThan(1);
    expect(Math.abs(fit.config.mu - 2.2)).toBeLessThan(0.25);
  });

  it('recovers the sign of position dependence (clumpy ends)', () => {
    const flat: MashConfig = {
      splitMean: 40,
      splitSd: 2,
      mu: 1.6,
      offsetMean: 0,
      offsetSd: 0,
      remnantEnd: 'bottom',
      positionDependence: 0,
    };
    const clumpyEnds: MashConfig = { ...flat, positionDependence: 1.5 };
    const fitFlat = fitRecords('sim', synthesize(flat, 100, 5, 400));
    const fitClumpy = fitRecords('sim', synthesize(clumpyEnds, 100, 6, 400));
    expect(fitClumpy.config.positionDependence!).toBeGreaterThan(
      fitFlat.config.positionDependence! + 0.2,
    );
    // raw diagnostic agrees: ends clumpier than the middle
    const [a, mid, c] = fitClumpy.stats.muByThird;
    expect((a + c) / 2).toBeGreaterThan(mid + 0.15);
  });

  it('rotation-style offset is invisible in colors (documented limit)', () => {
    // The pre-cut rotation relabels which cards form the packets; colors are
    // assigned by actual membership, so the fitted offset stays ~0. A real
    // collector habit shows up instead as a leading ordered block, which
    // analyzeString measures (see hand-check above).
    const cfg: MashConfig = {
      splitMean: 30,
      splitSd: 2,
      mu: 1.5,
      offsetMean: 8,
      offsetSd: 2,
      remnantEnd: 'bottom',
      positionDependence: 0,
    };
    const fit = fitRecords('sim', synthesize(cfg, 100, 9, 200));
    expect(fit.config.offsetMean).toBeLessThan(2);
  });
});

describe('fitAll grouping', () => {
  it('fits per collector and appends a labeled pooled fit', () => {
    const a = synthesize(
      { splitMean: 30, splitSd: 2, mu: 1.2, offsetMean: 0, offsetSd: 0, remnantEnd: 'bottom' },
      100, 11, 50, 'ana',
    );
    const b = synthesize(
      { splitMean: 45, splitSd: 2, mu: 2.5, offsetMean: 0, offsetSd: 0, remnantEnd: 'bottom' },
      100, 12, 50, 'bob',
    );
    const fits = fitAll([...a, ...b]);
    expect(fits.map((f) => f.collector)).toEqual(['ana', 'bob', 'POOLED']);
    const ana = fits[0]!;
    const bob = fits[1]!;
    expect(ana.config.mu).toBeLessThan(bob.config.mu - 0.5);
    expect(ana.config.splitMean).toBeLessThan(bob.config.splitMean - 5);
    // pooled sits between — and is never a silent default
    const pooled = fits[2]!;
    expect(pooled.config.mu).toBeGreaterThan(ana.config.mu);
    expect(pooled.config.mu).toBeLessThan(bob.config.mu);
  });

  it('single collector: no pooled duplicate', () => {
    const a = synthesize(
      { splitMean: 30, splitSd: 2, mu: 1.2, offsetMean: 0, offsetSd: 0, remnantEnd: 'bottom' },
      100, 13, 20, 'solo',
    );
    const fits = fitAll(a);
    expect(fits.map((f) => f.collector)).toEqual(['solo']);
  });
});
