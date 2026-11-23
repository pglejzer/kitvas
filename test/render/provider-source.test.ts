import assert from 'node:assert/strict';
import { test } from 'node:test';
import { providerSource } from '../../src/render/domain/provider-source.ts';

test('a provider with bindings imports each bound export and passes it as a prop', () => {
  const source = providerSource([
    {
      from: '@acme/ui',
      name: 'ThemeProvider',
      isDefault: false,
      props: { mode: 'light' },
      bindings: [
        { prop: 'theme', from: 'C:/work/app/src/theme', name: 'theme' },
        { prop: 'icons', from: '@acme/icons', name: 'default' },
      ],
    },
    { from: 'some-lib', name: undefined, isDefault: true, props: {} },
  ]);
  assert.deepEqual(source, {
    imports: [
      'import { ThemeProvider as Provider0 } from "@acme/ui";',
      'import { theme as Binding0_0 } from "C:/work/app/src/theme";',
      'import { default as Binding0_1 } from "@acme/icons";',
      'import Provider1 from "some-lib";',
    ],
    open: '<Provider0 mode={"light"} theme={Binding0_0} icons={Binding0_1}><Provider1>',
    close: '</Provider1></Provider0>',
  });
});

test('names that are no identifier are quoted or left out, never pasted as code', () => {
  const source = providerSource([
    {
      from: 'x";alert(1);"',
      name: 'odd-name',
      isDefault: false,
      props: { 'aria-label': 'Theme', 'bad prop': 'x', '{evil}': 'y' },
      bindings: [
        { prop: 'theme', from: 'pkg', name: 'theme-light' },
        { prop: 'a b', from: 'pkg', name: 'other' },
      ],
    },
  ]);
  assert.deepEqual(source, {
    imports: [
      'import { "odd-name" as Provider0 } from "x\\";alert(1);\\"";',
      'import { "theme-light" as Binding0_0 } from "pkg";',
    ],
    open: '<Provider0 aria-label={"Theme"} theme={Binding0_0}>',
    close: '</Provider0>',
  });
});

test('no providers give no imports and no tags', () => {
  assert.deepEqual(providerSource([]), { imports: [], open: '', close: '' });
});
