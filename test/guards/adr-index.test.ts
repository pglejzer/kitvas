import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { type AdrRecord, adrIndex, parseAdr } from '../../scripts/adr-index.ts';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';

const dir = join(PLUGIN_ROOT, 'docs', 'adr');
const names = readdirSync(dir)
  .filter((name) => name.endsWith('.md') && name !== 'README.md')
  .sort();

const records: AdrRecord[] = [];
const problems: string[] = [];
for (const name of names) {
  const parsed = parseAdr(name, readFileSync(join(dir, name), 'utf8'));
  if (parsed.ok) records.push(parsed.record);
  else problems.push(...parsed.problems);
}

const record = (head: string, name = '0001-first.md'): string =>
  `# ${name.slice(0, 4)}. First\n\n${head}\n\nBody.\n`;

test('every record has a head that parses', () => {
  assert.deepEqual(problems, []);
});

test('a status that names another ADR names one that exists', () => {
  const numbers = new Set(records.map((item) => item.number));
  const missing = records
    .filter((item) => item.named !== undefined && !numbers.has(item.named))
    .map((item) => `${item.file} names ADR ${item.named}`);
  assert.deepEqual(missing, []);
});

test('record numbers are unique', () => {
  const seen = new Set<string>();
  const twice = records
    .map((item) => item.number)
    .filter((number) => seen.size === seen.add(number).size);
  assert.deepEqual(twice, []);
});

test('docs/adr/README.md is the generated index', () => {
  const onDisk = readFileSync(join(dir, 'README.md'), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(onDisk, adrIndex(records), 'docs/adr/README.md is stale: run npm run adr');
});

test('parseAdr reads the three status forms', () => {
  const plain = parseAdr('0001-first.md', record('Date: 2026-11-20. Status: accepted.'));
  assert.deepEqual(plain, {
    ok: true,
    record: {
      file: '0001-first.md',
      number: '0001',
      title: 'First',
      date: '2026-11-20',
      status: 'accepted',
    },
  });
  const replaced = parseAdr(
    '0001-first.md',
    record('Date: 2026-11-20. Status: replaced by ADR 0002.'),
  );
  assert.ok(replaced.ok);
  assert.equal(replaced.record.status, 'replaced by ADR 0002');
  assert.equal(replaced.record.named, '0002');
  const changed = parseAdr(
    '0001-first.md',
    record('Date: 2026-11-20. Status: accepted, changed in part by ADR 0003.'),
  );
  assert.ok(changed.ok);
  assert.equal(changed.record.named, '0003');
});

test('parseAdr keeps a parenthetical after accepted and ignores later sentences', () => {
  const parsed = parseAdr(
    '0001-first.md',
    record(
      'Date: 2026-11-20. Status: accepted (owner decision, plan 9b). Adds to `0006-kit-contract.md`.',
    ),
  );
  assert.ok(parsed.ok);
  assert.equal(parsed.record.status, 'accepted (owner decision, plan 9b)');
  const more = parseAdr(
    '0001-first.md',
    record('Date: 2026-11-20. Status: accepted. Spec: `docs/specs/x.md`, section 2.'),
  );
  assert.ok(more.ok);
  assert.equal(more.record.status, 'accepted');
});

test('parseAdr reports what is wrong with a head', () => {
  const wrongNumber = parseAdr('0002-second.md', record('Date: 2026-11-20. Status: accepted.'));
  assert.ok(!wrongNumber.ok);
  assert.match(wrongNumber.problems.join('\n'), /line 1 says 0001, the file name says 0002/);

  const noDate = parseAdr('0001-first.md', record('Status: accepted.'));
  assert.ok(!noDate.ok);
  assert.match(noDate.problems.join('\n'), /no "Date:" line/);

  const badStatus = parseAdr('0001-first.md', record('Date: 2026-11-20. Status: maybe.'));
  assert.ok(!badStatus.ok);
  assert.match(badStatus.problems.join('\n'), /none of the three forms/);

  const badNumber = parseAdr(
    '0001-first.md',
    record('Date: 2026-11-20. Status: replaced by ADR 12.'),
  );
  assert.ok(!badNumber.ok);
  assert.match(badNumber.problems.join('\n'), /not a four digit ADR number/);
});

test('adrIndex sorts by number, links the file and ends with one LF', () => {
  const text = adrIndex([
    { file: '0010-ten.md', number: '0010', title: 'Ten', date: '2026-11-02', status: 'accepted' },
    {
      file: '0002-two.md',
      number: '0002',
      title: 'Two | pipe',
      date: '2026-11-01',
      status: 'replaced by ADR 0010',
    },
  ]);
  assert.ok(text.endsWith('|\n'));
  assert.ok(!text.includes('\r'));
  assert.match(text, /^# Decision records\n/);
  assert.match(text, /npm run adr/);
  const rows = text.split('\n').filter((line) => line.startsWith('| ['));
  assert.deepEqual(rows, [
    '| [0002](0002-two.md) | Two \\| pipe | 2026-11-01 | replaced by ADR 0010 |',
    '| [0010](0010-ten.md) | Ten | 2026-11-02 | accepted |',
  ]);
  assert.ok(text.includes('| ADR | Title | Date | Status |'));
});
