import { describe, it, expect } from 'vitest';
import {
  risingSequences,
  adjacentPairDisplacement,
  spearmanToStart,
  fillPositions,
  linearFunctionalRef,
  randomLinearFunctionals,
  uniformReference,
  topCardHome,
  topCardHomeGSRTheory,
  sequentialGuesser,
  makeGuesserScratch,
} from '../src/sim/metrics';
import { makePRNG, fisherYates, makeDeck } from '../src/sim/prng';

function deckOf(...vals: number[]): Int16Array {
  return Int16Array.from(vals);
}

describe('risingSequences (hand-checked)', () => {
  const pos = new Int16Array(8);
  it('sorted deck has exactly 1', () => {
    expect(risingSequences(deckOf(0, 1, 2, 3, 4, 5), pos)).toBe(1);
  });
  it('reversed deck has n', () => {
    expect(risingSequences(deckOf(5, 4, 3, 2, 1, 0), pos)).toBe(6);
  });
  it('perfect interleave of two halves has 2', () => {
    expect(risingSequences(deckOf(0, 3, 1, 4, 2, 5), pos)).toBe(2);
  });
  it('[2,0,1] has 2 (sequences {0,1} and {2})', () => {
    expect(risingSequences(deckOf(2, 0, 1), pos)).toBe(2);
  });
  it('[1,0,3,2] has 3 ({0}, {1}? no: {0,...}) — hand count', () => {
    // values: pos(0)=1, pos(1)=0, pos(2)=3, pos(3)=2
    // v=0: pos(1)=0 < pos(0)=1 -> break; v=1: pos(2)=3 > 0 ok;
    // v=2: pos(3)=2 < 3 -> break  => 1 + 2 = 3 rising sequences
    expect(risingSequences(deckOf(1, 0, 3, 2), pos)).toBe(3);
  });
});

describe('adjacentPairDisplacement (hand-checked)', () => {
  const pos = new Int16Array(8);
  it('sorted deck: every consecutive value 1 apart', () => {
    expect(adjacentPairDisplacement(deckOf(0, 1, 2, 3), pos)).toBe(1);
  });
  it('reversed deck: also 1 apart', () => {
    expect(adjacentPairDisplacement(deckOf(3, 2, 1, 0), pos)).toBe(1);
  });
  it('[0,2,1,3]: |pos1-pos0|=2, |pos2-pos1|=1, |pos3-pos2|=2 -> 5/3', () => {
    expect(adjacentPairDisplacement(deckOf(0, 2, 1, 3), pos)).toBeCloseTo(5 / 3, 12);
  });
});

describe('spearmanToStart (hand-checked)', () => {
  const pos = new Int16Array(8);
  it('identity is +1', () => {
    expect(spearmanToStart(deckOf(0, 1, 2, 3, 4), pos)).toBe(1);
  });
  it('reversal is -1', () => {
    expect(spearmanToStart(deckOf(4, 3, 2, 1, 0), pos)).toBe(-1);
  });
  it('single swap on 3: rho = 1 - 6*2/(3*8) = 0.5', () => {
    expect(spearmanToStart(deckOf(1, 0, 2), pos)).toBeCloseTo(0.5, 12);
  });
  it('[1,2,0]: d^2 = 1+1+4 = 6 -> rho = 1 - 36/24 = -0.5', () => {
    // pos(0)=2, pos(1)=0, pos(2)=1 -> d = 2, -1, -1 -> d^2 sum 6
    expect(spearmanToStart(deckOf(1, 2, 0), pos)).toBeCloseTo(-0.5, 12);
  });
});

describe('fillPositions', () => {
  it('inverts the permutation', () => {
    const deck = deckOf(3, 0, 2, 1);
    const pos = new Int16Array(4);
    fillPositions(deck, pos);
    expect([...pos]).toEqual([1, 3, 2, 0]);
  });
});

describe('randomLinearFunctionals', () => {
  it('is deterministic given the same reference and deck', () => {
    const ref = linearFunctionalRef(20, 5000);
    const deck = deckOf(...[...Array(20).keys()].reverse());
    const pos = new Int16Array(20);
    const a = randomLinearFunctionals(deck, pos, ref);
    const b = randomLinearFunctionals(deck, pos, ref);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
  });
});

describe('topCardHome (hand-checked)', () => {
  it('is the indicator of the original top card being on top', () => {
    expect(topCardHome(deckOf(0, 1, 2, 3))).toBe(1);
    expect(topCardHome(deckOf(1, 0, 2, 3))).toBe(0);
    expect(topCardHome(deckOf(3, 2, 1, 0))).toBe(0);
  });

  it('GSR theory curve is (1 + lambda/2)/n, capped at 1', () => {
    expect(topCardHomeGSRTheory(100, 10)).toBeCloseTo((1 + 100 / 2 ** 11) / 100, 12);
    expect(topCardHomeGSRTheory(100, 0)).toBeCloseTo(0.51, 12); // lambda = 100
    expect(topCardHomeGSRTheory(2, 0)).toBe(1); // cap binds for tiny decks
    // converges to 1/n
    expect(topCardHomeGSRTheory(100, 30)).toBeCloseTo(0.01, 6);
  });
});

describe('sequentialGuesser (hand-checked)', () => {
  const scratch = makeGuesserScratch(8);
  it('gets everything right on a sorted deck', () => {
    // first guess: no threads -> smallest unrevealed = 0, correct; then the
    // run-following rule guesses v+1 forever
    expect(sequentialGuesser(deckOf(0, 1, 2, 3, 4, 5, 6, 7), scratch)).toBe(8);
  });

  it('scores [2,0,1]: miss, then rides from 0', () => {
    // guess 0 (smallest unrevealed) vs 2 -> miss; guess 0? no: 2 revealed,
    // successor 3 = out of deck-range threads? thread {2} tail 2 with 3
    // unrevealed BUT deck n=3 -> tail invalid; guess smallest unrevealed 0
    // vs 0 -> hit; then ride: guess 1 vs 1 -> hit. total 2.
    expect(sequentialGuesser(deckOf(2, 0, 1), makeGuesserScratch(3))).toBe(2);
  });

  it('is deterministic on a perfect interleave (deviation from H_n either way is the signal)', () => {
    // deck [0,4,1,5,2,6,3,7]: hit 0; then the run-riding rule guesses v+1
    // which strict alternation defeats every time until the final card
    // (guess 7, hit). Exactly 2 — BELOW the uniform H_8 ≈ 2.72: clumpy decks
    // push the guesser above H_n, strict alternation below it, and the
    // certification band is two-sided, so both register as structure.
    const score = sequentialGuesser(deckOf(0, 4, 1, 5, 2, 6, 3, 7), makeGuesserScratch(8));
    expect(score).toBe(2);
  });

  it('matches H_n exactly in expectation on uniform decks (any strategy)', () => {
    const n = 30;
    const ref = uniformReference(n, 'sequentialGuesser');
    let hn = 0;
    for (let k = 1; k <= n; k++) hn += 1 / k;
    expect(ref.mean).toBeCloseTo(hn, 12);
    const rng = makePRNG(2718);
    const deck = makeDeck(n);
    const s = makeGuesserScratch(n);
    const T = 40_000;
    let sum = 0;
    let sumsq = 0;
    for (let t = 0; t < T; t++) {
      fisherYates(deck, rng);
      const v = sequentialGuesser(deck, s);
      sum += v;
      sumsq += v * v;
    }
    const mean = sum / T;
    const sd = Math.sqrt(sumsq / T - mean * mean);
    // SE of mean = ref.sd / sqrt(T); 4-sigma
    expect(Math.abs(mean - ref.mean)).toBeLessThan(4 * (ref.sd / Math.sqrt(T)));
    // exact SD from independent Bernoulli(1/k) steps
    expect(Math.abs(sd / ref.sd - 1)).toBeLessThan(0.03);
  });
});

describe('uniformReference', () => {
  it('documents the n=100 references from the spec', () => {
    expect(uniformReference(100, 'risingSequences').mean).toBeCloseTo(50.5, 12);
    expect(uniformReference(100, 'risingSequences').sd).toBeCloseTo(Math.sqrt(101 / 12), 12);
    expect(uniformReference(100, 'adjacentPairDisplacement').mean).toBeCloseTo(101 / 3, 12);
    expect(uniformReference(100, 'spearmanToStart').mean).toBe(0);
    expect(uniformReference(100, 'spearmanToStart').sd).toBeCloseTo(1 / Math.sqrt(99), 12);
    expect(uniformReference(100, 'sequentialGuesser').mean).toBeCloseTo(5.187377517639621, 9);
  });
});
