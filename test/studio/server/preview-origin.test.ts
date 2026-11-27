import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import type { Studio } from '../../../src/studio/index.ts';
import { writeCatalog } from '../../helpers/kit/catalog.ts';
import { call, pageCookie, raw, rawCall, shopStudio } from '../../helpers/studio/studio.ts';

const SET = 'v1-0123456789abcdef';

/** The frame key, read from the kit page like the browser does. */
async function frameKey(studio: Studio): Promise<string> {
  const cookie = await pageCookie(studio);
  const page = await call(studio.port, { path: '/kit/kitvas-ui', headers: { cookie } });
  assert.equal(page.status, 200);
  const found = /src="http:\/\/127\.0\.0\.1:\d+\/k\/([^/]+)\/kitvas-ui\/html\/index\.html/.exec(
    page.text,
  );
  const key = found?.[1];
  assert.ok(key, 'the kit page frames an example');
  return key;
}

/** The built-in kit's catalog with a set of previews beside its build; the catalog folder. */
function writePreviews(project: string): string {
  const dir = writeCatalog(project);
  const files: Record<string, string> = {
    [`previews/${SET}/component-0.png`]: 'png-bytes',
    [`previews/${SET}/notes.html`]: '<script>1</script>',
    'previews/previews.json': '{}',
  };
  for (const [rel, text] of Object.entries(files)) {
    const file = join(dir, ...rel.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return dir;
}

test('a preview is served on the prototype origin as a PNG, with its headers', async () => {
  const { studio, project } = await shopStudio();
  try {
    writePreviews(project);
    const key = await frameKey(studio);
    const answer = await call(studio.framePort, {
      path: `/k/${key}/kitvas-ui/previews/${SET}/component-0.png`,
    });
    assert.equal(answer.status, 200);
    assert.equal(answer.headers['content-type'], 'image/png');
    assert.equal(answer.headers['x-content-type-options'], 'nosniff');
    // The studio page shows it in an <img>: another origin of the same site.
    assert.equal(answer.headers['cross-origin-resource-policy'], 'cross-origin');
    assert.equal(answer.text, 'png-bytes');
  } finally {
    await studio.close();
  }
});

test('the stamp, other files, a wrong key and paths out of the folder answer 404 or 400', async () => {
  const { studio, project } = await shopStudio();
  try {
    writePreviews(project);
    const key = await frameKey(studio);
    const base = `/k/${key}/kitvas-ui`;
    const refused = [
      `${base}/previews/previews.json`,
      `${base}/previews/${SET}/notes.html`,
      `${base}/previews/${SET}/missing.png`,
      `${base}/previews/${SET}/../../build/json/catalog.json`,
      `${base}/previews/${SET}%2f..%2f..%2fverify.json`,
      `${base}/previews\\${SET}\\component-0.png`,
      `/k/${'x'.repeat(22)}/kitvas-ui/previews/${SET}/component-0.png`,
      `/k/${key}/nokit/previews/${SET}/component-0.png`,
    ];
    for (const path of refused) {
      const answer = await rawCall(
        studio.framePort,
        raw([`GET ${path} HTTP/1.1`, `Host: 127.0.0.1:${studio.framePort}`, 'Connection: close']),
      );
      assert.ok(answer.status === 404 || answer.status === 400, `${path}: ${answer.status}`);
    }
  } finally {
    await studio.close();
  }
});

test('a symbolic link among the previews is never followed', async (t) => {
  const { studio, project } = await shopStudio();
  try {
    const dir = writePreviews(project);
    const secret = join(project, 'secret.png');
    writeFileSync(secret, 'secret');
    try {
      symlinkSync(secret, join(dir, 'previews', SET, 'link.png'));
    } catch {
      t.skip('symbolic links need a privilege here');
      return;
    }
    const key = await frameKey(studio);
    const answer = await call(studio.framePort, {
      path: `/k/${key}/kitvas-ui/previews/${SET}/link.png`,
    });
    assert.equal(answer.status, 404);
  } finally {
    await studio.close();
  }
});
