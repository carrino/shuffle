// Replay actual recorded shuffles. A flip-method capture string pins down the
// EXACT permutation of that mash, not just its statistics: the R positions
// receive the lifted bottom packet's cards in order, the T positions receive
// the rest in order (the protocol keeps within-packet order — riffle-type
// shuffles never reorder inside a packet). Sampling a random recorded
// permutation each pass is a bootstrap simulation of the collector's real
// hands, no model in between.
//
// Caveat that keeps this honest: k recorded shuffles give at most log2(k)
// bits of *selection* entropy per pass, so a small library can't literally
// randomize a deck even when the statistical battery certifies. Treat the
// replay as a cross-check of the fitted model (and collect more records —
// every one doubles nothing but helps).

import type { PRNG } from './prng';
import type { MashRecord } from '../data/schema';

/**
 * The exact permutation a record observed. perm[i] = source position (in the
 * pre-shuffle deck, 0 = top) of the card that ended at position i.
 */
export function permFromRecord(record: MashRecord): Int16Array {
  const s = record.string;
  const n = s.length;
  const nR = [...s].filter((c) => c === 'R').length;
  const perm = new Int16Array(n);
  let ia = 0;
  let ib = 0;
  for (let i = 0; i < n; i++) {
    if (s[i] === 'R') {
      perm[i] = n - nR + ia; // R block = bottom nR cards, order preserved
      ia++;
    } else {
      perm[i] = ib; // T block = top n-nR cards, order preserved
      ib++;
    }
  }
  return perm;
}

/**
 * ShuffleFn that applies a uniformly-drawn recorded permutation each pass.
 * All permutations must be the same length (one deck size per replay).
 */
export function makeReplayShuffle(perms: readonly Int16Array[]) {
  if (perms.length === 0) throw new Error('replay needs at least one recorded permutation');
  const n = perms[0]!.length;
  for (const p of perms) {
    if (p.length !== n) throw new Error('replay permutations must share one deck size');
  }
  return (deck: Int16Array, scratch: Int16Array, rng: PRNG): void => {
    const p = perms[Math.floor(rng.nextFloat() * perms.length)]!;
    for (let i = 0; i < n; i++) scratch[i] = deck[p[i]!]!;
    deck.set(scratch);
  };
}
