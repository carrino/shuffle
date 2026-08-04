import { describe, it, expect } from 'vitest';
import {
  risingSequences,
  adjacentPairDisplacement,
  spearmanToStart,
  fillPositions,
  linearFunctionalRef,
  randomLinearFunctionals,
  uniformReference,
} from '../src/sim/metrics';

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

describe('uniformReference', () => {
  it('documents the n=100 references from the spec', () => {
    expect(uniformReference(100, 'risingSequences').mean).toBeCloseTo(50.5, 12);
    expect(uniformReference(100, 'risingSequences').sd).toBeCloseTo(Math.sqrt(101 / 12), 12);
    expect(uniformReference(100, 'adjacentPairDisplacement').mean).toBeCloseTo(101 / 3, 12);
    expect(uniformReference(100, 'spearmanToStart').mean).toBe(0);
    expect(uniformReference(100, 'spearmanToStart').sd).toBeCloseTo(1 / Math.sqrt(99), 12);
  });
});
