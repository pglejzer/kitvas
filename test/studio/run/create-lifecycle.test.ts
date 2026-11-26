import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLifecycle, startStudio, writeState } from '../../../src/studio/index.ts';
import { shopDraft } from '../../helpers/draft/drafts.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';
import { fakeAssets } from '../../helpers/studio/studio.ts';
import { SAMPLE_STATE } from '../../helpers/studio/studio-state.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { t } from '../../helpers/translate.ts';
import { until } from '../../helpers/wait.ts';

test('the real lifecycle reads the state file and talks to the studio it names', async () => {
  const project = 'C:/projects/shop';
  const lifecycle = createLifecycle({
    dataDir: tempDir(),
    project,
    version: '1.0.0',
    bin: 'unused',
    env: {},
  });
  assert.equal(lifecycle.readState(), undefined);
  let stopped = false;
  const studio = await startStudio({
    drafts: shopDraft().store,
    kits: builtinKits(),
    t,
    assets: fakeAssets,
    version: '1.0.0',
    shutdown: () => {
      stopped = true;
    },
  });
  try {
    const state = {
      ...SAMPLE_STATE,
      pid: process.pid,
      port: studio.port,
      framePort: studio.framePort,
      token: studio.token,
      project,
    };
    writeState(lifecycle.files.state, state);
    assert.deepEqual(lifecycle.readState(), state);
    assert.deepEqual(await lifecycle.probe(state), { version: '1.0.0' });
    assert.equal(await lifecycle.probe({ ...state, token: 'x'.repeat(43) }), undefined);
    const links = await lifecycle.link(state, '/drafts/shop');
    const link = new URL(links.url);
    assert.equal(link.origin, `http://kitvas.localhost:${studio.port}`);
    assert.equal(link.pathname, '/open');
    assert.equal(link.searchParams.get('to'), '/drafts/shop');
    assert.equal(links.fallbackUrl, `http://localhost:${studio.port}/open${link.search}`);
    await assert.rejects(lifecycle.link(state, '/nowhere'));
    assert.equal(await lifecycle.shutdown(state), true);
    await until(() => stopped);
    assert.equal(lifecycle.isAlive(process.pid), true);
    lifecycle.removeState(state.pid);
    assert.equal(lifecycle.readState(), undefined);
  } finally {
    await studio.close();
  }
  assert.equal(await lifecycle.probe({ ...SAMPLE_STATE, port: 1 }), undefined);
  assert.equal(await lifecycle.shutdown({ ...SAMPLE_STATE, port: 1 }), false);
});
