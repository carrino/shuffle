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
via GSR drops. The mechanic matters:

- **the small packet is lifted from the BOTTOM** (`splitMean ± splitSd`
  cards, e.g. 35±3 of 100) and mashed into the rest from the top — in a
  100-card deck the cards at old positions ~65–67 become the new top.
  Because the bottom block moves to the top every shuffle, cards **cycle**
  through the deck: there are no cold spots by design;
- the lifted packet's first few cards — the **overhang**
  (`overhangMean ± overhangSd`, signed: negative means the lifted packet is
  seated below flush and big-packet cards lead) — drop as one block above
  the mesh before interleaving starts;
- below the overhang the result is built as **alternating runs**: on
  entering a packet, draw a run length from a tunable distribution with mean
  `mu` — `mu=1` is perfect interleaving, `mu>1` is clumpy;
- interleave until the **small** packet is exhausted; the big packet's
  remainder drops as one ordered block (a 30/70 mash of 100 cards leaves a
  ~40-card ordered remnant) at a configurable end;
- optional `positionDependence`: a `mu` profile along the deck (people mash
  clumpier at the ends).

**Pass 1** — before any real clump data — asks the baseline question: how
many shuffles assuming *perfect interleaving* (`mu=1`), where the only
randomness is the bottom-cut size and the overhang? Fitted real-world clump
rates then adjust the answer. All three fitted parameters are directly
observable in the two-color capture data: the split is the R count, the
signed overhang is the leading run (R = +, B = −), and the interleave
randomness is the interior run-length histogram — which `mash()` can sample
from directly (`MashConfig.runDist`), so simulation uses the real clump
shape rather than just its geometric-mean approximation.

Fitting real two-color observations (Phase 4) recovers these parameters per
collector.

### Early findings from the model (before real data)

Under `certifiedMixed(c=0.25, α=0.05)` at T=1000, n=100 (GSR certifies at
~11–12, consistent with M_FAIR = 12):

- **The pass-1 answer: a typical 35/65 mash with perfect interleaving and
  natural hand-wobble (split ±3, overhang 3±2) certifies in ~13 shuffles** —
  only a shuffle or two behind pure GSR, despite zero drop randomness.
  Equal-ish splits (50±3) get to ~10; a 30-split is also ~13.
- **The wobble is the randomness.** Zero out both the split variance and the
  overhang variance and the shuffle is a fixed permutation — it cycles
  forever and never mixes (mu=1 + equal split + flush overhang IS the
  in-faro, reproduced exactly by a limit test). Split variance alone: ~14;
  overhang variance alone: ~18; both: ~13.
- **Perfect interleaving is not the enemy — clumps are.** At the same
  wobble, mu=1.3 certifies ~12, mu=2 ~17, mu=3 ~23. Rising-sequence bias is
  monotone increasing in mu from 1.3 up at every grid split (near mu=1 the
  wobble dominates and mild clumps can even help slightly).

These are model results assuming the run-length interleave model; the /data
page's fitted per-collector configs (real split, overhang, and clump rates)
are the ground truth to re-run against.

## Randomness metrics (and their uniform references, n=100)

| Metric | Uniform reference | Notes |
|---|---|---|
| Rising sequences | mean (n+1)/2 = 50.5, var (n+1)/12 ≈ 8.42 | *The* Bayer–Diaconis statistic; after k riffles ≤ 2^k (hard theorem) |
| Adjacent-pair displacement | mean (n+1)/3 ≈ 33.67 (SD MC-calibrated ≈ 2.11) | mean over v of \|pos(v+1) − pos(v)\| |
| Spearman ρ vs start | mean 0, SD 1/√(n−1) ≈ 0.1005 | rank correlation with the starting order |
| Random linear functionals | max\|z\| of 5, mean ≈ 1.57, SD ≈ 0.556 | 5 fixed seeded weight vectors · position-of-value; z vs 10⁵-permutation MC reference |
| Sequential guesser | mean H_n ≈ 5.19, SD √Σ(1/k)(1−1/k) ≈ 1.88 (exact) | expected correct guesses, full memory, rising-sequence-tracking guesser; under uniform ANY strategy scores H_n in expectation (per-step P = 1/k independent of history) — the "exploitable during play" metric |

Adjacency *retention* is deliberately not a headline metric: a clean
interleave separates all neighbors in one pass and would look "random" while
being perfectly structured. **P(top card at home)** is likewise NOT a
certification metric — the mash mechanic cycles the bottom packet to the
top, so the top card always changes unless someone is palming it — but it
remains a GSR-only diagnostic on /validate: the GSR excess ≈ λ/2 (relative,
λ = n/2^m) visibly outlives rising-sequence saturation and pins the
simulator to the known (1+λ/2)/n law.

## What "mixed" means (two layers + a calibration invariant)

**(1) Theory layer** (pure GSR only): `M(ε)` = first m with the *exact*
Bayer–Diaconis TV(m) ≤ ε, read from the baked anchors:

|  | ε | n=52 | n=100 |
|---|---|---|---|
| `M_KNEE` | 0.5 | 7 (the classic "seven shuffles") | 8 |
| `M_FAIR` | 0.05 (default target) | 10 | 12 |
| `M_STRICT` | 0.01 | 13 | 14 |

Operationally, TV ≤ ε means **no single pre-specified event's probability
shifts by more than ε from uniform**. Two caveats: the bound is *additive*
(a small-probability bet can still move a lot in relative terms), and it is
*per-event* — the cumulative edge across a whole sequential deal is bounded
only by n·ε, which is exactly why the sequential-guesser metric exists.

**(2) Empirical layer** (any operator): `certifiedMixed(c, α)` — equivalence
testing (TOST-style), never fail-to-reject. The first shuffle k such that
for **every** certification metric the (1−α) confidence interval of the
trajectory mean lies entirely inside `[ref − c·SD_uniform, ref + c·SD_uniform]`
and remains inside for all later simulated k. Defaults c = 0.25, α = 0.05.
Rationale: fail-to-reject certifies *sooner* with *less* data, which is
backwards; with equivalence bands more data certifies more honestly, and as
T→∞ the criterion converges to \|bias\| &lt; c·SD without ever weakening.
If the CI half-width cannot beat c·SD at the chosen T, the outcome is
**"cannot certify at this T"** — explicitly distinct from "not mixed"
(T of a few hundred minimum; the app uses T ≥ 800 everywhere). Per-metric
certification shuffle counts are always reported with the **binding (worst)
metric named** — never a lone scalar.

**(3) Calibration invariant** (CI-gated test): `certifiedMixed` run on pure
GSR must land within ±1 shuffle of `M_FAIR` for both n=52 and n=100. If it
certifies earlier, the metric battery is blind to late-stage structure —
the build fails rather than the definition being weakened. If later, c or T
is miscalibrated — c gets adjusted, never the metrics. (Currently green
with the defaults: GSR certifies at 10/52 and 11/100 at T=2000.)

All sweep outputs and the explore view report `shufflesToMix` as
`certifiedMixed` under this definition, alongside M_KNEE/M_FAIR reference
lines and the log₂ rising-sequence floor.

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

- **(a) Uniform references** — 10⁵ random permutations reproduce every
  battery metric's documented mean/SD within MC error (including the exact
  H_n mean/SD of the sequential guesser).
- **(b) Single-riffle invariant** — one GSR from sorted ⇒ rising sequences
  ≤ 2; after k riffles ≤ 2^k. Any violation is a bug, full stop.
- **(c) Faro control** — out-faro on 52 returns to start in exactly 8
  shuffles; repeated faro cycles forever and never certifies.
- **(d) GSR convergence vs anchors** — the rising-sequence statistic's
  residual bias tracks the exact anchor as bias ≈ 2.7 × TV(m) and its
  certification boundary lands where the anchors predict; the GSR-only
  topCardHome diagnostic follows the (1 + λ/2)/n excess law within MC
  error; the other metrics certify in sane windows.
- **(e) Rising-sequence floor** — rising sequences never certify below
  ⌈log₂((n+1)/2)⌉ (weak metrics can — which is why the binding metric is
  always named).
- **(f) Calibration invariant** — `certifiedMixed(GSR)` = M_FAIR ± 1 for
  both deck sizes (see the mixedness definition above).

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
