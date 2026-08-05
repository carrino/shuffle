import{t as e}from"./nav-Bmd7he7P.js";import{n as t,t as n}from"./store-DVhmii2f.js";e(`capture.html`);var r=n(),i=document.getElementById(`app`);i.innerHTML=`
<style>
  .tapper { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
  .tapper button {
    font-size: 2.6rem; font-weight: 800; padding: 0;
    height: min(34vh, 260px); border-radius: 16px; color: #fff;
    touch-action: manipulation; -webkit-user-select: none; user-select: none;
  }
  .tapper .r { background: var(--series-2); }
  .tapper .b { background: var(--series-1); }
  .tapper button:active { filter: brightness(1.15); }
  .seq {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    word-break: break-all; background: var(--surface-1);
    border: 1px solid var(--border); border-radius: 10px;
    padding: 10px; min-height: 3.2em; font-size: 0.95rem;
  }
  .seq .r { color: var(--series-2); font-weight:700 }
  .seq .b { color: var(--series-1); }
  .counts { display:flex; gap:16px; font-variant-numeric: tabular-nums;
    font-size: 1.05rem; margin: 8px 0; align-items: baseline; flex-wrap: wrap; }
  .counts strong { font-size: 1.5rem; }
  .rowbtns { display:flex; gap:8px; margin: 10px 0; flex-wrap: wrap; }
  .meta { display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0 12px; }
  #jsonline { width:100%; font-family: ui-monospace, Menlo, monospace; font-size: 0.8rem; }
  details > summary { cursor: pointer; color: var(--text-secondary); margin: 8px 0; }
</style>

<div class="card">
  <details>
    <summary>Protocol (read once)</summary>
    <p><strong>The flip method — no special sleeves needed.</strong>
    Cut the deck the way you always do (lift the bottom packet), then
    <strong>flip the lifted packet over</strong> so its cards face the other
    way, and mash once <em>the way you always mash</em>. Fan the deck and tap
    <strong>top to bottom</strong>: flipped cards are
    <strong style="color:var(--series-2)">R</strong>, unflipped are
    <strong style="color:var(--series-1)">B</strong>. Un-flip afterwards —
    they're easy to spot.</p>
    <p>Don't aim for a special cut — the natural cut is part of what's being
    measured (the R count <em>is</em> your actual cut size; "intended split"
    is just what you were going for). Ugly mashes are good data: record what
    really happened, clumps, slabs and all.</p>
  </details>
  <div class="meta">
    <div><label for="collector">Collector</label><input id="collector" autocapitalize="none" placeholder="who's shuffling"></div>
    <div><label for="technique">Technique</label><input id="technique" value="mash"></div>
    <div><label for="deckname">Deck</label><input id="deckname" value="sleeved-99"></div>
    <div><label for="intended">Intended split</label><input id="intended" type="number" value="35" min="1" inputmode="numeric"></div>
    <div><label for="decksize">Deck size n</label>
      <select id="decksize">
        <option value="40">40 (draft)</option>
        <option value="60">60 (standard)</option>
        <option value="98">98 (commander, partners out)</option>
        <option value="99" selected>99 (commander, general out)</option>
        <option value="100">100 (full stack)</option>
      </select>
    </div>
  </div>
</div>

<div class="counts card">
  <span>R <strong id="countR">0</strong></span>
  <span>B <strong id="countB">0</strong></span>
  <span>total <strong id="countT">0</strong>/<span id="targetN">99</span></span>
  <span class="muted" id="liveStatus"></span>
</div>

<div class="tapper">
  <button class="b" id="tapB">B</button>
  <button class="r" id="tapR">R</button>
</div>

<div class="rowbtns">
  <button class="secondary" id="undo">← Undo</button>
  <button class="secondary" id="clear">Clear</button>
  <button class="secondary" id="fillB" style="color:var(--series-1)">Fill rest B</button>
  <button class="secondary" id="fillR" style="color:var(--series-2)">Fill rest R</button>
  <button class="secondary" id="pasteToggle">Paste a string…</button>
</div>
<p class="muted" id="kbdHint">Keyboard: <code>z</code>/<code>x</code>, <code>←</code>/<code>→</code>
or <code>b</code>/<code>r</code> tap a card (left = B, right = R);
<code>Backspace</code> or <code>u</code> undo; <code>Shift+Z</code>/<code>Shift+X</code>
(or <code>Shift+B</code>/<code>Shift+R</code>) fill the remainder with one color;
<code>Enter</code> saves a complete record and starts the next.</p>
<div id="pasteArea" style="display:none">
  <label for="pasteInput">Paste R/B string (spaces/newlines ignored, lowercase ok)</label>
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
</div>`;var a=[],o=e=>document.getElementById(e),s=e=>o(e),c=`mash-capture-session`,l=[];try{let e=JSON.parse(localStorage.getItem(c)??`[]`);Array.isArray(e)&&(l=e.filter(e=>typeof e==`string`))}catch{l=[]}function u(){o(`savedCount`).textContent=`${l.length} saved`,o(`savedLines`).value=l.join(`
`);let e=l.length===0;o(`copyAll`).disabled=e,o(`downloadAll`).disabled=e,o(`clearSaved`).disabled=e}function d(){localStorage.setItem(c,JSON.stringify(l)),u()}function f(){let e=o(`jsonline`).value;!e||o(`saveNext`).disabled||(l.push(e),d(),a=[],m())}o(`decksize`).addEventListener(`change`,()=>{let e=Number(s(`decksize`).value);s(`intended`).value=String(Math.round(e*.35));let t=s(`deckname`);/^sleeved-\d+$/.test(t.value)&&(t.value=`sleeved-${e}`),m()});function p(){return{ts:new Date().toISOString(),collector:s(`collector`).value.trim(),technique:s(`technique`).value.trim(),deck:s(`deckname`).value.trim(),intendedSplit:Number(s(`intended`).value),string:a.join(``),n:Number(s(`decksize`).value)}}function m(){let e=a.filter(e=>e===`R`).length;o(`countR`).textContent=String(e),o(`countB`).textContent=String(a.length-e),o(`countT`).textContent=String(a.length),o(`targetN`).textContent=s(`decksize`).value,o(`seq`).innerHTML=a.map(e=>`<span class="${e.toLowerCase()}">${e}</span>`).join(``);let n=Number(s(`decksize`).value),i=o(`liveStatus`);i.textContent=a.length===0?``:a.length<n?`${n-a.length} to go`:a.length===n?`complete ✓`:`${a.length-n} too many!`;let c=p(),l=t(c),u=o(`validation`),d=o(`jsonline`);l.ok?r.write(l.record).then(e=>{e.mode===`manual`&&(d.value=e.line,u.innerHTML=`<span class="pill pass">VALID</span> ready to save`,o(`copy`).disabled=!1,o(`download`).disabled=!1,o(`saveNext`).disabled=!1)}):(d.value=``,o(`copy`).disabled=!0,o(`download`).disabled=!0,o(`saveNext`).disabled=!0,u.innerHTML=a.length===0?`Tap out the deck to build a record.`:`<span class="pill fail">INVALID</span> ${l.errors.join(`; `)}`)}function h(e){a.push(e),m()}function g(){a.pop(),m()}function _(e){let t=Number(s(`decksize`).value);if(!(!Number.isInteger(t)||t<2)){for(;a.length<t;)a.push(e);m()}}o(`tapR`).addEventListener(`click`,()=>h(`R`)),o(`tapB`).addEventListener(`click`,()=>h(`B`)),o(`undo`).addEventListener(`click`,g),o(`fillR`).addEventListener(`click`,()=>_(`R`)),o(`fillB`).addEventListener(`click`,()=>_(`B`)),document.addEventListener(`keydown`,e=>{let t=e.target;if(t&&(t.tagName===`INPUT`||t.tagName===`TEXTAREA`||t.tagName===`SELECT`)||e.metaKey||e.ctrlKey||e.altKey)return;let n=e.key;if(n===`b`||n===`z`||n===`ArrowLeft`)h(`B`);else if(n===`r`||n===`x`||n===`ArrowRight`)h(`R`);else if(n===`B`||n===`Z`)_(`B`);else if(n===`R`||n===`X`)_(`R`);else if(n===`Backspace`||n===`u`)g();else if(n===`Enter`)f();else return;e.preventDefault()}),o(`clear`).addEventListener(`click`,()=>{(a.length===0||confirm(`Clear the whole sequence?`))&&(a=[],m())}),o(`pasteToggle`).addEventListener(`click`,()=>{let e=o(`pasteArea`);e.style.display=e.style.display===`none`?`block`:`none`}),o(`pasteApply`).addEventListener(`click`,()=>{a=[...o(`pasteInput`).value.toUpperCase().replace(/[^RB]/g,``)],o(`pasteArea`).style.display=`none`,m()}),o(`copy`).addEventListener(`click`,()=>{navigator.clipboard.writeText(o(`jsonline`).value).then(()=>{o(`copy`).textContent=`Copied ✓`,setTimeout(()=>o(`copy`).textContent=`Copy JSON line`,1200)})}),o(`download`).addEventListener(`click`,()=>{let e=new Blob([o(`jsonline`).value+`
`],{type:`application/jsonl`}),t=document.createElement(`a`);t.href=URL.createObjectURL(e),t.download=`mash-${Date.now()}.jsonl`,t.click(),URL.revokeObjectURL(t.href)}),o(`saveNext`).addEventListener(`click`,f),o(`copyAll`).addEventListener(`click`,()=>{navigator.clipboard.writeText(l.join(`
`)+`
`).then(()=>{o(`copyAll`).textContent=`Copied ✓`,setTimeout(()=>o(`copyAll`).textContent=`Copy all lines`,1200)})}),o(`downloadAll`).addEventListener(`click`,()=>{let e=new Blob([l.join(`
`)+`
`],{type:`application/jsonl`}),t=document.createElement(`a`);t.href=URL.createObjectURL(e),t.download=`mash-session-${Date.now()}.jsonl`,t.click(),URL.revokeObjectURL(t.href)}),o(`clearSaved`).addEventListener(`click`,()=>{confirm(`Discard ${l.length} saved record(s)?`)&&(l=[],d())});for(let e of[`collector`,`technique`,`deckname`,`intended`,`decksize`])o(e).addEventListener(`input`,m);u(),m();