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
 * (R = the lifted bottom packet, values >= n - split), exactly what the
 * capture protocol records.
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
      s += deck[j]! >= n - draw.split ? 'R' : 'B';
    }
    records.push({ ...rec(s, Math.round(cfg.splitMean), collector), n });
  }
  return records;
}

describe('analyzeString (hand-checked)', () => {
  it('splits runs, remnant, overhang and counts on RBRBBB', () => {
    const a = analyzeString(rec('RBRBBB', 2));
    expect(a.actualSplit).toBe(2);
    expect(a.remnantEnd).toBe('bottom');
    expect(a.remnantSize).toBe(3);
    expect(a.overhang).toBe(1); // leading R run
    expect(a.runs).toEqual([1, 1]); // zone = RBR minus the overhang run
  });

  it('reads the overhang as the leading small-color run', () => {
    const a = analyzeString(rec('RRRBRBBBBB', 4));
    expect(a.remnantEnd).toBe('bottom');
    expect(a.remnantSize).toBe(5);
    expect(a.overhang).toBe(3); // RRR before the mesh
    expect(a.runs).toEqual([1, 1]); // zone = RRRBR minus overhang
  });

  it('detects a top remnant on BBBBRBRB (B-led bottom = overhang anomaly 0)', () => {
    const a = analyzeString(rec('BBBBRBRB', 2));
    expect(a.remnantEnd).toBe('top');
    expect(a.remnantSize).toBe(4);
    expect(a.overhang).toBe(0); // string ends with B: no small-color lead
    expect(a.runs).toEqual([1, 1, 1, 1]); // zone = RBRB
  });

  it('a big-color lead reads as overhang 0, runs stay interior', () => {
    const a = analyzeString(rec('BBRRBRBBBB', 3));
    expect(a.remnantEnd).toBe('bottom');
    expect(a.remnantSize).toBe(4);
    expect(a.overhang).toBe(0);
    expect(a.runs).toEqual([2, 2, 1, 1]); // zone = BBRRBR
  });
});

describe('fit roundtrip — synthesize from a known config, recover it', () => {
  it('recovers split, mu and bottom remnant', () => {
    const cfg: MashConfig = {
      splitMean: 30,
      splitSd: 3,
      mu: 1.4,
      overhangMean: 1,
      overhangSd: 0,
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
      overhangMean: 1,
      overhangSd: 0,
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
      overhangMean: 1,
      overhangSd: 0,
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

  it('recovers the overhang habit directly from leading runs', () => {
    const cfg: MashConfig = {
      splitMean: 30,
      splitSd: 2,
      mu: 1.5,
      overhangMean: 5,
      overhangSd: 2,
      remnantEnd: 'bottom',
      positionDependence: 0,
    };
    const fit = fitRecords('sim', synthesize(cfg, 100, 9, 300));
    expect(Math.abs(fit.config.overhangMean - 5)).toBeLessThan(0.5);
    expect(Math.abs(fit.config.overhangSd - 2)).toBeLessThan(0.6);
  });
});

describe('fitAll grouping', () => {
  it('fits per collector and appends a labeled pooled fit', () => {
    const a = synthesize(
      { splitMean: 30, splitSd: 2, mu: 1.2, overhangMean: 1, overhangSd: 0, remnantEnd: 'bottom' },
      100, 11, 50, 'ana',
    );
    const b = synthesize(
      { splitMean: 45, splitSd: 2, mu: 2.5, overhangMean: 1, overhangSd: 0, remnantEnd: 'bottom' },
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
      { splitMean: 30, splitSd: 2, mu: 1.2, overhangMean: 1, overhangSd: 0, remnantEnd: 'bottom' },
      100, 13, 20, 'solo',
    );
    const fits = fitAll(a);
    expect(fits.map((f) => f.collector)).toEqual(['solo']);
  });
});
