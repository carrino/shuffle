import{t as e}from"./nav-BGVi1r4O.js";import{t}from"./charts-BfDSYqvq.js";import{r as n,t as r}from"./metrics-DnT3CNBb.js";import"./anchors-BhHJ37HY.js";var i={uniformSamples:5e4,trajectories:2e3,lfSamples:5e4,seed:12648430},a=2.7,o={risingSequences:`Rising sequences`,adjacentPairDisplacement:`Adjacent-pair displacement`,spearmanToStart:`Spearman ρ vs start`,maxLinearFunctionalZ:`Max |z| of 5 linear functionals`,sequentialGuesser:`Sequential guesser (correct guesses)`};e(`validate.html`);var s=document.getElementById(`app`),c=document.createElement(`div`);c.className=`card`,c.innerHTML=`
  <button id="run">Re-run validation in this browser</button>
  <span class="muted" id="source"></span>
  <div class="progress" id="prog" style="display:none;margin-top:10px"><div style="width:0%"></div></div>
  <div class="muted" id="progmsg"></div>`,s.appendChild(c);var l=document.createElement(`div`);s.appendChild(l);var u=c.querySelector(`#source`),d=c.querySelector(`#run`),f=c.querySelector(`#prog`),p=f.firstElementChild,m=c.querySelector(`#progmsg`);d.addEventListener(`click`,()=>{d.disabled=!0,f.style.display=`block`;let e=new Worker(new URL(``+new URL(`validate.worker-BtJh6o11.js`,import.meta.url).href,``+import.meta.url),{type:`module`});e.onmessage=t=>{t.data.type===`progress`?(p.style.width=`${(t.data.frac*100).toFixed(0)}%`,m.textContent=t.data.msg):t.data.type===`report`&&(e.terminate(),d.disabled=!1,f.style.display=`none`,m.textContent=``,u.textContent=` — run live in this browser just now`,h(t.data.report))},e.postMessage(i)}),fetch(`results/validation.json`).then(e=>e.ok?e.json():Promise.reject(Error(String(e.status)))).then(e=>{u.textContent=` — CI report generated ${e.generatedAt??`(unknown time)`}`,h(e)}).catch(()=>{u.textContent=` — no CI report found, running live…`,d.click()});function h(e){l.innerHTML=``;let t=document.createElement(`div`);t.className=`card`,t.innerHTML=`<h2 style="margin-top:0">Phase 1 validation ${e.pass?`<span class="pill pass">ALL CHECKS PASS</span>`:`<span class="pill fail">FAILING</span>`}</h2>
  <p>GSR baseline + metric validation against the <em>exact</em> Bayer–Diaconis
  total-variation anchors (computed once with big-rational arithmetic in
  <code>tools/exact_tv.py</code>, baked into <code>src/sim/anchors.ts</code>).
  Uniform samples: ${e.options.uniformSamples.toLocaleString()},
  trajectories: ${e.options.trajectories.toLocaleString()}, seed
  <code>0x${e.options.seed.toString(16)}</code>.
  Rising-sequence floor: no riffle-family shuffle of 100 cards can be uniform
  before ⌈log₂((n+1)/2)⌉ = <strong>${e.log2Floor.n100}</strong> shuffles
  (${e.log2Floor.n52} for 52).</p>
  <h3>The mixedness definition</h3>
  <p><strong>Theory layer</strong> (pure GSR): M(ε) = first m with exact
  TV(m) ≤ ε. For n=100: M_KNEE (ε=0.5) = <strong>${e.milestones.n100.knee}</strong>,
  M_FAIR (ε=0.05) = <strong>${e.milestones.n100.fair}</strong>,
  M_STRICT (ε=0.01) = <strong>${e.milestones.n100.strict}</strong>
  (52 cards: ${e.milestones.n52.knee} / ${e.milestones.n52.fair} /
  ${e.milestones.n52.strict} — M_KNEE is the classic "7 shuffles").
  TV ≤ ε means no single pre-specified event's probability shifts by more
  than ε from uniform; the bound is additive (small-probability bets can
  move a lot in relative terms) and per-event (cumulative edge over a whole
  sequential deal is bounded only by n·ε — hence the sequential-guesser
  metric).</p>
  <p><strong>Empirical layer</strong> (any operator): certifiedMixed(c, α) —
  equivalence testing, never fail-to-reject. The first shuffle k where
  EVERY metric's ${95 .toFixed(0)}% CI of the trajectory mean
  fits inside ref ± c·SD<sub>uniform</sub> and stays inside for all later k
  (c=0.25, α=0.05). If the CI half-width cannot beat c·SD at this T, the
  outcome is "cannot-certify" — explicitly distinct from "not mixed".
  Check (f) below is the calibration invariant tying the layers together.</p>`,l.appendChild(t);for(let t of e.checks)g(t);b(e),v(e),_(e,100),_(e,52)}function g(e){let t=document.createElement(`div`);t.className=`card check ${e.pass?``:`fail`}`,t.innerHTML=`<h3><span class="status">${e.pass?`✓`:`✗`}</span> ${e.name}</h3>
    <ul>${e.details.map(e=>`<li>${S(e)}</li>`).join(``)}</ul>`,l.appendChild(t)}function _(e,i){let a=i===52?e.gsr52:e.gsr100,s=i===52?e.faro52:e.faro100,c=document.createElement(`section`);c.innerHTML=`<h2>Metric curves, n=${i} (GSR vs faro control)</h2>
    <p class="muted">Gray band = uniform mean ± 2 SD of a single permutation;
    dashed line = uniform mean. GSR walks into the band and stays; the faro
    control cycles forever (period ${i===52?8:30}) and never settles.</p>`;let u=document.createElement(`div`);u.className=`chart-grid`,c.appendChild(u),l.appendChild(c);let d=a.K,f=Array.from({length:d},(e,t)=>t+1);for(let e of r){let r=n(i,e);t(u,{title:o[e],subtitle:`${y(a.cert.perMetric[e])} (T=${a.T}) · uniform ${r.mean.toFixed(2)} ± ${r.sd.toFixed(2)}`,x:f,xLabel:`shuffles`,series:[{label:`GSR`,colorVar:`--series-1`,values:x(a.curves[e].mean,d)},{label:`Faro`,colorVar:`--series-2`,values:x(s.curves[e].mean,d)}],band:{lo:r.mean-2*r.sd,hi:r.mean+2*r.sd},refLine:r.mean})}}function v(e){let n=document.createElement(`section`);n.innerHTML=`<h2>Top-card excess overlay (GSR-only diagnostic)</h2>
    <p class="muted">P(original top card back on top) for GSR vs the known
    asymptotic (1 + λ/2)/n with λ = n/2^m — a late-stage check on the GSR
    simulator (the bias outlives rising-sequence saturation). Not a
    certification metric: the mash mechanic cycles the bottom packet to the
    top, so the top card always changes unless someone is palming it.
    Log scale.</p>`;let r=document.createElement(`div`);r.className=`chart-grid`,n.appendChild(r),l.appendChild(n);for(let n of[100,52]){let i=n===52?e.topCard.n52:e.topCard.n100,a=i.theory.length,o=Array.from({length:a},(e,t)=>t+1);t(r,{title:`P(top card at home), n=${n}`,subtitle:`measured GSR (points) vs (1+λ/2)/n (line); dashed = uniform 1/n`,x:o,xLabel:`riffles`,logY:!0,series:[{label:`theory`,colorVar:`--series-1`,values:i.theory},{label:`measured`,colorVar:`--series-2`,values:x(i.measured,a),points:!0,width:.5}],refLine:1/n})}}function y(e){return e.status===`certified`?`certified at ${e.k}`:e.status}function b(e){let n=document.createElement(`section`);n.innerHTML=`<h2>Exact anchor overlay</h2>
    <p class="muted">Lines: exact Bayer–Diaconis TV distance to uniform
    (big-rational arithmetic, not simulation). Points: measured rising-sequence
    bias ÷ ${a} from the simulated trajectories. The points
    landing on the exact curves is the anchor-consistency check (d) — the
    simulation decays at exactly the rate the theory demands. Log scale.</p>`;let r=document.createElement(`div`);r.className=`chart-grid`,n.appendChild(r),l.appendChild(n);for(let n of[100,52]){let i=n===52?e.anchors.tv52:e.anchors.tv100,o=n===52?e.gsr52:e.gsr100,s=Array.from(o.curves.risingSequences.effect),c=Math.min(o.K,i.length),l=Array.from({length:c},(e,t)=>t+1);t(r,{title:`TV to uniform, n=${n}`,subtitle:`exact anchor vs measured rising-sequence bias`,x:l,xLabel:`riffles`,logY:!0,series:[{label:`Exact TV`,colorVar:`--series-1`,values:i.slice(0,c)},{label:`|bias| ÷ ${a}`,colorVar:`--series-2`,values:s.slice(0,c).map(e=>Math.abs(e)/a),points:!0,width:.5}]})}}function x(e,t){return Array.from(e).slice(0,t)}function S(e){return e.replace(/[&<>"']/g,e=>`&#${e.charCodeAt(0)};`)}