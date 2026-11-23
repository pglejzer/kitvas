import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { cssVarName, loadKit } from '../../../src/kit/index.ts';
import { groupComponents, groupTokens, swatchRules } from '../../../src/studio/views/kit-view.ts';
import { builtinKits, FIXTURE_KITS } from '../../helpers/kits.ts';

const tiny = () => loadKit(createFolderKitStore(FIXTURE_KITS), 'tiny');

test('tokens are grouped by type in the catalog order, empty types are left out', () => {
  const groups = groupTokens(tiny().tokens);
  assert.deepEqual(
    groups.map((group) => group.type),
    ['color', 'dimension', 'fontFamily', 'fontWeight', 'duration'],
  );
  const colors = groups[0]?.rows ?? [];
  assert.deepEqual(
    colors.map((row) => [row.name, row.value, row.swatch]),
    [
      ['--kit-color-ink', '#1d2025', true],
      ['--kit-color-accent', '#1d2025', true],
      ['--kit-color-veil', 'rgb(0 0 0 / 0.5)', true],
    ],
  );
  const sizes = groups[1]?.rows ?? [];
  assert.deepEqual(
    sizes.map((row) => [row.value, row.swatch]),
    [
      ['8px', false],
      ['0', false],
    ],
  );
  assert.equal(groups[2]?.rows[0]?.value, 'Inter, "Segoe UI", sans-serif');
});

test('swatch rules cover colour tokens only', () => {
  const rules = swatchRules(tiny().tokens).split('\n');
  assert.equal(rules.length, 3);
  assert.equal(rules[0], '.swatch[data-token="--kit-color-ink"] { background: #1d2025; }');
  assert.ok(rules.every((rule) => rule.startsWith('.swatch[data-token="--kit-color-')));
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

test('every token and component of the Base kit lands in a group', () => {
  const loaded = loadKit(builtinKits(), 'base');
  const rows = groupTokens(loaded.tokens).flatMap((group) => group.rows);
  assert.equal(rows.length, loaded.tokens.length);
  assert.ok(rows.some((row) => row.name === cssVarName(loaded.tokens[0]?.path ?? [])));
  const components = groupComponents(loaded.kit.components).flatMap((g) => g.components);
  assert.equal(components.length, loaded.kit.components.length);
});
