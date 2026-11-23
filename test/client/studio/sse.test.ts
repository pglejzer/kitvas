import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEventStream, reconnectDelay, type StreamEvent } from '../../../client/studio/sse.ts';

/** Feeds `chunks` one after another, as the reader does. */
function feed(chunks: readonly string[]): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  let rest = '';
  for (const chunk of chunks) {
    const parsed = parseEventStream(rest + chunk);
    events.push(...parsed.events);
    rest = parsed.rest;
  }
  return { events, rest };
}

/** What the studio sends: a retry hint, events, a heartbeat, in every line-end style. */
const STREAM = [
  'retry: 2000\n\n',
  'id: 1\nevent: job\ndata: {"slug":"shop","state":"running"}\n\n',
  ': ping\n\n',
  'id: 2\r\nevent: job\r\ndata: {"slug":"shop","state":"succeeded"}\r\n\r\n',
  'id: 3\revent: inbox\rdata: {"pending":1}\r\r',
  'data: first\ndata:second\ndata\n\n',
  'event: reset\nid: 4\ndata: {}\n\n',
  'id: 5\nevent: job\ndata: {"slug":"cut"',
].join('');

const EXPECTED: StreamEvent[] = [
  { event: 'job', data: '{"slug":"shop","state":"running"}', id: '1' },
  { event: 'job', data: '{"slug":"shop","state":"succeeded"}', id: '2' },
  { event: 'inbox', data: '{"pending":1}', id: '3' },
  { event: 'message', data: 'first\nsecond\n' },
  { event: 'reset', data: '{}', id: '4' },
];

test('complete events come out; the unfinished one stays for the next chunk', () => {
  const parsed = parseEventStream(STREAM);
  assert.deepEqual(parsed.events, EXPECTED);
  assert.equal(parsed.rest, 'id: 5\nevent: job\ndata: {"slug":"cut"');
  const next = parseEventStream(`${parsed.rest}}\n\n`);
  assert.deepEqual(next.events, [{ event: 'job', data: '{"slug":"cut"}', id: '5' }]);
  assert.equal(next.rest, '');
});

test('a split at any position gives the same events', () => {
  for (let at = 0; at <= STREAM.length; at += 1) {
    const split = feed([STREAM.slice(0, at), STREAM.slice(at)]);
    assert.deepEqual(split.events, EXPECTED, `split at ${at}`);
    assert.equal(split.rest, 'id: 5\nevent: job\ndata: {"slug":"cut"', `split at ${at}`);
  }
});

test('one character at a time gives the same events', () => {
  const single = feed([...STREAM]);
  assert.deepEqual(single.events, EXPECTED);
  assert.equal(single.rest, 'id: 5\nevent: job\ndata: {"slug":"cut"');
});

test('a CR line end at a chunk edge is read the same as CRLF in one piece', () => {
  const whole = 'data: a\r\n\r\ndata: b\r\n\r\n';
  const both = [
    { event: 'message', data: 'a' },
    { event: 'message', data: 'b' },
  ];
  for (let at = 0; at <= whole.length; at += 1) {
    const split = feed([whole.slice(0, at), whole.slice(at)]);
    assert.deepEqual(split.events, both, `split at ${at}`);
    assert.equal(split.rest, '');
  }
});

test('comments, retry, unknown fields and blocks without data are no events', () => {
  const parsed = parseEventStream(': hello\n\nretry: 10\n\nevent: job\nid: 9\n\nfoo: bar\n\n');
  assert.deepEqual(parsed.events, []);
  assert.equal(parsed.rest, '');
});

test('field values lose one leading space only; an id with NUL is ignored', () => {
  const parsed = parseEventStream('data:  two spaces\nid: a\u0000b\n\ndata: x\nid:\n\n');
  assert.deepEqual(parsed.events, [
    { event: 'message', data: ' two spaces' },
    { event: 'message', data: 'x', id: '' },
  ]);
});

test('text without a blank line is all rest', () => {
  assert.deepEqual(parseEventStream(''), { events: [], rest: '' });
  assert.deepEqual(parseEventStream('data: x\n'), { events: [], rest: 'data: x\n' });
  assert.deepEqual(parseEventStream('data: x'), { events: [], rest: 'data: x' });
});

test('reconnects wait 2 s, then 4, 8, 16, and never more than 30 s', () => {
  const delays = [0, 1, 2, 3, 4, 5, 10, 100, 5000].map(reconnectDelay);
  assert.deepEqual(delays, [2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000, 30000]);
  assert.equal(reconnectDelay(-1), 2000);
});
