import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PreviewsOnDisk } from '../../../src/checks/index.ts';
import { PaletteSchema, PreviewsSchema } from '../../../src/studio/api/edit/structure-schemas.ts';
import { apiRoutes } from '../../../src/studio/api/routes.ts';
import type { RunningJob } from '../../../src/studio/jobs/job.ts';
import { createJobs } from '../../../src/studio/jobs/jobs.ts';
import {
  NO_PREVIEWS,
  palettePreviews,
  previewsAnswer,
} from '../../../src/studio/previews/answer.ts';
import { createPreviewsKeeper } from '../../../src/studio/previews/keeper.ts';
import { NOW } from '../../helpers/draft/drafts.ts';
import { previewsStamp } from '../../helpers/kit/previews.ts';
import { apiDeps } from '../../helpers/studio/api.ts';
import { t } from '../../helpers/translate.ts';

const KEY = 'c'.repeat(64);
const OTHER = 'd'.repeat(64);
const FRAME = { port: 5001, key: 'k3y' };
const HOST = 'kitvas.localhost:5000';
const SET = `previews/${previewsStamp(KEY).folder}`;

/** A studio's API over the `shop` draft whose previews on disk are `disk`. */
function palette(disk: PreviewsOnDisk) {
  const started: string[][] = [];
  const jobs = createJobs({
    run: (args): RunningJob => {
      started.push(args);
      return { done: new Promise(() => undefined), cancel: () => undefined };
    },
    publish: () => undefined,
    now: () => NOW,
    t,
  });
  const keeper = createPreviewsKeeper({ previews: { read: () => disk }, jobs });
  const routes = apiRoutes(apiDeps({ jobs, previews: { keeper, frame: FRAME } }));
  const route = routes.find((candidate) => candidate.id === 'getPalette');
  assert.ok(route, 'getPalette is in the table');
  const ask = async () => {
    const answer = await route.handle({
      params: { slug: 'shop' },
      headers: {},
      query: new URLSearchParams(),
      host: HOST,
      body: undefined,
    });
    assert.equal(answer.status, 200);
    assert.equal(PaletteSchema.safeParse(answer.body).success, true, JSON.stringify(answer.body));
    return PaletteSchema.parse(answer.body).previews;
  };
  return { ask, started };
}

test('ready previews are answered as image addresses on the prototype origin', async () => {
  const { ask, started } = palette({ key: KEY, stamp: previewsStamp(KEY), fresh: true });
  const previews = await ask();
  const base = `http://kitvas.localhost:5001/k/k3y/tiny/${SET}`;
  assert.deepEqual(previews, {
    state: 'ready',
    backdrop: '#ffffff',
    components: { Button: `${base}/component-0.png` },
    icons: { src: `${base}/icons.png`, cell: 32, columns: 2, names: ['check', 'close'] },
  });
  assert.deepEqual(started, []);
});

test('stale previews start one job and are answered as making, the old set still shown', async () => {
  const { ask, started } = palette({ key: OTHER, stamp: previewsStamp(KEY), fresh: false });
  const first = await ask();
  assert.equal(first.state, 'making');
  assert.ok(first.components.Button?.endsWith(`/${SET}/component-0.png`));
  assert.equal((await ask()).state, 'making');
  assert.deepEqual(started, [['kit', 'previews', 'tiny']]);
});

test('making with no earlier set shows nothing yet', async () => {
  const { ask } = palette({ key: KEY, stamp: undefined, fresh: false });
  assert.deepEqual(await ask(), { ...NO_PREVIEWS, state: 'making' });
});

test('without previews the palette says none and stays valid', async () => {
  const routes = apiRoutes(apiDeps());
  const route = routes.find((candidate) => candidate.id === 'getPalette');
  assert.ok(route);
  const answer = await route.handle({
    params: { slug: 'shop' },
    headers: {},
    query: new URLSearchParams(),
    host: HOST,
    body: undefined,
  });
  assert.deepEqual(PaletteSchema.parse(answer.body).previews, NO_PREVIEWS);
  assert.deepEqual(palettePreviews(undefined, 'tiny', HOST), NO_PREVIEWS);
});

test('none hides an old set; every answer fits the schema the pane reads', () => {
  const src = (path: string): string => `http://h:1/k/k/kitvas-ui/${path}`;
  const none = previewsAnswer({ state: 'none' }, src);
  assert.deepEqual(none, NO_PREVIEWS);
  const plain = previewsStamp(KEY, { icons: null });
  const noSheet = previewsAnswer({ state: 'ready', stamp: plain }, src);
  assert.equal(noSheet.icons, null);
  for (const answer of [none, noSheet, NO_PREVIEWS]) {
    assert.equal(PreviewsSchema.safeParse(answer).success, true);
  }
  assert.equal(PreviewsSchema.safeParse({ ...NO_PREVIEWS, backdrop: 'red' }).success, false);
});
