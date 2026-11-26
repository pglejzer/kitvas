import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type CodeSend,
  emptyRecord,
  type FigmaSend,
  type HandoffRecord,
  HandoffRecordSchema,
  type HandoffSend,
  MAX_SENDS,
  readSend,
  withSend,
} from '../../src/handoff/index.ts';
import type { KitvasError } from '../../src/shared/index.ts';

const AT = '2026-11-25T10:00:00.000Z';
const KEY = 'aB3dE5fG7hJ9kL1mN3pQ5r';

const figmaResult = {
  target: 'figma',
  version: 3,
  sendId: 'k7x2m9qa',
  state: 'sent',
  lastStep: null,
  file: { key: KEY, url: `https://www.figma.com/design/${KEY}/kitvas-probes` },
  page: 'kitvas · pricing',
  frames: [
    { width: 1280, node: '12:34' },
    { width: 390, node: '12:35' },
  ],
  fontsMissing: ['Figtree Semi Bold'],
};

const codeResult = {
  target: 'code',
  version: 3,
  state: 'done',
  to: 'src/pages/pricing',
  scope: 'new',
  files: ['src/pages/pricing/Pricing.tsx', 'src/pages/pricing/Pricing.module.css'],
  outside: [],
  scripts: [
    { command: 'npm run build', ok: true },
    { command: 'npm run lint', ok: false },
  ],
  look: [
    { width: 1280, score: 93 },
    { width: 390, score: 88.5 },
  ],
};

function refusal(raw: unknown, at = AT): KitvasError {
  const read = readSend(raw, at);
  assert.equal(read.ok, false);
  if (read.ok) throw new Error('expected a refusal');
  assert.equal(read.error.code, 'HANDOFF_INVALID');
  return read.error;
}

function accepted(raw: unknown): HandoffSend {
  const read = readSend(raw, AT);
  if (!read.ok) throw new Error(`refused: ${JSON.stringify(read.error.params)}`);
  return read.value;
}

const figmaSend = (sendId: string, state: 'sent' | 'partial' = 'sent'): FigmaSend => {
  const send = accepted({ ...figmaResult, sendId, state });
  if (send.target !== 'figma') throw new Error('expected a Figma send');
  return send;
};

test('a Figma result becomes a send stamped with the command time', () => {
  assert.deepEqual(accepted(figmaResult), { ...figmaResult, at: AT });
});

test('a code send comes back as given, and the record holds it beside a Figma send', () => {
  const send = accepted(codeResult);
  assert.deepEqual(send, { ...codeResult, at: AT });
  const record = withSend(withSend(emptyRecord(), figmaSend('k7x2m9qa')), send);
  // The record as a file reads back through its schema, both kinds in it.
  const written: unknown = JSON.parse(JSON.stringify(record));
  const reread = HandoffRecordSchema.parse(written);
  assert.deepEqual(reread, record);
  assert.deepEqual(
    reread.sends.map((entry) => entry.target),
    ['code', 'figma'],
  );
  const code = reread.sends[0];
  assert.equal(code?.target, 'code');
  if (code?.target === 'code') {
    const typed: CodeSend = code;
    assert.equal(typed.scope, 'new');
  }
  // Nothing compared, a partial send.
  assert.equal(accepted({ ...codeResult, look: null, state: 'partial' }).state, 'partial');
});

test('a bad file key is refused', () => {
  for (const key of ['short', `${KEY}-x`, 'a'.repeat(129)]) {
    const error = refusal({ ...figmaResult, file: { ...figmaResult.file, key } });
    assert.equal(error.params.at, 'file.key', key);
  }
});

test('a frame id that is not 12:34 is refused', () => {
  for (const node of ['12-34', '12:', 'node 1', '12:34:56']) {
    const error = refusal({ ...figmaResult, frames: [{ width: 1280, node }] });
    assert.equal(error.params.at, 'frames.0.node', node);
  }
});

test('an unknown state, target or key is refused, and the file may not give the time', () => {
  assert.equal(refusal({ ...figmaResult, state: 'done' }).params.at, 'state');
  assert.equal(refusal({ ...codeResult, state: 'sent' }).params.at, 'state');
  assert.equal(refusal({ ...figmaResult, target: 'sketch' }).code, 'HANDOFF_INVALID');
  assert.equal(refusal({ ...figmaResult, colour: 'red' }).params.at, 'colour');
  assert.equal(refusal({ ...figmaResult, at: AT }).params.at, 'at');
  assert.equal(refusal(figmaResult, 'yesterday').params.at, 'at');
  assert.equal(refusal(null).code, 'HANDOFF_INVALID');
});

test('a link outside figma.com, a path outside the project and a score over 100 are refused', () => {
  const link = 'https://evil.example/design/x';
  assert.equal(refusal({ ...figmaResult, file: { key: KEY, url: link } }).params.at, 'file.url');
  assert.equal(refusal({ ...codeResult, files: ['../secrets.txt'] }).params.at, 'files.0');
  assert.equal(refusal({ ...codeResult, to: '/etc' }).params.at, 'to');
  assert.equal(refusal({ ...codeResult, scope: 'everywhere' }).params.at, 'scope');
  assert.equal(
    refusal({ ...codeResult, look: [{ width: 1280, score: 101 }] }).params.at,
    'look.0.score',
  );
  // The project root is a folder too.
  assert.equal(accepted({ ...codeResult, to: '' }).target, 'code');
});

test('withSend keeps the newest 50, newest first', () => {
  let record: HandoffRecord = emptyRecord();
  for (let index = 0; index < 55; index += 1) {
    record = withSend(record, figmaSend(`send${String(index).padStart(2, '0')}`));
  }
  assert.equal(record.sends.length, MAX_SENDS);
  const ids = record.sends.map((send) => (send.target === 'figma' ? send.sendId : ''));
  assert.equal(ids[0], 'send54');
  assert.equal(ids.at(-1), 'send05');
  assert.equal(HandoffRecordSchema.safeParse(record).success, true);
});

test('a resumed send replaces its partial entry, and other sends stay', () => {
  const first = withSend(emptyRecord(), figmaSend('aaaa1111'));
  const partial = withSend(first, figmaSend('bbbb2222', 'partial'));
  const sent = withSend(partial, figmaSend('bbbb2222', 'sent'));
  assert.deepEqual(
    sent.sends.map((send) => (send.target === 'figma' ? [send.sendId, send.state] : [])),
    [
      ['bbbb2222', 'sent'],
      ['aaaa1111', 'sent'],
    ],
  );
  // A code send has no send id: each one is kept.
  const code = accepted(codeResult);
  assert.equal(withSend(withSend(sent, code), code).sends.length, 4);
});
