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
      s += deck[j]! >= n - draw.split ? 'R' : 'T';
    }
    records.push({ ...rec(s, Math.round(cfg.splitMean), collector), n });
  }
  return records;
}

describe('analyzeString (hand-checked)', () => {
  it('splits runs, remnant, overhang and counts on RTRTTT', () => {
    const a = analyzeString(rec('RTRTTT', 2));
    expect(a.actualSplit).toBe(2);
    expect(a.remnantEnd).toBe('bottom');
    expect(a.remnantSize).toBe(3);
    expect(a.overhang).toBe(1); // leading R run
    expect(a.runs).toEqual([1, 1]); // zone = RTR minus the overhang run
  });

  it('reads the overhang as the leading small-color run', () => {
    const a = analyzeString(rec('RRRTRTTTTT', 4));
    expect(a.remnantEnd).toBe('bottom');
    expect(a.remnantSize).toBe(5);
    expect(a.overhang).toBe(3); // RRR before the mesh
    expect(a.runs).toEqual([1, 1]); // zone = RRRTR minus overhang
  });

  it('detects a top remnant on BBBBRBRB with a signed lead at the bottom', () => {
    const a = analyzeString(rec('TTTTRTRT', 2));
    expect(a.remnantEnd).toBe('top');
    expect(a.remnantSize).toBe(4);
    expect(a.overhang).toBe(-1); // bottom end leads with a single B
    expect(a.runs).toEqual([1, 1, 1]); // zone = RTRT minus the lead run
  });

  it('a big-color lead reads as NEGATIVE overhang (seated below flush)', () => {
    const a = analyzeString(rec('TTRRTRTTTT', 3));
    expect(a.remnantEnd).toBe('bottom');
    expect(a.remnantSize).toBe(4);
    expect(a.overhang).toBe(-2); // BB on top before the first lifted card
    expect(a.runs).toEqual([2, 1, 1]); // zone = TTRRTR minus the lead run
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

  it('recovers a NEGATIVE overhang habit (big packet leads)', () => {
    const cfg: MashConfig = {
      splitMean: 35,
      splitSd: 2,
      mu: 1.4,
      overhangMean: -4,
      overhangSd: 1.5,
      remnantEnd: 'bottom',
      positionDependence: 0,
    };
    const fit = fitRecords('sim', synthesize(cfg, 100, 21, 300));
    expect(Math.abs(fit.config.overhangMean - -4)).toBeLessThan(0.6);
    expect(Math.abs(fit.config.overhangSd - 1.5)).toBeLessThan(0.6);
  });

  it('emits the empirical run distribution and mash can consume it', () => {
    // clumpy synthesis -> fitted runDist should be geometric-ish with
    // P(1) ~ 1/mu, and it plugs straight back into MashConfig.runDist
    const cfg: MashConfig = {
      splitMean: 40,
      splitSd: 3,
      mu: 2,
      overhangMean: 1,
      overhangSd: 0,
      remnantEnd: 'bottom',
      positionDependence: 0,
    };
    const fit = fitRecords('sim', synthesize(cfg, 100, 31, 400));
    const rd = fit.config.runDist!;
    expect(rd.length).toBeGreaterThan(2);
    const total = rd.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 1)).toBeLessThan(0.01);
    expect(Math.abs(rd[0]! - 0.5)).toBeLessThan(0.06); // geometric p=1/mu
    // and the operator accepts it: multiset preserved over shuffles
    const deck = makeDeck(100);
    const scratch = new Int16Array(100);
    const rng = makePRNG(5);
    for (let k = 0; k < 20; k++) mash(deck, scratch, rng, { ...cfg, runDist: rd });
    expect([...deck].sort((a, b) => a - b)).toEqual([...Array(100).keys()]);
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
