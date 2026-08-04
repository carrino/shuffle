// /capture — phone-friendly recorder for real two-color mash observations.
// Big R/B tap targets, undo, paste mode, live validation, JSON-line output
// with copy/download. Writes go through the store interface (today: a line
// you append to data/mashes.jsonl via git; later: an HTTP endpoint).

import './theme.css';
import { mountNav } from './nav';
import { validateRecord } from '../data/schema';
import { makeStaticStore } from '../data/store';

mountNav('capture.html');
const store = makeStaticStore();
const app = document.getElementById('app')!;

app.innerHTML = `
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
    <p>Prepare the deck with a block of <strong style="color:var(--series-2)">R</strong>-sleeved
    cards — your intended small packet — on the <strong>bottom</strong>,
    <strong style="color:var(--series-1)">B</strong>-sleeved cards on top. Lift the
    bottom block at the color boundary and mash once <em>the way you always
    mash</em> (its first cards become the new top), then fan the deck and tap
    the colors <strong>top to bottom</strong>.</p>
  </details>
  <div class="meta">
    <div><label for="collector">Collector</label><input id="collector" autocapitalize="none" placeholder="who's shuffling"></div>
    <div><label for="technique">Technique</label><input id="technique" value="mash"></div>
    <div><label for="deckname">Deck</label><input id="deckname" value="sleeved-100"></div>
    <div><label for="intended">Intended split</label><input id="intended" type="number" value="30" min="1" inputmode="numeric"></div>
    <div><label for="decksize">Deck size n</label><input id="decksize" type="number" value="100" min="2" inputmode="numeric"></div>
  </div>
</div>

<div class="counts card">
  <span>R <strong id="countR">0</strong></span>
  <span>B <strong id="countB">0</strong></span>
  <span>total <strong id="countT">0</strong>/<span id="targetN">100</span></span>
  <span class="muted" id="liveStatus"></span>
</div>

<div class="tapper">
  <button class="r" id="tapR">R</button>
  <button class="b" id="tapB">B</button>
</div>

<div class="rowbtns">
  <button class="secondary" id="undo">← Undo</button>
  <button class="secondary" id="clear">Clear</button>
  <button class="secondary" id="fillR" style="color:var(--series-2)">Fill rest R</button>
  <button class="secondary" id="fillB" style="color:var(--series-1)">Fill rest B</button>
  <button class="secondary" id="pasteToggle">Paste a string…</button>
</div>
<p class="muted" id="kbdHint">Keyboard: <code>r</code> / <code>b</code> tap a card,
<code>Backspace</code>/<code>z</code> undo, <code>Shift+R</code> / <code>Shift+B</code>
fill the remainder (the remnant block) with one color.</p>
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
    <button id="copy" disabled>Copy JSON line</button>
    <button id="download" class="secondary" disabled>Download .jsonl</button>
  </div>
  <p class="muted">Append the line to <code>data/mashes.jsonl</code> and commit —
  writes stay git-serialized until the hosted endpoint exists.</p>
</div>`;

let seq: ('R' | 'B')[] = [];

const el = (id: string) => document.getElementById(id)!;
const input = (id: string) => el(id) as HTMLInputElement;

function record() {
  return {
    ts: new Date().toISOString(),
    collector: input('collector').value.trim(),
    technique: input('technique').value.trim(),
    deck: input('deckname').value.trim(),
    intendedSplit: Number(input('intended').value),
    string: seq.join(''),
    n: Number(input('decksize').value),
  };
}

function refresh(): void {
  const r = seq.filter((c) => c === 'R').length;
  el('countR').textContent = String(r);
  el('countB').textContent = String(seq.length - r);
  el('countT').textContent = String(seq.length);
  el('targetN').textContent = input('decksize').value;
  el('seq').innerHTML = seq
    .map((c) => `<span class="${c.toLowerCase()}">${c}</span>`)
    .join('');

  const n = Number(input('decksize').value);
  const live = el('liveStatus');
  if (seq.length === 0) live.textContent = '';
  else if (seq.length < n) live.textContent = `${n - seq.length} to go`;
  else if (seq.length === n) live.textContent = 'complete ✓';
  else live.textContent = `${seq.length - n} too many!`;

  const rec = record();
  const result = validateRecord(rec);
  const validation = el('validation');
  const jsonline = el('jsonline') as HTMLTextAreaElement;
  if (result.ok) {
    void store.write(result.record).then((w) => {
      if (w.mode === 'manual') {
        jsonline.value = w.line;
        validation.innerHTML = '<span class="pill pass">VALID</span> ready to append';
        (el('copy') as HTMLButtonElement).disabled = false;
        (el('download') as HTMLButtonElement).disabled = false;
      }
    });
  } else {
    jsonline.value = '';
    (el('copy') as HTMLButtonElement).disabled = true;
    (el('download') as HTMLButtonElement).disabled = true;
    validation.innerHTML =
      seq.length === 0
        ? 'Tap out the deck to build a record.'
        : `<span class="pill fail">INVALID</span> ${result.errors.join('; ')}`;
  }
}

function tap(c: 'R' | 'B'): void {
  seq.push(c);
  refresh();
}
function undo(): void {
  seq.pop();
  refresh();
}
/** Fill the rest of the deck with one color — the ordered remnant block. */
function fillRest(c: 'R' | 'B'): void {
  const n = Number(input('decksize').value);
  if (!Number.isInteger(n) || n < 2) return;
  while (seq.length < n) seq.push(c);
  refresh();
}
el('tapR').addEventListener('click', () => tap('R'));
el('tapB').addEventListener('click', () => tap('B'));
el('undo').addEventListener('click', undo);
el('fillR').addEventListener('click', () => fillRest('R'));
el('fillB').addEventListener('click', () => fillRest('B'));

// Keyboard entry (desktop): ignore keystrokes aimed at form fields.
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key;
  if (key === 'r') tap('R');
  else if (key === 'b') tap('B');
  else if (key === 'R') fillRest('R');
  else if (key === 'B') fillRest('B');
  else if (key === 'Backspace' || key === 'z' || key === 'u') undo();
  else return;
  e.preventDefault();
});
el('clear').addEventListener('click', () => {
  if (seq.length === 0 || confirm('Clear the whole sequence?')) {
    seq = [];
    refresh();
  }
});
el('pasteToggle').addEventListener('click', () => {
  const area = el('pasteArea');
  area.style.display = area.style.display === 'none' ? 'block' : 'none';
});
el('pasteApply').addEventListener('click', () => {
  const raw = (el('pasteInput') as HTMLTextAreaElement).value
    .toUpperCase()
    .replace(/[^RB]/g, '');
  seq = [...raw] as ('R' | 'B')[];
  el('pasteArea').style.display = 'none';
  refresh();
});
el('copy').addEventListener('click', () => {
  void navigator.clipboard.writeText((el('jsonline') as HTMLTextAreaElement).value).then(() => {
    el('copy').textContent = 'Copied ✓';
    setTimeout(() => (el('copy').textContent = 'Copy JSON line'), 1200);
  });
});
el('download').addEventListener('click', () => {
  const blob = new Blob([(el('jsonline') as HTMLTextAreaElement).value + '\n'], {
    type: 'application/jsonl',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mash-${Date.now()}.jsonl`;
  a.click();
  URL.revokeObjectURL(a.href);
});
for (const id of ['collector', 'technique', 'deckname', 'intended', 'decksize']) {
  el(id).addEventListener('input', refresh);
}
refresh();
