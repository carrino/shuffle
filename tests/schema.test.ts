import { describe, it, expect } from 'vitest';
import { validateRecord, toJsonLine } from '../src/data/schema';
import { parseJsonl } from '../src/data/store';

const good = {
  ts: '2026-08-04T12:00:00Z',
  collector: 'john',
  technique: 'mash',
  deck: 'sleeved-100',
  intendedSplit: 30,
  string: 'RB'.repeat(15) + 'B'.repeat(70),
  n: 100,
};

describe('schema.validateRecord', () => {
  it('accepts a valid record', () => {
    const r = validateRecord(good);
    expect(r.ok).toBe(true);
  });

  it('rejects string length !== n', () => {
    const r = validateRecord({ ...good, string: 'RB' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('length');
  });

  it('rejects characters outside {R,B}', () => {
    const r = validateRecord({ ...good, string: 'RX'.repeat(50) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('other than R and B');
  });

  it('rejects missing fields, bad timestamps, bad n', () => {
    expect(validateRecord({ ...good, collector: '' }).ok).toBe(false);
    expect(validateRecord({ ...good, ts: 'yesterday-ish' }).ok).toBe(false);
    expect(validateRecord({ ...good, n: 100.5 }).ok).toBe(false);
    expect(validateRecord({ ...good, intendedSplit: 100 }).ok).toBe(false);
    expect(validateRecord(null).ok).toBe(false);
    expect(validateRecord('RRBB').ok).toBe(false);
  });

  it('toJsonLine roundtrips through validation', () => {
    const r = validateRecord(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const line = toJsonLine(r.record);
      const again = validateRecord(JSON.parse(line));
      expect(again.ok).toBe(true);
    }
  });
});

describe('store.parseJsonl', () => {
  it('parses valid lines, skips and reports invalid ones', () => {
    const text = [
      JSON.stringify(good),
      'not json at all {',
      JSON.stringify({ ...good, string: 'RRB' }),
      '',
      JSON.stringify({ ...good, collector: 'ana' }),
    ].join('\n');
    const result = parseJsonl(text);
    expect(result.records.length).toBe(2);
    expect(result.invalid.length).toBe(2);
    expect(result.invalid[0]!.lineNumber).toBe(2);
    expect(result.invalid[0]!.errors[0]).toContain('not valid JSON');
    expect(result.invalid[1]!.lineNumber).toBe(3);
  });

  it('handles an empty file', () => {
    const result = parseJsonl('');
    expect(result.records.length).toBe(0);
    expect(result.invalid.length).toBe(0);
  });
});
