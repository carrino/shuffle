// Record type + validation for real mash observations.
//
// Capture protocol (documented for collectors — the flip method): cut the
// deck the way you always do (lift the bottom packet), FLIP the lifted
// packet to face the other way, and mash once the way you always mash.
// Then input the cards TOP to BOTTOM: R = a flipped card (from the lifted
// bottom packet), T = an unflipped card (from the top packet). The actual
// split is the R count, the leading R run is the overhang (leading T run =
// negative overhang), and every run boundary is a packet alternation.
// Legacy records used B instead of T; readers accept both.

export interface MashRecord {
  /** ISO8601 timestamp of the observation */
  ts: string;
  /** who shuffled (fits are grouped per collector, never pooled by default) */
  collector: string;
  /** e.g. "mash", "riffle", "mash-bridge" */
  technique: string;
  /** deck description, e.g. "sleeved-100 dragonshield" */
  deck: string;
  /** the split the collector was aiming for (small packet size) */
  intendedSplit: number;
  /** cards top→bottom, e.g. "RRTTRTT…" (R = bottom packet, T = top packet) */
  string: string;
  /** deck size; must equal string.length */
  n: number;
}

export type ValidationResult =
  | { ok: true; record: MashRecord }
  | { ok: false; errors: string[] };

export function validateRecord(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: ['record is not an object'] };
  }
  const r = raw as Record<string, unknown>;

  const str = (field: string): string | null =>
    typeof r[field] === 'string' && (r[field] as string).length > 0
      ? (r[field] as string)
      : (errors.push(`${field}: missing or not a non-empty string`), null);

  const ts = str('ts');
  str('collector');
  str('technique');
  str('deck');
  const s = str('string');

  if (ts !== null && Number.isNaN(Date.parse(ts))) {
    errors.push('ts: not a parseable ISO8601 timestamp');
  }
  if (typeof r.n !== 'number' || !Number.isInteger(r.n) || r.n < 2) {
    errors.push('n: missing or not an integer ≥ 2');
  }
  if (
    typeof r.intendedSplit !== 'number' ||
    !Number.isInteger(r.intendedSplit) ||
    r.intendedSplit < 1
  ) {
    errors.push('intendedSplit: missing or not a positive integer');
  }
  if (s !== null) {
    if (typeof r.n === 'number' && s.length !== r.n) {
      errors.push(`string: length ${s.length} !== n (${r.n})`);
    }
    if (!/^[RTB]+$/.test(s)) {
      errors.push('string: contains characters other than R and T');
    }
  }
  if (
    typeof r.intendedSplit === 'number' &&
    typeof r.n === 'number' &&
    r.intendedSplit >= r.n
  ) {
    errors.push('intendedSplit: must be smaller than n');
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    record: {
      ts: r.ts as string,
      collector: r.collector as string,
      technique: r.technique as string,
      deck: r.deck as string,
      intendedSplit: r.intendedSplit as number,
      // normalize legacy B (old two-color protocol) to T on the way in
      string: (r.string as string).replace(/B/g, 'T'),
      n: r.n as number,
    },
  };
}

/** One canonical JSON line (the unit that gets appended to mashes.jsonl). */
export function toJsonLine(record: MashRecord): string {
  return JSON.stringify({
    ts: record.ts,
    collector: record.collector,
    technique: record.technique,
    deck: record.deck,
    intendedSplit: record.intendedSplit,
    string: record.string,
    n: record.n,
  });
}
