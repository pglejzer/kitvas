import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  DEFAULT_STATES,
  type Draft,
  serializeJson,
  sketchTemplate,
} from '../../src/drafts/index.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { buildDraft } from '../../src/render/index.ts';
import { NOW, TINY, tempDrafts } from '../helpers/draft/drafts.ts';
import { closeRenderTools, renderTools } from '../helpers/draft/render.ts';
import { FIXTURE_KITS } from '../helpers/kit/kits.ts';

const kits = createFolderKitStore(FIXTURE_KITS);

function craftDraft(subject: 'icon' | 'logo' | 'component', picked: 'A' | null) {
  const { store, root } = tempDrafts();
  const createdAt = NOW.toISOString();
  const draft: Draft = {
    schemaVersion: 1,
    slug: 'spark',
    title: 'Spark',
    kind: 'craft',
    kit: TINY,
    createdAt,
    versions: [{ number: 1, createdAt }],
    craft: { subject, name: 'Spark', description: 'A spark', picked },
  };
  store.writeText('spark', 'draft.json', serializeJson(draft));
  store.writeText('spark', 'v1/src/json/states.json', serializeJson(DEFAULT_STATES));
  store.makeDir('spark', 'v1/src/scss');
  for (const sketch of ['A', 'B', 'C'] as const) {
    store.writeText(
      'spark',
      `v1/src/tsx/sketches/${sketch}.tsx`,
      sketchTemplate('Spark', sketch, subject),
    );
  }
  return { store, dir: join(root, 'spark') };
}

for (const subject of ['icon', 'logo', 'component'] as const) {
  test(`a craft ${subject} draft with the tiny kit builds from its sketches`, async () => {
    const { store, dir } = craftDraft(subject, null);
    const tools = renderTools();
    try {
      const report = await buildDraft({ drafts: store, kits, ...tools }, 'spark');
      assert.deepEqual(report.errors, []);
      assert.equal(report.built, true);
      const entry = readFileSync(join(dir, 'v1', 'src', 'tsx', 'index.tsx'), 'utf8');
      assert.equal((entry.match(/data-craft-sketch=/g) ?? []).length, 3);
      assert.equal(entry.includes('sections/'), false);
      const js = readFileSync(join(dir, 'v1', 'build', 'js', 'index.js'), 'utf8');
      assert.ok(js.includes('data-craft-sketch'));
      if (subject === 'icon') {
        assert.ok(entry.includes('data-kit-icon="check"'));
        assert.ok(js.includes('data-kit-icon'));
      }
    } finally {
      await closeRenderTools(tools);
    }
  });
}

test('a picked craft draft builds with only the picked sketch', async () => {
  const { store, dir } = craftDraft('icon', 'A');
  const tools = renderTools();
  try {
    const report = await buildDraft({ drafts: store, kits, ...tools }, 'spark');
    assert.deepEqual(report.errors, []);
    const entry = readFileSync(join(dir, 'v1', 'src', 'tsx', 'index.tsx'), 'utf8');
    assert.equal((entry.match(/data-craft-sketch=/g) ?? []).length, 1);
    assert.equal((entry.match(/from '\.\/sketches\//g) ?? []).length, 1);
  } finally {
    await closeRenderTools(tools);
  }
});
