import { describe, it, expect } from 'vitest';
import { permFromRecord, makeReplayShuffle } from '../src/sim/replay';
import { makePRNG, makeDeck } from '../src/sim/prng';
import type { MashRecord } from '../src/data/schema';

function rec(string: string, intendedSplit = 3): MashRecord {
  return {
    ts: '2026-08-05T00:00:00Z',
    collector: 'test',
    technique: 'mash',
    deck: 'test',
    intendedSplit,
    string,
    n: string.length,
  };
}

describe('replay — exact permutations from capture strings', () => {
  it('extracts the permutation implied by the protocol', () => {
    // n=6, R block = bottom 3 (source positions 3,4,5), B = top 3 (0,1,2).
    // String RBRBRB: output takes R,B,R,B,R,B → sources 3,0,4,1,5,2.
    expect([...permFromRecord(rec('RBRBRB'))]).toEqual([3, 0, 4, 1, 5, 2]);
    // Leading B run = underhang; trailing B run = remnant.
    expect([...permFromRecord(rec('BBRRBB', 2))]).toEqual([0, 1, 4, 5, 2, 3]);
  });

  it('round-trips: applying the permutation to the prepared deck reproduces the string', () => {
    const string = 'RRRRBRBRBBRBRBBBBB';
    const n = string.length;
    const nR = [...string].filter((c) => c === 'R').length;
    const perm = permFromRecord(rec(string, nR));
    // prepared deck: B cards on top (0), R block of nR on the bottom (1)
    const colors = Array.from({ length: n }, (_, i) => (i >= n - nR ? 'R' : 'B'));
    const shuffled = Array.from(perm).map((src) => colors[src]!);
    expect(shuffled.join('')).toBe(string);
  });

  it('replay shuffle permutes the deck (multiset preserved, order changed)', () => {
    const strings = ['RBRBRBRB', 'RRBBRBBR'];
    const shuffle = makeReplayShuffle(strings.map((s) => permFromRecord(rec(s, 4))));
    const rng = makePRNG(9);
    const deck = makeDeck(8);
    const scratch = new Int16Array(8);
    for (let i = 0; i < 25; i++) shuffle(deck, scratch, rng);
    expect([...deck].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('rejects an empty library and mixed deck sizes', () => {
    expect(() => makeReplayShuffle([])).toThrow();
    expect(() =>
      makeReplayShuffle([permFromRecord(rec('RB')), permFromRecord(rec('RBB'))]),
    ).toThrow();
  });
});
