# shuffle — how many mash shuffles does a 100-card deck need?

A static TypeScript web app that simulates card shuffling to answer one
question: **for a 100-card (sleeved) deck, how many mash shuffles reach
randomness**, given that sleeved mash shuffles interleave much more cleanly
than the standard GSR riffle model assumes. It is also the capture and
analysis tool for real two-color shuffle observations.

Live site: deployed to GitHub Pages by CI on every push to `main`.

## Why clean interleaving doesn't mix (GSR vs faro)

A **faro** shuffle is a *perfect* interleave: split exactly in half, alternate
cards one-for-one. It looks like the platonic shuffle, and it does nothing:
it is a fixed permutation, so 8 out-faros return a 52-card deck to its exact
starting order. Randomness in riffle-family shuffles comes from **drop
irregularity** — the sloppy, uneven way clumps of cards fall — not from
interleaving per se. The **GSR** (Gilbert–Shannon–Reeds) model captures this:
cut ~ Binomial(n, ½), then cards drop with probability proportional to each
packet's remaining size. Sleeved mash shuffles sit *between* these extremes —
much cleaner than GSR, not as clean as a faro — which is exactly why "7
shuffles is enough" folklore (a GSR result for 52 cards) doesn't transfer, in
either direction, to a 100-card sleeved deck. Hence this project.

## The run-length mash model

`mash(deck, cfg, rng)` (Phase 2) models a sleeved mash directly rather than
via GSR drops:

- split off a small packet of `splitMean ± splitSd` cards (e.g. 30±3 of 100),
  optionally offset from the top by `offsetMean ± offsetSd` (the bridge-style
  "top card always changes" habit);
- build the result as **alternating runs**: on entering a packet, draw a run
  length from a tunable distribution with mean `mu` — `mu=1` is strict
  alternation (faro-like, does not mix), `mu≈2` geometric is GSR-like, `mu>2`
  is clumpy;
- interleave until the **small** packet is exhausted; the big packet's
  remainder drops as one ordered block (a 30/70 mash of 100 cards leaves a
  ~40-card ordered remnant) at a configurable end;
- optional `positionDependence`: a `mu` profile along the deck (people mash
  clumpier at the ends).

Fitting real two-color observations (Phase 4) recovers these parameters per
collector.

### Early findings from the model (before real data)

At the T=500-trajectory statistical criterion on n=100 (GSR baseline ≈ 13):

- **A habitual no-cut 30/70 mash never mixes.** The interleave zone only
  reaches ~2× the split depth, so the bottom ~40 cards are frozen forever.
  The cut-offset habit (or a bigger split) is what rescues it: 30/70 with a
  10±6 cut mixes around ~18–19.
- **With realistic split variance, cleaner interleaving mixes *faster*, not
  slower.** A ±3-card split wobble breaks the perfect-interleave degeneracy,
  while clumpy runs (mu ≈ 3) preserve ordered blocks — rising-sequence bias
  is monotone *increasing* in mu at every split in the sweep grid. The
  non-mixing faro pathology needs an exactly equal, zero-variance split.
- **An equal-ish sleeved mash (50±3, mu ≈ 1.3) mixes in ~13 shuffles**,
  on par with GSR — the remnant block, not interleave cleanliness, is the
  main enemy for lopsided splits.

These are model results; the /data page's fitted per-collector configs are
the ground truth to re-run against.

## Randomness metrics (and their uniform references, n=100)

| Metric | Uniform reference | Notes |
|---|---|---|
| Rising sequences | mean (n+1)/2 = 50.5, var (n+1)/12 ≈ 8.42 | *The* Bayer–Diaconis statistic; after k riffles ≤ 2^k (hard theorem) |
| Adjacent-pair displacement | mean (n+1)/3 ≈ 33.67 (SD MC-calibrated ≈ 2.11) | mean over v of \|pos(v+1) − pos(v)\| |
| Spearman ρ vs start | mean 0, SD 1/√(n−1) ≈ 0.1005 | rank correlation with the starting order |
| Random linear functionals | max\|z\| of 5, mean ≈ 1.57, SD ≈ 0.556 | 5 fixed seeded weight vectors · position-of-value; z vs 10⁵-permutation MC reference |

Adjacency *retention* is deliberately not a headline metric: a clean
interleave separates all neighbors in one pass and would look "random" while
being perfectly structured.

**"Mixed at k"** per metric = the trajectory-mean z-distance from uniform
enters \|z\| &lt; 2 and stays in band; `shufflesToMix` is the **worst**
metric's k, always reported alongside the per-metric values, never as a lone
scalar. Note the z-of-mean scales with √T: more trajectories detect smaller
residual bias and push mixed-at later. The validation gate turns this into a
feature (see below).

## The log2 floor

k riffle-family shuffles from sorted produce at most 2^k rising sequences,
while a uniform permutation has ≈ (n+1)/2 of them. So **no riffle-family
shuffle of 100 cards can look random before ⌈log₂((n+1)/2)⌉ = 6 shuffles**
(5 for 52 cards). Every sweep plot shows this floor.

## The baked exact anchor

The Bayer–Diaconis exact total-variation distance after m GSR riffles,

    TV(m) = ½ Σ_r A(n,r) · | 2^(−mn) · C(2^m + n − r, n) − 1/n! |

(A(n,r) = Eulerian numbers counting permutations with r rising sequences),
needs exact big-rational arithmetic over ~10^150-sized integers, so it is
**not** implemented in TS. `tools/exact_tv.py` (Python ints + `Fraction`)
computes TV(m) for n=52 (m=1..12) and n=100 (m=1..16); its output is pasted
into `src/sim/anchors.ts`. A test cross-checks the 52-card row against the
published Bayer–Diaconis table (1.000, 1.000, 1.000, 1.000, 0.924, 0.614,
0.334, 0.167 for m=1..8), so the generated table itself is validated against
literature. To regenerate: `python3 tools/exact_tv.py` and paste.

## The phase gate

**Phase 1 is a validation gate.** Nothing in Phase 2+ was built until these
checks passed in CI (`npm test` runs them; `npm run validate:report` writes
`results/validation.json`, rendered on the `/validate` page):

- **(a) Uniform references** — 10⁵ random permutations reproduce each
  metric's documented mean/SD within MC error.
- **(b) Single-riffle invariant** — one GSR from sorted ⇒ rising sequences
  ≤ 2; after k riffles ≤ 2^k. Any violation is a bug, full stop.
- **(c) Faro control** — out-faro on 52 returns to start in exactly 8
  shuffles; repeated faro cycles forever and never settles in the uniform
  band.
- **(d) GSR convergence vs anchors** — generic metrics settle at ~7–8
  shuffles (n=52) / ~8–10 (n=100); the rising-sequence statistic's residual
  bias tracks the exact anchor as bias ≈ 2.7 × TV(m), and its detection
  boundary at T trajectories lands exactly where the anchors predict.
- **(e) Rising-sequence floor** — reported, and rising sequences never
  report mixed below it.

CI fails if any check fails. The `/validate` page renders the same report
with metric curves for GSR and faro plus the exact-TV overlay.

## Data schema and the git-append workflow

Real observations are two-color ("R"/"B") strings read off a fanned deck
after one mash. One JSON line per observation in `data/mashes.jsonl`
(append-only):

```json
{"ts":"2026-08-04T12:00:00Z","collector":"john","technique":"mash","deck":"sleeved-100","intendedSplit":30,"n":100,"string":"RRBBRB…"}
```

`validate()` (in `src/data/schema.ts`) requires `string.length === n` and
characters ⊆ {R, B}. The `/capture` page is a phone-friendly tapper (big R/B
buttons, undo, paste mode) that emits a validated JSON line to copy or
download; appending it to `data/mashes.jsonl` happens via git commit, so
writes stay serialized through review until a real endpoint exists.

## The future GCP swap point

All data I/O goes through `src/data/store.ts`, an async interface:
**read** = fetch + parse `data/mashes.jsonl` (skipping and reporting invalid
lines), **write** = produce the JSON line for copy/download. When this moves
to GCP static hosting with a Cloud Function write endpoint, only `store.ts`
changes — read stays a fetch, write becomes an HTTP POST. Nothing else in
the app knows where data lives.

## Development

```bash
npm ci
npm run dev        # dev server
npm test           # tests incl. the Phase 1 validation gate (fast profile)
npm run test:full  # same, full-size MC profile (FULL_VALIDATION=1)
npm run validate:report  # writes results/validation.json
npm run ci         # exactly what CI runs
```

- TypeScript strict; simulation code is framework-free and Worker-importable.
- Decks are `Int16Array` (values 0..n−1, index 0 = top); hot loops
  preallocate buffers — no per-shuffle allocation in the sweep path.
- Seedable PRNG (xoshiro128**); `Math.random` is banned by an eslint rule.
- Multi-thousand-trajectory runs (sweep, validation) happen in Web Workers.
- Charts: uPlot (canvas). CI: typecheck + lint + tests + validation report +
  build, deploys to Pages on `main`.
