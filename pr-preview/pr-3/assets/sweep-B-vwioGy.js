import{t as e}from"./nav-BGVi1r4O.js";import{t}from"./charts-BfDSYqvq.js";import{r as n,t as r}from"./metrics-DnT3CNBb.js";var i={n:100,T:800,K:30,seed:24299,lfSamples:5e4};function a(e){let t=[[`splitMean`,`splitSd`,`mu`,`overhangMean`,`overhangSd`,...r.map(e=>`certifiedAt_${e}`),`certifiedMixed_worst`,`bindingMetric`].join(`,`)];for(let n of e.rows)t.push([n.config.splitMean,n.config.splitSd,n.config.mu,n.config.overhangMean,n.config.overhangSd,...r.map(e=>o(n.cert.perMetric[e])),o(n.cert.overall),n.cert.bindingMetric??``].join(`,`));return t.join(`
`)+`
`}function o(e){return e.status===`certified`?String(e.k):e.status}e(`sweep.html`);var s=document.getElementById(`app`);s.innerHTML=`
  <div class="card">
    <p style="margin-top:0">Grid: bottom-cut {30%, 40%, 50% of the deck ±3,
    varied 40%±10%} × mu {1.0 (perfect interleaving), 1.3, 2.0, 3.0} ×
    overhang {flush 1±0, small 3±2, varied 6±4} — 48 configs, remnant at
    bottom. Each config's per-metric certification is measured from
    trajectory curves against the uniform references, alongside a GSR
    baseline at the same settings. Runs in a Web Worker.</p>
    <label>Deck size
      <select id="deckSize" style="width:12em">
        <option value="40">40 (draft)</option>
        <option value="60">60 (standard)</option>
        <option value="100" selected>100 (commander)</option>
      </select>
    </label>
    <label>Trajectories per config
      <input id="traj" type="number" value="${i.T}" min="100" max="5000" step="100" style="width:7em">
    </label>
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
      <button id="run">Run sweep</button>
      <button id="csv" class="secondary" disabled>Export CSV</button>
      <span class="muted" id="status"></span>
    </div>
    <div class="progress" id="prog" style="display:none;margin-top:10px"><div style="width:0%"></div></div>
  </div>
  <div id="results"></div>
  <div id="detail"></div>`;var c=document.getElementById(`run`),l=document.getElementById(`csv`),u=document.getElementById(`status`),d=document.getElementById(`prog`),f=d.firstElementChild,p=document.getElementById(`results`),m=document.getElementById(`detail`),h=null,g=`shufflesToMix`,_=1,v=-1,y=[];c.addEventListener(`click`,()=>{c.disabled=!0,l.disabled=!0,d.style.display=`block`,p.innerHTML=``,m.innerHTML=``;let e=Number(document.getElementById(`traj`).value)||i.T,t=Number(document.getElementById(`deckSize`).value),n=t===40?40:t===60?60:100,r=new Worker(new URL(``+new URL(`sweep.worker-DT-F_MyN.js`,import.meta.url).href,``+import.meta.url),{type:`module`});r.onmessage=e=>{let t=e.data;t.type===`progress`?(f.style.width=`${(t.done/t.total*100).toFixed(0)}%`,u.textContent=`${t.done}/${t.total} — ${t.label}`):t.type===`result`&&(r.terminate(),h=t.result,c.disabled=!1,l.disabled=!1,d.style.display=`none`,u.textContent=`done — ${h.rows.length} configs, T=${h.options.T}`,C())},r.postMessage({T:e,n})}),l.addEventListener(`click`,()=>{if(!h)return;let e=new Blob([a(h)],{type:`text/csv`}),t=document.createElement(`a`);t.href=URL.createObjectURL(e),t.download=`sweep-n${h.options.n}-T${h.options.T}.csv`,t.click(),URL.revokeObjectURL(t.href)});var b=[{key:`splitLabel`,label:`split`,value:e=>e.splitLabel},{key:`mu`,label:`mu`,value:e=>e.config.mu},{key:`overhangLabel`,label:`overhang`,value:e=>e.overhangLabel},...r.map(e=>({key:`m_${e}`,label:x(e),value:t=>S(t.cert.perMetric[e])})),{key:`shufflesToMix`,label:`certified`,value:e=>S(e.cert.overall)},{key:`binding`,label:`binding`,value:e=>e.cert.bindingMetric?x(e.cert.bindingMetric):``}];function x(e){return{risingSequences:`rising`,adjacentPairDisplacement:`adjΔ`,spearmanToStart:`spearman`,maxLinearFunctionalZ:`lin.func`,sequentialGuesser:`guesser`}[e]}function S(e){return e.status===`certified`?e.k:e.status===`not-certified`?`never`:`cannot certify`}function C(){if(!h)return;let e=e=>typeof e==`number`?e:e===`never`?1e9:1e9+1,t=[...h.rows].sort((t,n)=>{let r=b.find(e=>e.key===g),i=r.value(t),a=r.value(n);return(typeof i==`number`||typeof a==`number`?e(i)-e(a):String(i).localeCompare(String(a)))*_||t.index-n.index});p.innerHTML=`
    <div class="card">
    <p style="margin-top:0">GSR baseline (n=${h.options.n}, T=${h.options.T}):
    per-metric certified at ${r.map(e=>`${x(e)} <strong>${T(S(h.baseline.cert.perMetric[e]))}</strong>`).join(`, `)}
    — overall <strong>${T(S(h.baseline.cert.overall))}</strong>
    (binding ${h.baseline.cert.bindingMetric??`—`}).
    Log₂ floor: <strong>${h.log2Floor}</strong>.
    "certified at k" = every later k keeps the 95% CI of the trajectory
    mean inside ref ± 0.25·SD<sub>uniform</sub> (TOST equivalence — see
    /validate for the full definition); <em>never</em> = not within
    K=${h.options.K}. Click a row for curves.</p>
    <div style="overflow-x:auto"><table class="data"><thead><tr>
      ${b.map(e=>`<th data-key="${e.key}">${e.label}${e.key===g?_>0?` ▲`:` ▼`:``}</th>`).join(``)}
    </tr></thead><tbody>
      ${t.map(e=>`<tr data-index="${e.index}" style="cursor:pointer${e.index===v?`;font-weight:700`:``}">
        ${b.map(t=>`<td>${T(t.value(e))}</td>`).join(``)}</tr>`).join(``)}
    </tbody></table></div></div>`,p.querySelectorAll(`th`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.key;g===t?_=-_:(g=t,_=1),C()})}),p.querySelectorAll(`tbody tr`).forEach(e=>{e.addEventListener(`click`,()=>{v=Number(e.dataset.index),C(),w()})})}function w(){if(!h)return;let e=h.rows.find(e=>e.index===v);if(!e)return;for(let e of y)e();y.length=0,m.innerHTML=`<h2>split ${e.splitLabel} · mu ${e.config.mu} · overhang ${e.overhangLabel}
    <span class="muted">certified ${T(S(e.cert.overall))}, binding ${e.cert.bindingMetric??`—`}
    (GSR: ${T(S(h.baseline.cert.overall))}; floor ${h.log2Floor})</span></h2>`;let i=document.createElement(`div`);i.className=`chart-grid`,m.appendChild(i);let a=h.options.K,o=Array.from({length:a},(e,t)=>t+1);for(let a of r){let r=n(h.options.n,a);y.push(t(i,{title:`${x(a)} — ${T(S(e.cert.perMetric[a]))}`,subtitle:`uniform ${r.mean.toFixed(2)} ± ${r.sd.toFixed(2)}; log₂ floor at k=${h.log2Floor}`,x:o,xLabel:`shuffles`,series:[{label:`mash`,colorVar:`--series-3`,values:Array.from(e.curves[a].mean)},{label:`GSR`,colorVar:`--series-1`,values:Array.from(h.baseline.curves[a].mean)}],band:{lo:r.mean-2*r.sd,hi:r.mean+2*r.sd},refLine:r.mean}))}m.scrollIntoView({behavior:`smooth`,block:`nearest`})}function T(e){return typeof e==`number`?Number.isFinite(e)?String(e):`never`:e}