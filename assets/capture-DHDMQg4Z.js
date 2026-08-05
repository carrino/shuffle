import{t as e}from"./nav-Bmd7he7P.js";import{n as t,t as n}from"./store-DhkOBsWw.js";e(`capture.html`);var r=n(),i=document.getElementById(`app`);i.innerHTML=`
<style>
  .tapper { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
  .tapper button {
    font-size: 2.6rem; font-weight: 800; padding: 0;
    height: min(34vh, 260px); border-radius: 16px; color: #fff;
    touch-action: manipulation; -webkit-user-select: none; user-select: none;
  }
  .tapper .u { background: var(--series-2); }
  .tapper .t { background: var(--series-1); }
  .tapper button:active { filter: brightness(1.15); }
  .seq {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break: break-all; background: var(--surface-1);
    border: 1px solid var(--border); border-radius: 10px;
    padding: 10px; min-height: 3.2em; font-size: 0.95rem;
  }
  .seq .u { color: var(--series-2); font-weight:700 }
  .seq .t { color: var(--series-1); }
  .counts { display:flex; gap:16px; font-variant-numeric: tabular-nums;
    font-size: 1.05rem; margin: 8px 0; align-items: baseline; flex-wrap: wrap; }
  .counts strong { font-size: 1.5rem; }
  .rowbtns { display:flex; gap:8px; margin: 10px 0; flex-wrap: wrap; }
  .meta { display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0 12px; }
  /* form controls fill their grid cell instead of forcing it wider */
  .meta > div { min-width: 0; }
  .meta input, .meta select { width: 100%; font-size: 0.95rem; }
  #jsonline { width:100%; font-family: ui-monospace, Menlo, monospace; font-size: 0.8rem; }
  details > summary { cursor: pointer; color: var(--text-secondary); margin: 8px 0; }
</style>

<div class="card">
  <details>
    <summary>Protocol (read once)</summary>
    <p>Cut the deck the way you always do (lift the bottom packet),
    <strong>flip the lifted packet over</strong> so it faces the other way,
    and mash once the way you always mash. Then input the cards
    <strong>top to bottom</strong>:
    <strong style="color:var(--series-1)">T</strong> for an unflipped card
    (from the <strong>T</strong>op packet),
    <strong style="color:var(--series-2)">U</strong> for a flipped,
    face-<strong>U</strong>p card (from the lifted bottom packet). Un-flip
    them afterwards — they're easy to spot.</p>
    <p>Cut wherever feels natural — the cut size is part of what's being
    measured (the U count is your actual cut; "intended split" is just what
    you were aiming for). Ugly mashes are good data: record what really
    happened, clumps, slabs and all.</p>
  </details>
  <div class="meta">
    <div><label for="collector">Collector</label><input id="collector" autocapitalize="none" placeholder="who's shuffling"></div>
    <div><label for="technique">Technique</label><input id="technique" value="mash"></div>
    <div><label for="deckname">Deck</label><input id="deckname" value="sleeved-60"></div>
    <div><label for="intended">Intended split</label><input id="intended" type="number" value="21" min="1" inputmode="numeric"></div>
    <div><label for="decksize">Deck size n</label>
      <select id="decksize">
        <option value="40">40 (draft)</option>
        <option value="60" selected>60 (standard)</option>
        <option value="98">98 (2 partners)</option>
        <option value="99">99 (commander)</option>
        <option value="100">100 (full stack)</option>
      </select>
    </div>
  </div>
</div>

<div class="counts card">
  <span>T <strong id="countT2">0</strong></span>
  <span>U <strong id="countU">0</strong></span>
  <span>total <strong id="countT">0</strong>/<span id="targetN">60</span></span>
  <span class="muted" id="liveStatus"></span>
</div>

<div class="tapper">
  <button class="t" id="tapT">T</button>
  <button class="u" id="tapU">U</button>
</div>

<div class="rowbtns">
  <button class="secondary" id="undo">← Undo</button>
  <button class="secondary" id="clear">Clear</button>
  <button class="secondary" id="fillT" style="color:var(--series-1)">Fill rest T</button>
  <button class="secondary" id="fillU" style="color:var(--series-2)">Fill rest U</button>
  <button class="secondary" id="pasteToggle">Paste a string…</button>
</div>
<p class="muted" id="kbdHint">Keyboard: <code>z</code>/<code>x</code>, <code>←</code>/<code>→</code>
or <code>t</code>/<code>u</code> tap a card (left = T, right = U — same order as
on the keyboard); <code>Backspace</code> undo; <code>Shift+Z</code>/<code>Shift+X</code>
(or <code>Shift+T</code>/<code>Shift+U</code>) fill the remainder with one side;
<code>Enter</code> saves a complete record and starts the next.</p>
<div id="pasteArea" style="display:none">
  <label for="pasteInput">Paste U/T string (spaces/newlines ignored, lowercase ok; legacy R/B read as U/T)</label>
  <textarea id="pasteInput" rows="3" style="width:100%"></textarea>
  <div class="rowbtns"><button id="pasteApply">Use this string</button></div>
</div>

<div class="seq" id="seq" aria-live="polite"></div>

<div class="card" id="outCard">
  <h2 style="margin-top:0">Record</h2>
  <p id="validation" class="muted">Tap out the deck to build a record.</p>
  <textarea id="jsonline" rows="4" readonly></textarea>
  <div class="rowbtns">
    <button id="saveNext" disabled>Save &amp; next ↵</button>
    <button id="copy" class="secondary" disabled>Copy JSON line</button>
    <button id="download" class="secondary" disabled>Download .jsonl</button>
  </div>
  <p class="muted">Append the line(s) to <code>data/mashes.jsonl</code> and commit —
  writes stay git-serialized until the hosted endpoint exists.</p>
</div>

<div class="card" id="sessionCard">
  <h2 style="margin-top:0">This session <span class="muted" id="savedCount">0 saved</span></h2>
  <p class="muted">"Save &amp; next" locks the record in below (kept in this browser
  across reloads), clears the taps, and keeps your collector/deck settings for
  the next shuffle. Copy or download everything at the end.</p>
  <textarea id="savedLines" rows="4" readonly
    style="width:100%;font-family:ui-monospace,Menlo,monospace;font-size:0.8rem"></textarea>
  <div class="rowbtns">
    <button id="copyAll" disabled>Copy all lines</button>
    <button id="downloadAll" class="secondary" disabled>Download session .jsonl</button>
    <button id="clearSaved" class="secondary" disabled>Clear saved</button>
  </div>
</div>`;var a=`mash-capture-inprogress`,o=(()=>{let e=localStorage.getItem(a)??``;return/^[UT]*$/.test(e)?[...e]:[]})(),s=e=>document.getElementById(e),c=e=>s(e),l=`mash-capture-session`,u=[];try{let e=JSON.parse(localStorage.getItem(l)??`[]`);Array.isArray(e)&&(u=e.filter(e=>typeof e==`string`))}catch{u=[]}function d(){s(`savedCount`).textContent=`${u.length} saved`,s(`savedLines`).value=u.join(`
`);let e=u.length===0;s(`copyAll`).disabled=e,s(`downloadAll`).disabled=e,s(`clearSaved`).disabled=e}function f(){localStorage.setItem(l,JSON.stringify(u)),d()}function p(){let e=s(`jsonline`).value;!e||s(`saveNext`).disabled||(u.push(e),f(),o=[],h())}s(`decksize`).addEventListener(`change`,()=>{let e=Number(c(`decksize`).value);c(`intended`).value=String(Math.round(e*.35));let t=c(`deckname`);/^sleeved-\d+$/.test(t.value)&&(t.value=`sleeved-${e}`),h()});function m(){return{ts:new Date().toISOString(),collector:c(`collector`).value.trim(),technique:c(`technique`).value.trim(),deck:c(`deckname`).value.trim(),intendedSplit:Number(c(`intended`).value),string:o.join(``),n:Number(c(`decksize`).value)}}function h(){localStorage.setItem(a,o.join(``));let e=o.filter(e=>e===`U`).length;s(`countU`).textContent=String(e),s(`countT2`).textContent=String(o.length-e),s(`countT`).textContent=String(o.length),s(`targetN`).textContent=c(`decksize`).value,s(`seq`).innerHTML=o.map(e=>`<span class="${e.toLowerCase()}">${e}</span>`).join(``);let n=Number(c(`decksize`).value),i=s(`liveStatus`);i.textContent=o.length===0?``:o.length<n?`${n-o.length} to go`:o.length===n?`complete ✓`:`${o.length-n} too many!`;let l=m(),u=t(l),d=s(`validation`),f=s(`jsonline`);u.ok?r.write(u.record).then(e=>{e.mode===`manual`&&(f.value=e.line,d.innerHTML=`<span class="pill pass">VALID</span> ready to save`,s(`copy`).disabled=!1,s(`download`).disabled=!1,s(`saveNext`).disabled=!1)}):(f.value=``,s(`copy`).disabled=!0,s(`download`).disabled=!0,s(`saveNext`).disabled=!0,d.innerHTML=o.length===0?`Tap out the deck to build a record.`:`<span class="pill fail">INVALID</span> ${u.errors.join(`; `)}`)}function g(e){o.push(e),h()}function _(){o.pop(),h()}function v(e){let t=Number(c(`decksize`).value);if(!(!Number.isInteger(t)||t<2)){for(;o.length<t;)o.push(e);h()}}s(`tapU`).addEventListener(`click`,()=>g(`U`)),s(`tapT`).addEventListener(`click`,()=>g(`T`)),s(`undo`).addEventListener(`click`,_),s(`fillU`).addEventListener(`click`,()=>v(`U`)),s(`fillT`).addEventListener(`click`,()=>v(`T`)),document.addEventListener(`keydown`,e=>{let t=e.target;if(t&&(t.tagName===`INPUT`||t.tagName===`TEXTAREA`||t.tagName===`SELECT`)||e.metaKey||e.ctrlKey||e.altKey)return;let n=e.key;if(n===`t`||n===`z`||n===`ArrowLeft`)g(`T`);else if(n===`u`||n===`x`||n===`ArrowRight`)g(`U`);else if(n===`T`||n===`Z`)v(`T`);else if(n===`U`||n===`X`)v(`U`);else if(n===`Backspace`)_();else if(n===`Enter`)p();else return;e.preventDefault()}),s(`clear`).addEventListener(`click`,()=>{(o.length===0||confirm(`Clear the whole sequence?`))&&(o=[],h())}),s(`pasteToggle`).addEventListener(`click`,()=>{let e=s(`pasteArea`);e.style.display=e.style.display===`none`?`block`:`none`}),s(`pasteApply`).addEventListener(`click`,()=>{o=[...s(`pasteInput`).value.toUpperCase().replace(/R/g,`U`).replace(/B/g,`T`).replace(/[^UT]/g,``)],s(`pasteArea`).style.display=`none`,h()}),s(`copy`).addEventListener(`click`,()=>{navigator.clipboard.writeText(s(`jsonline`).value).then(()=>{s(`copy`).textContent=`Copied ✓`,setTimeout(()=>s(`copy`).textContent=`Copy JSON line`,1200)})}),s(`download`).addEventListener(`click`,()=>{let e=new Blob([s(`jsonline`).value+`
`],{type:`application/jsonl`}),t=document.createElement(`a`);t.href=URL.createObjectURL(e),t.download=`mash-${Date.now()}.jsonl`,t.click(),URL.revokeObjectURL(t.href)}),s(`saveNext`).addEventListener(`click`,p),s(`copyAll`).addEventListener(`click`,()=>{navigator.clipboard.writeText(u.join(`
`)+`
`).then(()=>{s(`copyAll`).textContent=`Copied ✓`,setTimeout(()=>s(`copyAll`).textContent=`Copy all lines`,1200)})}),s(`downloadAll`).addEventListener(`click`,()=>{let e=new Blob([u.join(`
`)+`
`],{type:`application/jsonl`}),t=document.createElement(`a`);t.href=URL.createObjectURL(e),t.download=`mash-session-${Date.now()}.jsonl`,t.click(),URL.revokeObjectURL(t.href)}),s(`clearSaved`).addEventListener(`click`,()=>{confirm(`Discard ${u.length} saved record(s)?`)&&(u=[],f())});for(let e of[`collector`,`technique`,`deckname`,`intended`,`decksize`])s(e).addEventListener(`input`,h);d(),h();