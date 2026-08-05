// /capture — phone-friendly recorder for real mash observations (flip method).
// Big U/T tap targets, undo, paste mode, live validation, JSON-line output
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
  #jsonline { width:100%; font-family: ui-monospace, Menlo, monospace; font-size: 0.8rem; }
  details > summary { cursor: pointer; color: var(--text-secondary); margin: 8px 0; }
</style>

<div class="card">
  <details>
    <summary>Protocol (read once)</summary>
    <p><strong>The flip method — no special sleeves needed.</strong>
    Cut the deck the way you always do (lift the bottom packet), then
    <strong>flip the lifted packet over</strong> so its cards face the other
    way, and mash once <em>the way you always mash</em>. Then input the cards
    <strong>top to bottom</strong>, dealing one at a time:
    <strong style="color:var(--series-1)">T</strong> = an unflipped card
    (from the <strong>T</strong>op packet),
    <strong style="color:var(--series-2)">U</strong> = a flipped, face-<strong>U</strong>p
    card (from the lifted bottom packet). Un-flip afterwards — they're easy
    to spot.</p>
    <p>Don't aim for a special cut — the natural cut is part of what's being
    measured (the U count <em>is</em> your actual cut size; "intended split"
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
  <span>U <strong id="countU">0</strong></span>
  <span>T <strong id="countT2">0</strong></span>
  <span>total <strong id="countT">0</strong>/<span id="targetN">99</span></span>
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
</div>`;

let seq: ('U' | 'T')[] = [];

const el = (id: string) => document.getElementById(id)!;
const input = (id: string) => el(id) as HTMLInputElement;

// Session log: records locked in with "Save & next", persisted so an
// accidental reload mid-session loses nothing.
const SESSION_KEY = 'mash-capture-session';
let saved: string[] = [];
try {
  const parsed: unknown = JSON.parse(localStorage.getItem(SESSION_KEY) ?? '[]');
  if (Array.isArray(parsed)) saved = parsed.filter((s): s is string => typeof s === 'string');
} catch {
  saved = [];
}

function renderSaved(): void {
  el('savedCount').textContent = `${saved.length} saved`;
  (el('savedLines') as HTMLTextAreaElement).value = saved.join('\n');
  const none = saved.length === 0;
  (el('copyAll') as HTMLButtonElement).disabled = none;
  (el('downloadAll') as HTMLButtonElement).disabled = none;
  (el('clearSaved') as HTMLButtonElement).disabled = none;
}

function persistSaved(): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(saved));
  renderSaved();
}

/** Lock the current valid record into the session list and clear the taps. */
function saveAndNext(): void {
  const line = (el('jsonline') as HTMLTextAreaElement).value;
  if (!line || (el('saveNext') as HTMLButtonElement).disabled) return;
  saved.push(line);
  persistSaved();
  seq = [];
  refresh();
}

// scale the intended-split suggestion (~35% of the deck) when the deck size
// changes, and keep the deck-name hint in sync
(el('decksize') as HTMLSelectElement).addEventListener('change', () => {
  const n = Number(input('decksize').value);
  input('intended').value = String(Math.round(n * 0.35));
  const deckName = input('deckname');
  if (/^sleeved-\d+$/.test(deckName.value)) deckName.value = `sleeved-${n}`;
  refresh();
});

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
  const r = seq.filter((c) => c === 'U').length;
  el('countU').textContent = String(r);
  el('countT2').textContent = String(seq.length - r);
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
        validation.innerHTML = '<span class="pill pass">VALID</span> ready to save';
        (el('copy') as HTMLButtonElement).disabled = false;
        (el('download') as HTMLButtonElement).disabled = false;
        (el('saveNext') as HTMLButtonElement).disabled = false;
      }
    });
  } else {
    jsonline.value = '';
    (el('copy') as HTMLButtonElement).disabled = true;
    (el('download') as HTMLButtonElement).disabled = true;
    (el('saveNext') as HTMLButtonElement).disabled = true;
    validation.innerHTML =
      seq.length === 0
        ? 'Tap out the deck to build a record.'
        : `<span class="pill fail">INVALID</span> ${result.errors.join('; ')}`;
  }
}

function tap(c: 'U' | 'T'): void {
  seq.push(c);
  refresh();
}
function undo(): void {
  seq.pop();
  refresh();
}
/** Fill the rest of the deck with one color — the ordered remnant block. */
function fillRest(c: 'U' | 'T'): void {
  const n = Number(input('decksize').value);
  if (!Number.isInteger(n) || n < 2) return;
  while (seq.length < n) seq.push(c);
  refresh();
}
el('tapU').addEventListener('click', () => tap('U'));
el('tapT').addEventListener('click', () => tap('T'));
el('undo').addEventListener('click', undo);
el('fillU').addEventListener('click', () => fillRest('U'));
el('fillT').addEventListener('click', () => fillRest('T'));

// Keyboard entry (desktop): ignore keystrokes aimed at form fields.
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key;
  if (key === 't' || key === 'z' || key === 'ArrowLeft') tap('T');
  else if (key === 'u' || key === 'x' || key === 'ArrowRight') tap('U');
  else if (key === 'T' || key === 'Z') fillRest('T');
  else if (key === 'U' || key === 'X') fillRest('U');
  else if (key === 'Backspace') undo();
  else if (key === 'Enter') saveAndNext();
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
    .replace(/R/g, 'U')
    .replace(/B/g, 'T')
    .replace(/[^UT]/g, '');
  seq = [...raw] as ('U' | 'T')[];
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
el('saveNext').addEventListener('click', saveAndNext);
el('copyAll').addEventListener('click', () => {
  void navigator.clipboard.writeText(saved.join('\n') + '\n').then(() => {
    el('copyAll').textContent = 'Copied ✓';
    setTimeout(() => (el('copyAll').textContent = 'Copy all lines'), 1200);
  });
});
el('downloadAll').addEventListener('click', () => {
  const blob = new Blob([saved.join('\n') + '\n'], { type: 'application/jsonl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mash-session-${Date.now()}.jsonl`;
  a.click();
  URL.revokeObjectURL(a.href);
});
el('clearSaved').addEventListener('click', () => {
  if (confirm(`Discard ${saved.length} saved record(s)?`)) {
    saved = [];
    persistSaved();
  }
});
for (const id of ['collector', 'technique', 'deckname', 'intended', 'decksize']) {
  el(id).addEventListener('input', refresh);
}
renderSaved();
refresh();
