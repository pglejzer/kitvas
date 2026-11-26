import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createEventHub, type EventLimits } from '../../../src/studio/events/event-hub.ts';
import { openEvents } from '../../helpers/studio/events.ts';
import { until } from '../../helpers/wait.ts';

/** A plain server whose every request is an events stream of one hub. */
async function hubServer(limits: Partial<EventLimits> = {}) {
  const hub = createEventHub(limits);
  const server = createServer((req, res) => {
    try {
      const header = req.headers['last-event-id'];
      hub.open(res, { 'x-test': '1' }, typeof header === 'string' ? header : undefined);
    } catch (error) {
      res.writeHead(503).end((error as Error).name);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const close = async () => {
    hub.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };
  return { hub, port, close };
}

test('events are numbered and reach every open stream, after a retry hint', async () => {
  const { hub, port, close } = await hubServer();
  try {
    const a = await openEvents(port);
    const b = await openEvents(port);
    assert.equal(a.status, 200);
    assert.equal(a.headers['content-type'], 'text/event-stream; charset=utf-8');
    assert.equal(a.headers['x-test'], '1');
    await until(() => hub.count() === 2);
    hub.publish('job', { n: 1 });
    hub.publish('job', { n: 2 });
    for (const stream of [a, b]) {
      assert.deepEqual(await stream.next(), { id: '1', event: 'job', data: '{"n":1}' });
      assert.deepEqual(await stream.next(), { id: '2', event: 'job', data: '{"n":2}' });
      assert.equal(stream.retry(), '2000');
    }
    a.close();
    await until(() => hub.count() === 1);
    b.close();
  } finally {
    await close();
  }
});

test('a tab that reconnects gets what it missed; a lost or foreign id gets a reset', async () => {
  const { hub, port, close } = await hubServer({ buffer: 3 });
  try {
    for (let n = 1; n <= 5; n += 1) hub.publish('job', { n });
    const caught = await openEvents(port, { 'last-event-id': '3' });
    assert.equal((await caught.next()).id, '4');
    assert.equal((await caught.next()).id, '5');
    caught.close();
    const whole = await openEvents(port, { 'last-event-id': '2' });
    assert.equal((await whole.next()).id, '3');
    whole.close();
    for (const header of ['1', '9', 'x']) {
      const reset = await openEvents(port, { 'last-event-id': header });
      assert.deepEqual(await reset.next(), { id: '5', event: 'reset', data: '{}' });
      reset.close();
    }
    const current = await openEvents(port, { 'last-event-id': '5' });
    hub.publish('job', { n: 6 });
    assert.equal((await current.next()).id, '6');
    current.close();
  } finally {
    await close();
  }
});

test('one stream over the cap is refused; heartbeats flow; close ends every stream', async () => {
  const { hub, port, close } = await hubServer({ streams: 1, heartbeatMs: 50 });
  try {
    const first = await openEvents(port);
    const second = await openEvents(port);
    assert.equal(second.status, 503);
    assert.equal(await second.text(), 'RequestError');
    await until(() => first.comments() >= 2);
    hub.close();
    assert.equal(hub.count(), 0);
    await first.text();
  } finally {
    await close();
  }
});
