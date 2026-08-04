// Shuffle operators. All operate in place on an Int16Array deck
// (values 0..n-1, index 0 = top of deck), using a caller-provided scratch
// buffer of the same length so hot loops allocate nothing.

import type { PRNG } from './prng';

/**
 * Exact Gilbert-Shannon-Reeds riffle.
 *
 * Cut ~ Binomial(n, 1/2); then cards drop one at a time with probability
 * proportional to the remaining size of each packet. Equivalently: the result
 * is a uniformly random interleaving of the two packets. We build the result
 * top-down choosing the next card from packet A with probability a/(a+b) —
 * the same distribution as the bottom-up drop description.
 */
export function gsr(deck: Int16Array, scratch: Int16Array, rng: PRNG): void {
  const n = deck.length;
  const cut = rng.binomialHalf(n); // top packet = deck[0..cut-1]
  let a = cut; // remaining in top packet
  let b = n - cut; // remaining in bottom packet
  let ia = 0;
  let ib = cut;
  for (let k = 0; k < n; k++) {
    // P(next card from A) = a / (a + b)
    if (a > 0 && (b === 0 || rng.nextInt(a + b) < a)) {
      scratch[k] = deck[ia++]!;
      a--;
    } else {
      scratch[k] = deck[ib++]!;
      b--;
    }
  }
  deck.set(scratch);
}

/**
 * Deterministic perfect (faro) interleave — the "does not mix" control.
 * Split exactly in half (top gets the extra card if n is odd) and alternate
 * perfectly. outShuffle (default) keeps the top card on top; inShuffle
 * buries it second.
 */
export function faro(deck: Int16Array, scratch: Int16Array, inShuffle = false): void {
  const n = deck.length;
  const half = Math.ceil(n / 2);
  let k = 0;
  if (!inShuffle) {
    for (let i = 0; i < half; i++) {
      scratch[k++] = deck[i]!;
      if (half + i < n) scratch[k++] = deck[half + i]!;
    }
  } else {
    for (let i = 0; i < n - half; i++) {
      scratch[k++] = deck[half + i]!;
      scratch[k++] = deck[i]!;
    }
    if (half > n - half) scratch[k++] = deck[half - 1]!;
  }
  deck.set(scratch);
}
