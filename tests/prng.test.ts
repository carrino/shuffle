import { describe, it, expect } from 'vitest';
import { makePRNG, fisherYates, makeDeck } from '../src/sim/prng';

describe('prng', () => {
  it('same seed produces identical streams', () => {
    const a = makePRNG(12345);
    const b = makePRNG(12345);
    for (let i = 0; i < 1000; i++) {
      expect(a.nextUint32()).toBe(b.nextUint32());
    }
  });

  it('different seeds produce different streams', () => {
    const a = makePRNG(1);
    const b = makePRNG(2);
    let same = 0;
    for (let i = 0; i < 100; i++) {
      if (a.nextUint32() === b.nextUint32()) same++;
    }
    expect(same).toBeLessThan(3);
  });

  it('nextFloat is in [0,1) with mean 0.5', () => {
    const rng = makePRNG(7);
    let sum = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const x = rng.nextFloat();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    // SE of mean = (1/sqrt(12))/sqrt(N) ≈ 0.00091
    expect(Math.abs(sum / N - 0.5)).toBeLessThan(0.005);
  });

  it('nextInt stays in bounds and is roughly uniform', () => {
    const rng = makePRNG(11);
    const counts = new Array(7).fill(0);
    const N = 70_000;
    for (let i = 0; i < N; i++) {
      const x = rng.nextInt(7);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(7);
      counts[x]++;
    }
    for (const c of counts) {
      // expected 10000, SD ≈ 92.6; allow ±5 SD
      expect(Math.abs(c - 10_000)).toBeLessThan(500);
    }
  });

  it('binomialHalf(n) matches Binomial(n, 1/2) mean and variance', () => {
    const rng = makePRNG(2024);
    for (const n of [7, 52, 100]) {
      const N = 200_000;
      let sum = 0;
      let sumsq = 0;
      for (let i = 0; i < N; i++) {
        const x = rng.binomialHalf(n);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(n);
        sum += x;
        sumsq += x * x;
      }
      const mean = sum / N;
      const variance = sumsq / N - mean * mean;
      const theoryMean = n / 2;
      const theoryVar = n / 4;
      // SE of mean = sqrt(n/4/N); 5-sigma tolerance
      expect(Math.abs(mean - theoryMean)).toBeLessThan(5 * Math.sqrt(theoryVar / N));
      // variance of sample variance ≈ 2*var^2/N (normal approx); generous 10%
      expect(Math.abs(variance / theoryVar - 1)).toBeLessThan(0.1);
    }
  });

  it('fisherYates produces a permutation, deterministically per seed', () => {
    const d1 = makeDeck(20);
    const d2 = makeDeck(20);
    fisherYates(d1, makePRNG(5));
    fisherYates(d2, makePRNG(5));
    expect([...d1]).toEqual([...d2]);
    expect([...d1].sort((a, b) => a - b)).toEqual([...Array(20).keys()]);
  });

  it('fisherYates is unbiased on 3 elements', () => {
    const rng = makePRNG(99);
    const counts = new Map<string, number>();
    const N = 60_000;
    const deck = new Int16Array(3);
    for (let i = 0; i < N; i++) {
      deck.set([0, 1, 2]);
      fisherYates(deck, rng);
      const key = deck.join(',');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const c of counts.values()) {
      // expected 10000, SD ≈ 91; ±5 SD
      expect(Math.abs(c - 10_000)).toBeLessThan(500);
    }
  });
});
