import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseKit } from '../../src/kit/domain/contract.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { tinyKitJson } from '../helpers/kit/kits.ts';

function invalid(change: (raw: Record<string, unknown>) => void): string {
  const raw = tinyKitJson();
  change(raw);
  try {
    parseKit(raw, 'tiny');
  } catch (error) {
    assert.ok(error instanceof KitvasError);
    assert.equal(error.code, 'KIT_INVALID');
    assert.equal(error.params.id, 'tiny');
    return String(error.params.detail);
  }
  return assert.fail('expected KIT_INVALID');
}

test('parses the fixture and fills defaults', () => {
  const kit = parseKit(tinyKitJson(), 'tiny');
  assert.equal(kit.id, 'tiny');
  assert.equal(kit.components.length, 2);
  assert.deepEqual(kit.components[1]?.examples, []);
  assert.deepEqual(kit.components[1]?.parts, []);
  assert.equal(kit.components[0]?.deprecated, false);
  assert.deepEqual(kit.runtime.providers, []);
  assert.equal(kit.runtime.clientOnly, false);
  assert.equal(kit.runtime.styles.generated, 'none');
});

test('rejects unknown fields and names the place', () => {
  assert.match(
    invalid((raw) => {
      raw.extra = true;
    }),
    /extra|kit\.json/,
  );
});

test('rejects bad names, paths and frameworks', () => {
  assert.match(
    invalid((raw) => {
      const first = (raw.components as { name: string }[])[0];
      assert.ok(first);
      first.name = 'button';
    }),
    /^components\.0\.name:/,
  );
  assert.match(
    invalid((raw) => {
      (raw.runtime as { entry: string }).entry = '../outside.ts';
    }),
    /^runtime\.entry:/,
  );
  assert.match(
    invalid((raw) => {
      raw.framework = 'vue';
    }),
    /^framework:/,
  );
  assert.match(
    invalid((raw) => {
      raw.id = 'Tiny Kit';
    }),
    /^id:/,
  );
});

test('themes: ids are option values, attributes are class or data-…, and tokens.modes is gone', () => {
  const themes = {
    default: 'light',
    list: [
      { id: 'light', label: 'Light' },
      {
        id: 'dark',
        label: 'Dark',
        file: 'json/tokens.dark.json',
        attributes: { 'data-mui-color-scheme': 'dark', class: 'dark' },
      },
    ],
  };
  const raw = tinyKitJson();
  (raw.tokens as Record<string, unknown>).themes = themes;
  assert.deepEqual(parseKit(raw, 'tiny').tokens.themes, themes);

  const tokens = (json: Record<string, unknown>) => json.tokens as Record<string, unknown>;
  assert.match(
    invalid((raw) => {
      tokens(raw).modes = { theme: ['light'], default: 'light' };
    }),
    /^tokens: .*modes/,
  );
  assert.match(
    invalid((raw) => {
      tokens(raw).themes = { ...themes, list: [{ id: 'Dark', label: 'Dark' }] };
    }),
    /^tokens\.themes\.list\.0\.id:/,
  );
  assert.match(
    invalid((raw) => {
      tokens(raw).themes = {
        ...themes,
        list: [{ id: 'dark', label: 'Dark', attributes: { style: 'color: red' } }],
      };
    }),
    /^tokens\.themes\.list\.0\.attributes/,
  );
});

test('accepts the package shape of icons and a provider', () => {
  const raw = tinyKitJson();
  raw.icons = {
    source: 'package',
    package: '@acme/icons',
    pattern: 'named-import',
    importPath: '@acme/icons/{Name}',
    searchable: true,
  };
  (raw.runtime as Record<string, unknown>).providers = [
    { import: { from: '@acme/ui', name: 'ThemeProvider' }, props: { theme: 'kitTheme' } },
    { import: { from: '@acme/ui/Reset', default: true } },
  ];
  const kit = parseKit(raw, 'tiny');
  assert.equal(kit.icons?.source, 'package');
  assert.deepEqual(kit.runtime.providers[1]?.props, {});
});
