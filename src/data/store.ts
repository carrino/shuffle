// Data I/O behind one small async interface — THE swap point for the future
// GCP deployment. Today: read = fetch the static JSONL; write = hand the
// caller a validated JSON line to copy or download, appended to
// data/mashes.jsonl via git commit (writes stay git-serialized until a Cloud
// Function endpoint exists). Later: read stays a fetch, write becomes an
// HTTP POST — nothing outside this file changes.

import { validateRecord, toJsonLine, type MashRecord } from './schema';

export interface InvalidLine {
  lineNumber: number;
  raw: string;
  errors: string[];
}

export interface ReadResult {
  records: MashRecord[];
  /** invalid lines are skipped but always reported, never silently dropped */
  invalid: InvalidLine[];
}

export type WriteResult =
  /** static hosting: the caller must get this line into data/mashes.jsonl */
  | { mode: 'manual'; line: string }
  /** future HTTP endpoint: the record was persisted server-side */
  | { mode: 'committed' };

export interface MashStore {
  read(): Promise<ReadResult>;
  write(record: MashRecord): Promise<WriteResult>;
}

export function parseJsonl(text: string): ReadResult {
  const records: MashRecord[] = [];
  const invalid: InvalidLine[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === '') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      invalid.push({ lineNumber: i + 1, raw: trimmed, errors: ['not valid JSON'] });
      return;
    }
    const result = validateRecord(parsed);
    if (result.ok) records.push(result.record);
    else invalid.push({ lineNumber: i + 1, raw: trimmed, errors: result.errors });
  });
  return { records, invalid };
}

export function makeStaticStore(url = 'data/mashes.jsonl'): MashStore {
  return {
    async read(): Promise<ReadResult> {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 404) return { records: [], invalid: [] };
        throw new Error(`fetch ${url}: HTTP ${res.status}`);
      }
      return parseJsonl(await res.text());
    },
    async write(record: MashRecord): Promise<WriteResult> {
      const result = validateRecord(record);
      if (!result.ok) throw new Error(`invalid record: ${result.errors.join('; ')}`);
      return { mode: 'manual', line: toJsonLine(result.record) };
    },
  };
}
