// Seedable PRNG (xoshiro128**) + samplers used by all simulation code.
//
// Math.random must never appear in simulation code (it is not seedable);
// an eslint rule enforces this across src/.

export interface PRNG {
  /** Next uniform uint32. */
  nextUint32(): number;
  /** Next float in [0, 1) with 32 bits of precision. */
  nextFloat(): number;
  /** Uniform integer in [0, bound), bound >= 1 (debiased). */
  nextInt(bound: number): number;
  /** Binomial(n, 1/2) sample via popcount of random bits. */
  binomialHalf(n: number): number;
  /** Standard normal via Box-Muller (used for split/offset jitter). */
  nextGaussian(): number;
}

/** splitmix32 — used only to expand a single 32-bit seed into xoshiro state. */
function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

class Xoshiro128StarStar implements PRNG {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  private spare: number | null = null; // cached second Box-Muller deviate

  constructor(seed: number) {
    const sm = splitmix32(seed);
    this.s0 = sm();
    this.s1 = sm();
    this.s2 = sm();
    this.s3 = sm();
    // All-zero state is invalid; splitmix32 output makes this effectively
    // impossible, but guard anyway.
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s3 = 1;
  }

  nextUint32(): number {
    const result = (Math.imul(rotl(Math.imul(this.s1, 5), 7), 9)) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  nextInt(bound: number): number {
    // Debiased modulo (rejection sampling on the top of the range).
    const limit = 4294967296 - (4294967296 % bound);
    let x = this.nextUint32();
    while (x >= limit) x = this.nextUint32();
    return x % bound;
  }

  binomialHalf(n: number): number {
    // Sum of n fair bits: popcount full 32-bit words, mask the last one.
    let count = 0;
    let remaining = n;
    while (remaining >= 32) {
      count += popcount32(this.nextUint32());
      remaining -= 32;
    }
    if (remaining > 0) {
      count += popcount32(this.nextUint32() >>> (32 - remaining));
    }
    return count;
  }

  nextGaussian(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    let u = 0;
    while (u === 0) u = this.nextFloat(); // avoid log(0)
    const v = this.nextFloat();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

export function makePRNG(seed: number): PRNG {
  return new Xoshiro128StarStar(seed);
}

/** In-place Fisher-Yates shuffle using the seedable PRNG. */
export function fisherYates(deck: Int16Array, rng: PRNG): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
}

/** Fill deck with the sorted identity order 0..n-1 (index 0 = top). */
export function resetSorted(deck: Int16Array): void {
  for (let i = 0; i < deck.length; i++) deck[i] = i;
}

export function makeDeck(n: number): Int16Array {
  const d = new Int16Array(n);
  resetSorted(d);
  return d;
}
