import{t as e}from"./nav-BGVi1r4O.js";import{t}from"./charts-D1QzNjIF.js";import{n,t as r}from"./fit-CZ6Ou1_0.js";import{t as i}from"./store-DVhmii2f.js";e(`data.html`);var a=document.getElementById(`app`);a.innerHTML=`<p class="muted">Loading data/mashes.jsonl…</p>`;var o=i();function s(e){let t=new URLSearchParams({split:String(e.splitMean),splitSd:String(e.splitSd),mu:String(e.mu),overhang:String(e.overhangMean),overhangSd:String(e.overhangSd),remnant:e.remnantEnd,posDep:String(e.positionDependence??0)});return e.runDist&&e.runDist.length>0&&t.set(`rd`,e.runDist.slice(0,15).join(`,`)),`index.html?${t.toString()}`}o.read().then(({records:e,invalid:t})=>{if(a.innerHTML=``,t.length>0){let e=document.createElement(`div`);e.className=`card check fail`,e.innerHTML=`<h3><span class="status">✗</span> ${t.length} invalid line(s) skipped</h3>
        <ul>${t.map(e=>`<li>line ${e.lineNumber}: ${e.errors.join(`; `)}</li>`).join(``)}</ul>`,a.appendChild(e)}if(e.length===0){let e=document.createElement(`div`);e.className=`card`,e.innerHTML=`<p style="margin-top:0">No observations yet.
        Grab a friend and a two-color deck, then use the
        <a href="capture.html">capture tool</a> — each observation is one line
        appended to <code>data/mashes.jsonl</code> via git commit.</p>`,a.appendChild(e);return}let i=document.createElement(`div`);i.className=`card`,i.innerHTML=`<h2 style="margin-top:0">Observations (${e.length})</h2>
      <div style="overflow-x:auto"><table class="data"><thead><tr>
        <th>ts</th><th>collector</th><th>technique</th><th>deck</th>
        <th>n</th><th>intended</th><th>actual split</th><th>remnant</th><th>runs</th>
      </tr></thead><tbody>${e.map(e=>{let t=r(e);return`<tr><td>${e.ts.slice(0,10)}</td><td>${l(e.collector)}</td>
            <td>${l(e.technique)}</td><td>${l(e.deck)}</td><td>${e.n}</td>
            <td>${e.intendedSplit}</td><td>${t.actualSplit}</td>
            <td>${t.remnantSize} (${t.remnantEnd})</td><td>${t.runs.length}</td></tr>`}).join(``)}</tbody></table></div>`,a.appendChild(i);let o=n(e),d=document.createElement(`div`);d.className=`card`,d.innerHTML=`<h2 style="margin-top:0">Fitted mash configs</h2>
      <p class="muted">Grouped per collector — pooled only as the labeled last
      row, never by default. mu = mean interior run length (SE in parens);
      overhang = the leading small-color run (directly observed).</p>
      <div style="overflow-x:auto"><table class="data"><thead><tr>
        <th>collector</th><th>records</th><th>split</th><th>mu</th>
        <th>mu by thirds</th><th>overhang</th><th>remnant</th><th>pos.dep</th><th></th>
      </tr></thead><tbody>${o.map((e,t)=>`<tr>
          <td>${e.collector===`POOLED`?`<em>POOLED</em>`:l(e.collector)}</td>
          <td>${e.recordCount}</td>
          <td>${e.config.splitMean} ± ${e.config.splitSd}</td>
          <td>${e.config.mu} (±${u(e.stats.muSe)})</td>
          <td>${e.stats.muByThird.join(` / `)}</td>
          <td>${e.config.overhangMean} ± ${e.config.overhangSd}</td>
          <td>${e.config.remnantEnd} (~${e.stats.meanRemnant})</td>
          <td>${e.config.positionDependence}</td>
          <td><a href="${s(e.config)}" data-fit="${t}">simulate →</a></td>
        </tr>`).join(``)}</tbody></table></div>
      <p class="muted">“simulate →” opens Explore pre-loaded with that config —
      run it live or feed it to the sweep from there.</p>`,a.appendChild(d),c(o.filter(e=>e.collector!==`POOLED`))}).catch(e=>{a.innerHTML=`<div class="card check fail"><h3>Failed to load data</h3>
      <p class="muted">${l(String(e))}</p></div>`});function c(e){if(e.length===0)return;let n=document.createElement(`section`);n.innerHTML=`<h2>Run-length distributions by collector</h2>
    <p class="muted">Normalized interior-run histograms. Curves stacking on a
    smooth spectrum ⇒ everyone mashes alike, just clumpier or cleaner; a
    separated shape ⇒ a different technique in kind.</p>`;let r=document.createElement(`div`);r.className=`chart-grid`,n.appendChild(r),a.appendChild(n);let i=Math.max(...e.map(e=>e.stats.runHistogram.length)),o=Array.from({length:i},(e,t)=>t+1),s=[`--series-1`,`--series-2`,`--series-3`,`--series-4`],c=e.slice(0,4);t(r,{title:`P(run length = L)`,subtitle:c.length<e.length?`first ${c.length} collectors shown — refine before comparing more`:`${c.length} collector(s)`,x:o,xLabel:`run length`,series:c.map((e,t)=>({label:e.collector,colorVar:s[t],values:o.map(t=>(e.stats.runHistogram[t-1]??0)/Math.max(1,e.stats.runCount)),points:!0}))})}function l(e){return e.replace(/[&<>"']/g,e=>`&#${e.charCodeAt(0)};`)}function u(e){return Math.round(e*100)/100}