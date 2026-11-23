import assert from 'node:assert/strict';
import { type AddressInfo, createServer, type Server } from 'node:net';
import { test } from 'node:test';
import { call, shopStudio } from '../../helpers/studio.ts';

/** A server holding a port on 127.0.0.1, the way another program would. */
const listening = async (): Promise<Server> => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
};
const portOf = (server: Server): number => (server.address() as AddressInfo).port;
const close = (server: Server): Promise<void> =>
  new Promise<void>((resolve) => server.close(() => resolve()));

test('preferred ports are taken when free; a port given outright wins over them', async () => {
  // Held together, so the three ports differ; free again once closed.
  const [a, b, c] = await Promise.all([listening(), listening(), listening()]);
  const preferred = { port: portOf(a), framePort: portOf(b) };
  const given = portOf(c);
  await Promise.all([close(a), close(b), close(c)]);
  const first = await shopStudio({ preferred });
  try {
    assert.equal(first.studio.port, preferred.port);
    assert.equal(first.studio.framePort, preferred.framePort);
  } finally {
    await first.studio.close();
  }
  const second = await shopStudio({ port: given, preferred });
  try {
    assert.equal(second.studio.port, given);
    assert.equal(second.studio.framePort, preferred.framePort);
  } finally {
    await second.studio.close();
  }
});

test('a busy port given outright is an error, never another port', async () => {
  const held = await listening();
  try {
    await assert.rejects(shopStudio({ port: portOf(held) }), { code: 'EADDRINUSE' });
  } finally {
    await close(held);
  }
});

test('the page secret comes from the options when given', async () => {
  const pageSecret = 'a'.repeat(64);
  const { studio } = await shopStudio({ pageSecret });
  try {
    const cookie = `kitvas_${studio.port}=${pageSecret}`;
    assert.equal((await call(studio.port, { path: '/', headers: { cookie } })).status, 200);
  } finally {
    await studio.close();
  }
});
