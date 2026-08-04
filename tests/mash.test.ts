import { describe, it, expect } from 'vitest';
import { makePRNG, makeDeck, resetSorted } from '../src/sim/prng';
import { faro, gsr } from '../src/sim/operators';
import { mash, type MashConfig } from '../src/sim/mash';
import { makeMashShuffle } from '../src/sim/mash';
import { metricCurves, certK } from '../src/sim/experiment';
import { uniformReference, METRIC_NAMES } from '../src/sim/metrics';

const base: MashConfig = {
  splitMean: 35,
  splitSd: 3,
  mu: 1,
  overhangMean: 3,
  overhangSd: 2,
  remnantEnd: 'bottom',
  positionDependence: 0,
};

describe('mash — mechanics (bottom packet lifts to the top)', () => {
  it('preserves the multiset of cards under all config corners', () => {
    const configs: MashConfig[] = [
      base,
      { ...base, remnantEnd: 'top' },
      { ...base, overhangMean: 8, overhangSd: 4 },
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

  it('the lifted bottom packet leads: old position n−s becomes the new top', () => {
    // "the cards in spot 65 to 67 become 1-3" — with s=35 and a positive
    // overhang, old position 65 is the lifted packet's head and ends up on
    // top. (With overhang variance the seating can cross flush and go
    // negative, so this pins the zero-variance case.)
    const deck = makeDeck(100);
    const scratch = new Int16Array(100);
    const rng = makePRNG(7);
    const cfg = { ...base, splitMean: 35, splitSd: 0, overhangMean: 3, overhangSd: 0 };
    for (let trial = 0; trial < 100; trial++) {
      resetSorted(deck);
      mash(deck, scratch, rng, cfg);
      expect(deck[0]).toBe(65);
    }
  });

  it('a NEGATIVE overhang leads with big-packet cards, then the lifted packet', () => {
    // overhang -3, split 35, mu=1 from sorted: top is 0,1,2 (big packet,
    // seated above), then interleaving starts with the lifted packet:
    // 65, 3, 66, 4, ...
    const deck = makeDeck(100);
    const scratch = new Int16Array(100);
    const rng = makePRNG(88);
    const cfg = { ...base, splitMean: 35, splitSd: 0, mu: 1, overhangMean: -3, overhangSd: 0 };
    resetSorted(deck);
    mash(deck, scratch, rng, cfg);
    expect([...deck.slice(0, 8)]).toEqual([0, 1, 2, 65, 3, 66, 4, 67]);
  });

  it('an empirical run distribution drives the interleave when present', () => {
    // all runs length 2 (dist puts all mass on L=2), overhang 1, mu ignored:
    // 65, 0,1, 66,67, 2,3, 68,69, ...
    const deck = makeDeck(100);
    const scratch = new Int16Array(100);
    const rng = makePRNG(89);
    const cfg = {
      ...base,
      splitMean: 35,
      splitSd: 0,
      mu: 9, // ignored
      overhangMean: 1,
      overhangSd: 0,
      runDist: [0, 1] as readonly number[],
    };
    resetSorted(deck);
    mash(deck, scratch, rng, cfg);
    expect([...deck.slice(0, 9)]).toEqual([65, 0, 1, 66, 67, 2, 3, 68, 69]);
  });

  it('the overhang block drops intact before interleaving starts', () => {
    // overhang 4±0, split 35±0, mu=1 from sorted: new top must be exactly
    // 65,66,67,68 (the overhang), then interleaving starts with the big
    // packet: 0, 69, 1, 70, …
    const deck = makeDeck(100);
    const scratch = new Int16Array(100);
    const rng = makePRNG(8);
    const cfg = { ...base, splitMean: 35, splitSd: 0, mu: 1, overhangMean: 4, overhangSd: 0 };
    resetSorted(deck);
    mash(deck, scratch, rng, cfg);
    expect([...deck.slice(0, 8)]).toEqual([65, 66, 67, 68, 0, 69, 1, 70]);
  });

  it('cards cycle — no cold spots: every position gets replaced over a few shuffles', () => {
    // Track how long each POSITION keeps a card from its original
    // neighbourhood: after enough shuffles every original card must have
    // visited the top third at least once (the frozen-bottom failure mode
    // of a wrong mechanic would leave the deep cards stuck forever).
    const n = 100;
    const deck = makeDeck(n);
    const scratch = new Int16Array(n);
    const rng = makePRNG(9);
    const visitedTop = new Uint8Array(n);
    for (let k = 0; k < 40; k++) {
      mash(deck, scratch, rng, base);
      for (let i = 0; i < n / 3; i++) visitedTop[deck[i]!] = 1;
    }
    expect([...visitedTop].every((v) => v === 1)).toBe(true);
  });

  it('drops the big-packet remnant as one ordered block at the bottom', () => {
    // 30-card lift, low mu: the zone consumes ~30·mu big-packet cards from
    // the old top, leaving an ordered remnant ending in old card 69 (the
    // big packet is values 0..69) at the bottom.
    const deck = makeDeck(100);
    const scratch = new Int16Array(100);
    const rng = makePRNG(5);
    const cfg = { ...base, splitMean: 30, splitSd: 0, mu: 1.2, overhangMean: 1, overhangSd: 0 };
    for (let trial = 0; trial < 50; trial++) {
      resetSorted(deck);
      mash(deck, scratch, rng, cfg);
      let len = 1;
      while (len < 100 && deck[100 - len - 1]! === deck[100 - len]! - 1) len++;
      expect(deck[99]).toBe(69);
      expect(len).toBeGreaterThanOrEqual(15); // remnant survives
    }
  });

  it("remnantEnd: 'top' leaves the big packet's head on top instead", () => {
    const deck = makeDeck(100);
    const scratch = new Int16Array(100);
    const rng = makePRNG(6);
    const cfg = { ...base, splitMean: 30, splitSd: 0, mu: 1.2, overhangMean: 1, overhangSd: 0, remnantEnd: 'top' as const };
    for (let trial = 0; trial < 50; trial++) {
      resetSorted(deck);
      mash(deck, scratch, rng, cfg);
      // big packet = values 0..69; its unconsumed head stays on top, and the
      // lifted packet's tail (99) is the new bottom card
      expect(deck[0]).toBe(0);
      expect(deck[99]).toBe(99);
      let len = 1;
      while (len < 100 && deck[len]! === deck[len - 1]! + 1) len++;
      expect(len).toBeGreaterThanOrEqual(15);
    }
  });
});

describe('mash — faro limit (mu=1, equal split, flush overhang)', () => {
  it('is exactly the deterministic in-faro, shuffle after shuffle', () => {
    // s = n/2, overhang 1, mu 1: result = A0 B0 A1 B1 … with A = bottom
    // half — the in-faro. Zero entropy per shuffle: cycles, never mixes.
    const cfg: MashConfig = { ...base, splitMean: 50, splitSd: 0, mu: 1, overhangMean: 1, overhangSd: 0 };
    const rng = makePRNG(13);
    const deck = makeDeck(100);
    const scratch = new Int16Array(100);
    const ref = makeDeck(100);
    const tmp = new Int16Array(100);
    for (let step = 0; step < 60; step++) {
      mash(deck, scratch, rng, cfg);
      faro(ref, tmp, true);
      expect([...deck]).toEqual([...ref]);
    }
  });

  it('with zero split/overhang variance the shuffle is a fixed permutation (never certifies)', () => {
    const cfg: MashConfig = { ...base, splitMean: 35, splitSd: 0, mu: 1, overhangMean: 3, overhangSd: 0 };
    const r = metricCurves(makeMashShuffle(cfg), { n: 100, K: 30, T: 200, seed: 2, lfSamples: 10_000 });
    expect(r.cert.overall.status).not.toBe('certified');
  });
});

describe('mash — GSR-like limit (mu=2, binomial-like split)', () => {
  // With mu=2 (geometric runs, mean 2) and split ≈ Binomial(n,1/2) the mash
  // model is closest to GSR. It is NOT identical: the bottom-lift mechanic
  // rotates the deck systematically and its runs alternate symmetrically at
  // a fixed mu, while GSR cuts near the top-half and drops proportionally
  // to remaining packet size. The transient differs by up to ~2 single-perm
  // SD around k=3-5, the mid-curve by ≤ ~1.2, and the tails agree; the test
  // pins those documented tolerances plus certification agreement.
  it('metric curves track gsr() within documented tolerance', () => {
    const n = 52;
    const T = 1000;
    const K = 22;
    const g = metricCurves(gsr, { n, K, T, seed: 7, lfSamples: 30_000 });
    const gsrLike = makeMashShuffle({
      splitMean: n / 2,
      splitSd: Math.sqrt(n) / 2,
      mu: 2,
      overhangMean: 2,
      overhangSd: 1,
      remnantEnd: 'bottom',
    });
    const m = metricCurves(gsrLike, { n, K, T, seed: 8, lfSamples: 30_000 });
    for (const metric of METRIC_NAMES) {
      const ref = uniformReference(n, metric);
      for (let k = 3; k <= K; k++) {
        const diff = Math.abs(m.curves[metric].mean[k - 1]! - g.curves[metric].mean[k - 1]!) / ref.sd;
        const tol = k >= 12 ? 0.3 : k >= 7 ? 1.2 : 2.2;
        expect(diff, `${metric} at k=${k}: |Δ|=${diff.toFixed(2)} > ${tol}`).toBeLessThanOrEqual(tol);
      }
      const gm = certK(g.cert.perMetric[metric]);
      const mm = certK(m.cert.perMetric[metric]);
      expect(Number.isFinite(mm), `${metric} never certified`).toBe(true);
      expect(mm - gm, `${metric} certified ${mm} vs gsr ${gm}`).toBeLessThanOrEqual(6);
      expect(gm - mm, `${metric} certified ${mm} vs gsr ${gm}`).toBeLessThanOrEqual(3);
    }
  });
});
