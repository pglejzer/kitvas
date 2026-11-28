import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Kit, ORIGINAL_PATH, parseKit } from '../../src/kit/domain/contract.ts';
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
import { type Json, npmKitJson, repoKitJson, webKitJson } from './helpers/project-kit.ts';

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

/** The web kit with its source changed to `code`, for the rules of that source. */
const codeKitJson = (): Json => ({
  ...webKitJson(),
  source: { type: 'code', path: 'src/app/ui' },
});

type RawComponent = { project?: unknown; examples: { original?: string; around?: unknown }[] };

const componentsOf = (raw: Json): RawComponent[] => raw.components as RawComponent[];

test('a code source keeps its path, styles and urls', () => {
  assert.deepEqual(kitOf(codeKitJson()).source, {
    type: 'code',
    path: 'src/app/ui',
    styles: [],
    urls: [],
  });
  for (const path of ['src/../ui', '../ui', 'node_modules/ui', 'src/node_modules/ui']) {
    assert.throws(() => kitOf({ ...codeKitJson(), source: { type: 'code', path } }), path);
  }
});

test('a code source may say what the app has around every component', () => {
  const withShell = (shell: Json): Json => ({
    ...codeKitJson(),
    source: { type: 'code', path: 'src/app/ui', shell },
  });
  const source = kitOf(
    withShell({ html: { 'data-theme': 'light' }, wrappers: [{ attributes: { id: 'app' } }] }),
  ).source;
  assert.deepEqual(source.type === 'code' ? source.shell : undefined, {
    html: { 'data-theme': 'light' },
    body: {},
    wrappers: [{ tag: 'div', attributes: { id: 'app' } }],
  });
  assert.doesNotThrow(() => kitOf(withShell({ wrappers: [{ tag: 'acme-shell' }] })));

  const wrappers = (count: number): Json[] => Array.from({ length: count }, () => ({}));
  const refused: [string, Json][] = [
    ['a handler on html', { html: { onload: 'go()' } }],
    ['a handler on body, in capitals', { body: { ONCLICK: 'go()' } }],
    ['a handler on a wrapper', { wrappers: [{ attributes: { onclick: 'go()' } }] }],
    ['a script as a wrapper', { wrappers: [{ tag: 'script' }] }],
    ['a style as a wrapper', { wrappers: [{ tag: 'style' }] }],
    ['an iframe as a wrapper', { wrappers: [{ tag: 'iframe' }] }],
    ['seven wrappers', { wrappers: wrappers(7) }],
    ['an unknown part', { head: {} }],
  ];
  for (const [name, shell] of refused) assert.throws(() => kitOf(withShell(shell)), name);
  assert.doesNotThrow(() => kitOf(withShell({ wrappers: wrappers(6) })));
});

test('project, original and around are refused outside a code kit', () => {
  const raw = webKitJson();
  at(componentsOf(raw), 0).project = { files: ['src/button.js'] };
  assert.deepEqual(sourceIssues(kitOf(raw)), [
    {
      path: 'components.Button.project',
      key: 'kitIssue.onlyCodeKit',
      params: { component: 'Button', field: 'project' },
    },
  ]);

  const withOriginal = webKitJson();
  at(at(componentsOf(withOriginal), 0).examples, 0).original = 'originals/Button.1.html';
  at(at(componentsOf(withOriginal), 0).examples, 0).around = [{ attributes: { class: 'page' } }];
  assert.deepEqual(sourceIssues(kitOf(withOriginal)), [
    {
      path: 'components.Button.examples.0.original',
      key: 'kitIssue.onlyCodeKit',
      params: { component: 'Button', field: 'original' },
    },
    {
      path: 'components.Button.examples.0.around',
      key: 'kitIssue.onlyCodeKit',
      params: { component: 'Button', field: 'around' },
    },
  ]);

  const code = codeKitJson();
  at(componentsOf(code), 0).project = { files: ['src/button.js'] };
  at(at(componentsOf(code), 0).examples, 0).original = 'originals/Button.1.html';
  assert.deepEqual(sourceIssues(kitOf(code)), []);
});

test('project names files or a package, never both', () => {
  const issuesOf = (project: unknown): unknown[] => {
    const raw = codeKitJson();
    at(componentsOf(raw), 0).project = project;
    return sourceIssues(kitOf(raw));
  };
  const one = {
    path: 'components.Button.project',
    key: 'kitIssue.originOneOf',
    params: { component: 'Button' },
  };
  assert.deepEqual(issuesOf({ files: ['src/button.js'], package: '@acme/ui' }), [one]);
  assert.deepEqual(issuesOf({ name: 'app-button' }), [one]);
  assert.deepEqual(issuesOf({ files: ['src/button.js'] }), []);
  assert.deepEqual(issuesOf({ package: '@acme/ui', name: 'Button' }), []);
});

test("an original's path", () => {
  assert.equal(ORIGINAL_PATH.test('originals/Button.1.html'), true);
  assert.equal(ORIGINAL_PATH.test('originals/Card_x-y.12.html'), true);
  for (const bad of ['originals/../x.html', 'originals/Button.html', 'originals/Button.0.html']) {
    assert.equal(ORIGINAL_PATH.test(bad), false, bad);
  }
  const raw = codeKitJson();
  at(at(componentsOf(raw), 0).examples, 0).original = 'originals/../x.html';
  assert.throws(() => kitOf(raw));
});

test('code:<folder> is a source flag', () => {
  assert.deepEqual(parseSourceFlag('code:.\\src\\app\\ui\\'), {
    type: 'code',
    value: 'src/app/ui',
  });
  assert.equal(parseSourceFlag('code:'), undefined);
  assert.equal(parseSourceFlag('code:./'), undefined);
});

test('a code kit may import a project style file, and nothing else of the project', () => {
  const raw = codeKitJson();
  const runtime = raw.runtime as { styles: { imports: string[] }; providers?: unknown };
  runtime.styles.imports = ['src/styles/icons.css'];
  const kit = kitOf(raw);
  assert.deepEqual(
    importTargets(kit)
      .filter((target) => target.at.startsWith('runtime.styles'))
      .map((target) => [target.at, target.kind]),
    [['runtime.styles.imports.0', 'project']],
  );
  assert.deepEqual(sourceIssues(kit), []);

  runtime.providers = [{ import: { from: 'src/theme', name: 'T' } }];
  assert.deepEqual(sourceIssues(kitOf(raw)), [
    {
      path: 'runtime.providers.0.import.from',
      key: 'kitIssue.importNotKitPath',
      params: { component: 'T', from: 'src/theme' },
    },
  ]);
  // A web kit still names no project path in a style import.
  const web = webKitJson();
  (web.runtime as { styles: { imports: string[] } }).styles.imports = ['src/styles/icons.css'];
  assert.equal(sourceIssues(kitOf(web)).length, 1);
});
