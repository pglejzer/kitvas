import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Kit, parseKit } from '../../src/kit/domain/contract.ts';
import {
  componentKind,
  importTargets,
  isProjectKit,
  majorVersion,
  moduleKind,
  packageOf,
  parseSourceFlag,
  sourceIssues,
} from '../../src/kit/domain/sources.ts';
import { tinyKitJson } from '../helpers/kit/kits.ts';
import { type Json, npmKitJson, repoKitJson } from './helpers/project-kit.ts';

const kitOf = (raw: Json): Kit => parseKit(raw, String(raw.id));

type Raw = {
  runtime: {
    styles: { imports: string[] };
    providers: {
      import: { from: string; name?: string; default?: boolean };
      props: Record<string, string>;
      bindings: Record<string, { from: string; name: string }>;
    }[];
  };
  components: { import: { from: string } }[];
};

/** A kit made from `raw` after `change`, with the nested parts typed for editing. */
function changed(raw: Json, change: (kit: Raw) => void): Kit {
  change(raw as unknown as Raw);
  return kitOf(raw);
}

function at<T>(items: T[], index: number): T {
  const item = items[index];
  assert.ok(item !== undefined, `nothing at ${index}`);
  return item;
}

test('packageOf keeps the package name of a specifier', () => {
  assert.equal(packageOf('@mui/material/Button'), '@mui/material');
  assert.equal(packageOf('@acme/ui'), '@acme/ui');
  assert.equal(packageOf('clsx/lite'), 'clsx');
  assert.equal(packageOf('react'), 'react');
});

test('majorVersion reads the first number', () => {
  assert.equal(majorVersion('18.3.1'), 18);
  assert.equal(majorVersion('19.0.0-rc.1'), 19);
  assert.equal(majorVersion('latest'), undefined);
});

test('parseSourceFlag reads npm:<package> and repo:<folder>', () => {
  assert.deepEqual(parseSourceFlag('npm:@acme/ui'), { type: 'npm', value: '@acme/ui' });
  assert.deepEqual(parseSourceFlag('repo:src/ds'), { type: 'repo', value: 'src/ds' });
  assert.deepEqual(parseSourceFlag('repo:./src/ds/'), { type: 'repo', value: 'src/ds' });
  assert.deepEqual(parseSourceFlag('repo:src\\components\\ui'), {
    type: 'repo',
    value: 'src/components/ui',
  });
  for (const bad of [undefined, '', 'npm:', 'repo:./', 'git:x', '@acme/ui']) {
    assert.equal(parseSourceFlag(bad), undefined, String(bad));
  }
});

test('only npm and repo kits are project kits', () => {
  assert.equal(isProjectKit(kitOf(npmKitJson())), true);
  assert.equal(isProjectKit(kitOf(repoKitJson())), true);
  assert.equal(isProjectKit(kitOf(tinyKitJson())), false);
});

test('a module is a package when scoped or declared, else a file of the project', () => {
  const kit = kitOf(npmKitJson());
  assert.equal(moduleKind(kit, '@acme/ui/styles.css'), 'package');
  assert.equal(moduleKind(kit, 'react/jsx-runtime'), 'package');
  assert.equal(moduleKind(kit, 'src/theme/fonts.css'), 'project');
  // An unscoped package the kit does not declare reads as a path: runtime.packages decides.
  assert.equal(moduleKind(kit, 'clsx'), 'project');
  assert.equal(moduleKind(kit, '@/components/ui/button'), 'project');
  for (const bad of ['../outside.css', 'https://cdn.example/x.css', '/abs/x.css', 'C:/x.css']) {
    assert.equal(moduleKind(kit, bad), undefined, bad);
  }
});

test('a component imports a package in an npm kit and a project file in a repo kit', () => {
  const npm = kitOf(npmKitJson());
  assert.equal(componentKind(npm, '@acme/ui'), 'package');
  assert.equal(componentKind(npm, 'src/ds/Button'), 'package');
  assert.equal(componentKind(npm, '../x'), undefined);
  // The specifier pattern lets a subpath hold `..`; such an import could leave node_modules.
  assert.equal(componentKind(npm, '@acme/ui/../../../etc/passwd'), undefined);
  const repo = kitOf(repoKitJson());
  assert.equal(componentKind(repo, 'src/ds/Button'), 'project');
  assert.equal(componentKind(repo, '@acme/ui'), undefined);
  assert.equal(componentKind(repo, 'react-day-picker'), undefined);
  assert.equal(componentKind(kitOf(tinyKitJson()), '@kit'), undefined);
});

test('importTargets lists every import of a project kit in kit.json order', () => {
  assert.deepEqual(importTargets(kitOf(npmKitJson())), [
    {
      at: 'components.Button.import.from',
      label: 'Button',
      from: '@acme/ui',
      kind: 'package',
    },
    {
      at: 'components.DatePicker.import.from',
      label: 'DatePicker',
      from: '@acme/ui/date',
      kind: 'package',
    },
    {
      at: 'runtime.providers.0.import.from',
      label: 'AcmeProvider',
      from: '@acme/ui',
      kind: 'package',
    },
    {
      at: 'runtime.providers.0.bindings.theme.from',
      label: 'theme',
      from: 'src/theme',
      kind: 'project',
    },
    {
      at: 'runtime.styles.imports.0',
      label: 'runtime.styles.imports',
      from: '@acme/ui/styles.css',
      kind: 'package',
    },
    {
      at: 'runtime.styles.imports.1',
      label: 'runtime.styles.imports',
      from: 'src/theme/fonts.css',
      kind: 'project',
    },
  ]);
  assert.deepEqual(importTargets(kitOf(tinyKitJson())), []);
});

test('well-formed kits have no source issues', () => {
  assert.deepEqual(sourceIssues(kitOf(npmKitJson())), []);
  assert.deepEqual(sourceIssues(kitOf(repoKitJson())), []);
  assert.deepEqual(sourceIssues(kitOf(tinyKitJson())), []);
});

test('an npm kit imports packages, and generated code gets plain names only', () => {
  const kit = changed(npmKitJson(), (raw) => {
    at(raw.components, 0).import.from = 'https://cdn.example/ui.js';
    raw.runtime.styles.imports[1] = '../x.css';
    const provider = at(raw.runtime.providers, 0);
    provider.import.name = 'Acme.Provider';
    provider.props = { 'data mode': 'light' };
    provider.bindings = { theme: { from: 'src/theme', name: 'the-theme' } };
  });
  assert.deepEqual(sourceIssues(kit), [
    {
      path: 'runtime.providers.0.import.name',
      key: 'kitIssue.nameInvalid',
      params: { name: 'Acme.Provider' },
    },
    {
      path: 'runtime.providers.0.props.data mode',
      key: 'kitIssue.nameInvalid',
      params: { name: 'data mode' },
    },
    {
      path: 'runtime.providers.0.bindings.theme.name',
      key: 'kitIssue.nameInvalid',
      params: { name: 'the-theme' },
    },
    {
      path: 'components.Button.import.from',
      key: 'kitIssue.importNotPackage',
      params: { component: 'Button', from: 'https://cdn.example/ui.js' },
    },
    {
      path: 'runtime.styles.imports.1',
      key: 'kitIssue.importNotPackage',
      params: { component: 'runtime.styles.imports', from: '../x.css' },
    },
  ]);
});

test('a default provider import is not checked by name', () => {
  const kit = changed(npmKitJson(), (raw) => {
    at(raw.runtime.providers, 0).import = { from: '@acme/ui', name: 'not used', default: true };
  });
  assert.deepEqual(sourceIssues(kit), []);
});

test('a repo kit imports its components from paths inside the project', () => {
  const kit = changed(repoKitJson(), (raw) => {
    at(raw.components, 0).import.from = '@acme/ui';
    at(raw.components, 1).import.from = 'src/../../etc/card';
  });
  assert.deepEqual(sourceIssues(kit), [
    {
      path: 'components.Button.import.from',
      key: 'kitIssue.importNotProjectPath',
      params: { component: 'Button', from: '@acme/ui' },
    },
    {
      path: 'components.Card.import.from',
      key: 'kitIssue.importNotProjectPath',
      params: { component: 'Card', from: 'src/../../etc/card' },
    },
  ]);
});
