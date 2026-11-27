import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { loadKit } from '../../../src/kit/index.ts';
import { groupComponents, swatchRules } from '../../../src/studio/views/kit-view.ts';
import { builtinKits, FIXTURE_KITS } from '../../helpers/kit/kits.ts';

const tiny = () => loadKit(createFolderKitStore(FIXTURE_KITS), 'tiny');

test('swatch rules cover colour tokens only', () => {
  const rules = swatchRules(tiny().tokens).split('\n');
  assert.equal(rules.length, 3);
  assert.equal(rules[0], '.kit-swatch[data-token="--kit-color-ink"] { background: #1d2025; }');
  assert.ok(rules.every((rule) => rule.startsWith('.kit-swatch[data-token="--kit-color-')));
});

test('components are grouped by category and turned into rows', () => {
  const groups = groupComponents(tiny().kit.components);
  assert.deepEqual(
    groups.map((group) => group.category),
    ['action', 'display'],
  );
  const button = groups[0]?.components[0];
  assert.equal(button?.name, 'Button');
  assert.deepEqual(button?.props[0], {
    name: 'variant',
    type: 'enum',
    values: 'solid, plain',
    default: 'solid',
    required: false,
    deprecated: false,
  });
  assert.equal(button?.props[1]?.required, true);
  assert.deepEqual(button?.examples, [{ title: 'Solid', code: '<Button>Save</Button>' }]);
  assert.deepEqual(button?.a11y, ['Needs a visible label or aria-label']);
});

test('every component of the kitvas UI kit lands in a group', () => {
  const loaded = loadKit(builtinKits(), 'kitvas-ui');
  const components = groupComponents(loaded.kit.components).flatMap((g) => g.components);
  assert.equal(components.length, loaded.kit.components.length);
});
