import { describe, it, expect } from 'vitest';
import { makePRNG, makeDeck, resetSorted } from '../src/sim/prng';
import { faro, gsr } from '../src/sim/operators';
import { mash, makeMashShuffle, type MashConfig } from '../src/sim/mash';
import { metricCurves, certK } from '../src/sim/experiment';
import { uniformReference, METRIC_NAMES } from '../src/sim/metrics';

const base: MashConfig = {
  splitMean: 30,
  splitSd: 3,
  mu: 1.3,
  offsetMean: 0,
  offsetSd: 0,
  remnantEnd: 'bottom',
  positionDependence: 0,
};

describe('mash — mechanics', () => {
  it('preserves the multiset of cards under all config corners', () => {
    const configs: MashConfig[] = [
      base,
      { ...base, remnantEnd: 'top' },
      { ...base, offsetMean: 5, offsetSd: 2 },
      { ...base, positionDependence: 1.5, mu: 2 },
      { ...base, splitMean: 50, splitSd: 8 },
    ];
    const deck = makeDeck(100);
    const scratch = new Int16Array(100);
    const rng = makePRNG(41);
    for (const cfg of configs) {
      resetSorted(deck);
      for (let k = 0; k < 25; k++) mash(deck, scratch, rng, cfg);
      expect([...deck].sort((a, b) => a - b)).toEqual([...Array(100).keys()]);
    }
  });

  it('drops the big-packet remnant as one ordered block at the bottom', () => {
    // 30/70 split, low mu: the interleave zone consumes ~30·mu ≈ 36-40 big-
    // packet cards, leaving a ~30+-card ordered remnant ending in card n-1.
    const deck = makeDeck(100);
    const scratch = new Int16Array(100);
    const rng = makePRNG(5);
    const cfg = { ...base, splitMean: 30, splitSd: 0, mu: 1.2 };
    for (let trial = 0; trial < 50; trial++) {
      resetSorted(deck);
      mash(deck, scratch, rng, cfg);
      // find longest strictly-consecutive suffix
      let len = 1;
      while (len < 100 && deck[100 - len - 1]! === deck[100 - len]! - 1) len++;
      expect(deck[99]).toBe(99);
      expect(len).toBeGreaterThanOrEqual(15); // remnant survives
    }
  });

  it("remnantEnd: 'top' puts the big packet's head on top instead", () => {
    const deck = makeDeck(100);
    const scratch = new Int16Array(100);
    const rng = makePRNG(6);
    const cfg = { ...base, splitMean: 30, splitSd: 0, mu: 1.2, remnantEnd: 'top' as const };
    for (let trial = 0; trial < 50; trial++) {
      resetSorted(deck);
      mash(deck, scratch, rng, cfg);
      // big packet is values 30..99; its head stays unconsumed on top
      expect(deck[0]).toBe(30);
      let len = 1;
      while (len < 100 && deck[len]! === deck[len - 1]! + 1) len++;
      expect(len).toBeGreaterThanOrEqual(15);
    }
  });

  it('offset rotates the deck so the top card changes', () => {
    const deck = makeDeck(100);
    const scratch = new Int16Array(100);
    const rng = makePRNG(77);
    const cfg = { ...base, offsetMean: 6, offsetSd: 2, splitMean: 30, splitSd: 0, mu: 1 };
    let topStayed = 0;
    const trials = 200;
    for (let t = 0; t < trials; t++) {
      resetSorted(deck);
      mash(deck, scratch, rng, cfg);
      if (deck[0] === 0) topStayed++;
    }
    // with mean offset 6±2 the old top card essentially never stays on top
    expect(topStayed).toBeLessThan(trials * 0.05);
  });
});

describe('mash — faro limit (mu=1, equal split, zero offset)', () => {
  it('every shuffle equals an out-faro or in-faro exactly', () => {
    const cfg: MashConfig = { ...base, splitMean: 50, splitSd: 0, mu: 1 };
    const rng = makePRNG(13);
    const deck = makeDeck(100);
    const scratch = new Int16Array(100);
    const out = new Int16Array(100);
    const inn = new Int16Array(100);
    const tmp = new Int16Array(100);
    let sawOut = 0;
    let sawIn = 0;
    for (let step = 0; step < 300; step++) {
      out.set(deck);
      faro(out, tmp, false);
      inn.set(deck);
      faro(inn, tmp, true);
      mash(deck, scratch, rng, cfg);
      const isOut = deck.every((v, i) => v === out[i]);
      const isIn = deck.every((v, i) => v === inn[i]);
      expect(isOut || isIn).toBe(true);
      if (isOut) sawOut++;
      if (isIn) sawIn++;
    }
    // both variants occur (the coin flip picks which packet drops first)
    expect(sawOut).toBeGreaterThan(50);
    expect(sawIn).toBeGreaterThan(50);
  });

  it('does not mix: the whole trajectory carries 1 bit per shuffle', () => {
    // A statistic-band test would mislead here: a RANDOM walk over the two
    // faros scrambles permutation statistics surprisingly well (rising
    // sequences enter the uniform band) while the deck remains perfectly
    // structured — after k shuffles it is one of at most 2^k known states,
    // fully determined by k coin flips (vs log2(52!) ≈ 226 bits for a random
    // deck). We prove exactly that: replaying the flip sequence with plain
    // faros reproduces the deck bit-for-bit.
    const cfg: MashConfig = { ...base, splitMean: 26, splitSd: 0, mu: 1 };
    const rng = makePRNG(14);
    const deck = makeDeck(52);
    const scratch = new Int16Array(52);
    const replay = makeDeck(52);
    const out = new Int16Array(52);
    const inn = new Int16Array(52);
    const tmp = new Int16Array(52);
    for (let k = 0; k < 40; k++) {
      mash(deck, scratch, rng, cfg);
      // which of the two perfect interleaves happened this step?
      out.set(replay);
      faro(out, tmp, false);
      inn.set(replay);
      faro(inn, tmp, true);
      if (deck.every((v, i) => v === out[i])) replay.set(out);
      else replay.set(inn);
      expect([...deck]).toEqual([...replay]);
    }
  });
});

describe('mash — GSR-like limit (mu=2, binomial-like split)', () => {
  // With mu=2 (geometric runs, mean 2) and split ≈ Binomial(n,1/2) the mash
  // model is closest to GSR. It is NOT identical: GSR's drops are
  // proportional to remaining packet size (self-balancing), while the mash
  // model alternates packets symmetrically with a fixed mu — so mash retains
  // slightly more order in the early transient (up to ~1.5 single-perm SD
  // around k=4) and converges to the GSR curve from below by k≈10. That
  // residual cleanliness is precisely the "sleeved mash" effect this project
  // studies; the test pins both the transient bound and the late agreement.
  it('metric curves track gsr() within documented tolerance', () => {
    const n = 52;
    const T = 1000;
    const K = 22;
    const g = metricCurves(gsr, { n, K, T, seed: 7, lfSamples: 30_000 });
    const gsrLike = makeMashShuffle({
      splitMean: n / 2,
      splitSd: Math.sqrt(n) / 2,
      mu: 2,
      offsetMean: 0,
      offsetSd: 0,
      remnantEnd: 'bottom',
    });
    const m = metricCurves(gsrLike, { n, K, T, seed: 8, lfSamples: 30_000 });
    for (const metric of METRIC_NAMES) {
      const ref = uniformReference(n, metric);
      for (let k = 3; k <= K; k++) {
        const diff = Math.abs(m.curves[metric].mean[k - 1]! - g.curves[metric].mean[k - 1]!) / ref.sd;
        const tol = k >= 12 ? 0.25 : k >= 7 ? 1.0 : 2.0;
        expect(diff, `${metric} at k=${k}: |Δ|=${diff.toFixed(2)} > ${tol}`).toBeLessThanOrEqual(tol);
      }
      // and it does actually certify — a few shuffles behind GSR at most
      // (mash's fixed-mu symmetric alternation lacks GSR's self-balancing
      // proportional drops)
      const gm = certK(g.cert.perMetric[metric]);
      const mm = certK(m.cert.perMetric[metric]);
      expect(Number.isFinite(mm), `${metric} never certified`).toBe(true);
      expect(mm - gm, `${metric} certified ${mm} vs gsr ${gm}`).toBeLessThanOrEqual(6);
      expect(gm - mm, `${metric} certified ${mm} vs gsr ${gm}`).toBeLessThanOrEqual(3);
    }
  });
});
