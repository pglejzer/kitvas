import assert from 'node:assert/strict';
import { join, sep } from 'node:path';
import { test } from 'node:test';
import { IMPORT_PROBE, importProbe, importsStep } from '../../../src/checks/app/verify/imports.ts';
import { isEntryFile } from '../../../src/checks/app/verify/kit-entry.ts';
import { generatedEntry } from '../../../src/kit/index.ts';
import {
  ACME_CATALOG,
  acmeLoaded,
  bundleError,
  componentsOf,
  fakeBundler,
  PROJECT,
  tinyLoaded,
} from './support.ts';

const NO_BUTTON = 'No matching export in "../../../../node_modules/@acme/ui/index.js" for import';

test('the probe imports the entry, then every component from its own module', () => {
  const { kit } = acmeLoaded();
  assert.deepEqual(importProbe(kit, PROJECT), {
    source: [
      'import "@kit";',
      'import { Button as K0 } from "@acme/ui";',
      'import { TextField as K1 } from "@acme/ui";',
      'import { Badge as K2 } from "@acme/ui";',
      'export const kitvasImports = [K0, K1, K2];',
      '',
    ].join('\n'),
    lines: { 2: 0, 3: 1, 4: 2 },
  });
});

test('default imports and names that are no identifiers are written safely', () => {
  const { kit } = acmeLoaded((json) => {
    const [button, field] = componentsOf(json);
    if (button) button.import = { from: '@acme/ui/Button', default: true };
    if (field) field.import = { from: '@acme/ui', name: 'Text-Field"' };
    json.components = [button, field];
  });
  assert.deepEqual(importProbe(kit, PROJECT).source.split('\n'), [
    'import "@kit";',
    'import K0 from "@acme/ui/Button";',
    'import { "Text-Field\\"" as K1 } from "@acme/ui";',
    'export const kitvasImports = [K0, K1];',
    '',
  ]);
});

test('a repo kit imports its components by their path in the project', () => {
  const { kit } = acmeLoaded((json) => {
    json.source = { type: 'repo', path: 'src/ds' };
    for (const component of componentsOf(json)) component.import.from = 'src/ds/index';
  });
  const root = PROJECT.split(sep).join('/');
  assert.equal(
    importProbe(kit, PROJECT).source.split('\n')[1],
    `import { Button as K0 } from "${root}/src/ds/index";`,
  );
});

test('a written kit imports its components from its own folder', () => {
  const { kit } = acmeLoaded((json) => {
    json.source = { type: 'web', urls: ['https://example.com/'] };
    for (const component of componentsOf(json)) component.import.from = 'components/Button';
  });
  const dir = join(PROJECT, '.kitvas', 'kits', 'acme');
  assert.equal(
    importProbe(kit, PROJECT, dir).source.split('\n')[1],
    `import { Button as K0 } from "${dir.split(sep).join('/')}/components/Button";`,
  );
});

test('a built-in kit imports its components from its entry', () => {
  const loaded = tinyLoaded();
  assert.deepEqual(importProbe(loaded.kit, undefined).source.split('\n').slice(0, 3), [
    'import "@kit";',
    'import { Button as K0 } from "@kit";',
    'import { Icon as K1 } from "@kit";',
  ]);
});

test('the kit entry is recognised however the tool spells its folder', () => {
  const loaded = acmeLoaded();
  assert.equal(isEntryFile(loaded, ACME_CATALOG, '../../../kits/acme/generated/kit.ts'), true);
  assert.equal(
    isEntryFile(loaded, ACME_CATALOG, '/private/var/x/kits/acme/generated/kit.ts'),
    true,
  );
  assert.equal(isEntryFile(loaded, ACME_CATALOG, 'acme/generated/kit.ts'), true);
  assert.equal(isEntryFile(loaded, ACME_CATALOG, '../../../kits/other/generated/kit.ts'), false);
  assert.equal(isEntryFile(loaded, ACME_CATALOG, '../../../kits/acme/generated/kit.tsx'), false);
  assert.equal(isEntryFile(loaded, ACME_CATALOG, IMPORT_PROBE), false);
});

test('a kit that bundles cleanly passes, bundled once from its catalog folder', async () => {
  const loaded = acmeLoaded();
  const bundler = fakeBundler();
  const result = await importsStep({ loaded, dir: ACME_CATALOG, bundler });
  assert.deepEqual(result, { state: 'passed', issues: [] });
  assert.equal(bundler.bundles.length, 1);
  assert.deepEqual(bundler.bundles[0], {
    workingDir: ACME_CATALOG,
    entry: { name: 'kitvas-imports.ts', source: importProbe(loaded.kit, PROJECT).source },
    alias: { '@kit': join(loaded.dir, 'generated', 'kit.ts') },
    ids: {},
    project: PROJECT,
  });
});

test('a name the module does not export is reported at the component', async () => {
  const loaded = acmeLoaded();
  const bundler = fakeBundler([bundleError(IMPORT_PROBE, 3, `${NO_BUTTON} "TextField"`)]);
  assert.deepEqual(await importsStep({ loaded, dir: ACME_CATALOG, bundler }), {
    state: 'failed',
    issues: [
      {
        step: 'imports',
        path: 'components.1.import',
        key: 'kitIssue.exportMissing',
        params: { name: 'TextField', from: '@acme/ui' },
      },
    ],
  });
});

test('the probe is found at the end of a path when the catalog folder sits behind a link', async () => {
  // macOS: temp folders are under `/var`, a link to `/private/var`. esbuild then names the probe
  // from the resolved folder, `../<link>/kitvas-imports.ts`, while its lines stay the probe's.
  const loaded = acmeLoaded();
  const linked = `../../../../private/var/folders/x/catalog/acme/${IMPORT_PROBE}`;
  const bundler = fakeBundler([bundleError(linked, 3, `${NO_BUTTON} "TextField"`)]);
  assert.deepEqual(await importsStep({ loaded, dir: ACME_CATALOG, bundler }), {
    state: 'failed',
    issues: [
      {
        step: 'imports',
        path: 'components.1.import',
        key: 'kitIssue.exportMissing',
        params: { name: 'TextField', from: '@acme/ui' },
      },
    ],
  });
});

test('a module that does not resolve comes once, though the entry and the probe both meet it', async () => {
  const loaded = acmeLoaded();
  const badgeLine = generatedEntry(loaded.kit).lines.Badge ?? 0;
  const text = 'Could not resolve "@acme/ui"';
  const bundler = fakeBundler([
    bundleError('../../../kits/acme/generated/kit.ts', badgeLine, text),
    bundleError(IMPORT_PROBE, 4, text),
  ]);
  assert.deepEqual(await importsStep({ loaded, dir: ACME_CATALOG, bundler }), {
    state: 'failed',
    issues: [
      {
        step: 'imports',
        path: 'components.2.import',
        key: 'checkRule.tool',
        params: { text },
      },
    ],
  });
});

test('errors anywhere else are passed on with their place, at the entry', async () => {
  const loaded = acmeLoaded();
  const bundler = fakeBundler([
    bundleError('../../../../node_modules/@acme/ui/index.js', 7, 'Unexpected "}"'),
    bundleError(IMPORT_PROBE, 1, 'Could not resolve "@kit"'),
    // A line of the entry that is no component's: its style import.
    bundleError(
      '../../../kits/acme/generated/kit.ts',
      99,
      'Could not resolve "@acme/ui/styles.css"',
    ),
    bundleError('', 0, 'The build was stopped'),
  ]);
  const result = await importsStep({ loaded, dir: ACME_CATALOG, bundler });
  assert.equal(result.state, 'failed');
  assert.deepEqual(
    result.issues.map((issue) => [issue.path, issue.key, issue.params.text]),
    [
      [
        'runtime.entry',
        'checkRule.tool',
        'Unexpected "}" (../../../../node_modules/@acme/ui/index.js:7)',
      ],
      ['runtime.entry', 'checkRule.tool', 'Could not resolve "@kit"'],
      [
        'runtime.entry',
        'checkRule.tool',
        'Could not resolve "@acme/ui/styles.css" (../../../kits/acme/generated/kit.ts:99)',
      ],
      ['runtime.entry', 'checkRule.tool', 'The build was stopped'],
    ],
  );
});

test('a built-in kit has no generated lines: an error in its entry stays at the entry', async () => {
  const loaded = tinyLoaded();
  const bundler = fakeBundler([bundleError('tiny/tsx/index.ts', 2, 'Unexpected "<"')]);
  const result = await importsStep({ loaded, dir: ACME_CATALOG, bundler });
  assert.deepEqual(result.issues, [
    {
      step: 'imports',
      path: 'runtime.entry',
      key: 'checkRule.tool',
      params: { text: 'Unexpected "<" (tiny/tsx/index.ts:2)' },
    },
  ]);
  assert.equal(bundler.bundles[0]?.project, undefined);
});
