// The project's additions to a kit (C7): the merge, the generated entries, the folder writer and
// the export. The builds and `kit verify` over additions are in test/render and test/checks/verify.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { createFolderKitWriter } from '../../src/kit/adapters/folder-writer.ts';
import { createLayeredKitStore } from '../../src/kit/adapters/layered-store.ts';
import {
  entrySource,
  generatedEntry,
  type Kit,
  loadKit,
  mergeAdditions,
  NO_ADDITIONS,
  type ProjectFiles,
  parseAdditions,
  parseKit,
  projectIssues,
  requireKit,
  syncGeneratedEntry,
} from '../../src/kit/index.ts';
import { projectKitsDir } from '../../src/shared/index.ts';
import { FIXTURE_KITS, tinyKitJson } from '../helpers/kit/kits.ts';
import { tempDir } from '../helpers/tmp.ts';
import {
  additionsProject,
  refused,
  STAR_TSX,
  slashes,
  star,
  starFile,
} from './helpers/additions.ts';
import {
  ACME_MAP,
  ACME_TOKENS,
  layeredStore,
  npmKitJson,
  tempProject,
  writeProjectKit,
} from './helpers/project-kit.ts';

const HEADER =
  '// Written by kitvas from kit.json; do not edit. "kitvas kit verify" writes it again.';

const tiny = (): Kit => parseKit(tinyKitJson(), 'tiny');
const names = (kit: Kit): string[] => kit.components.map((component) => component.name);
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

test('additions are merged after the kit own components', () => {
  const merged = mergeAdditions(tiny(), { schemaVersion: 1, components: [star()] });
  assert.deepEqual(names(merged.kit), ['Button', 'Icon', 'Star']);
  assert.deepEqual(merged.kit.components[2], star());
  assert.deepEqual(merged.additions, ['Star']);
  assert.deepEqual(merged.issues, []);
});

test('no additions leave the kit as it is', () => {
  const merged = mergeAdditions(tiny(), NO_ADDITIONS);
  assert.deepEqual(merged.kit, tiny());
  assert.deepEqual(merged.additions, []);
  assert.deepEqual(merged.issues, []);
});

test('a name the kit has, a repeated name or a foreign import is an issue, never a merge', () => {
  const button = star({ name: 'Button', import: { from: 'components/Button', name: 'Button' } });
  const moon = star({ name: 'Moon', import: { from: '@acme/ui', name: 'Moon' } });
  const merged = mergeAdditions(tiny(), {
    schemaVersion: 1,
    components: [button, star(), star(), moon],
  });
  assert.deepEqual(names(merged.kit), ['Button', 'Icon', 'Star']);
  // The kit's own Button is still the kit's.
  assert.equal(merged.kit.components[0]?.import.from, '@kit');
  assert.deepEqual(merged.additions, ['Star']);
  assert.deepEqual(merged.issues, [
    {
      path: 'additions.Button',
      key: 'kitIssue.additionExists',
      params: { kit: 'tiny', name: 'Button' },
    },
    {
      path: 'additions.Star',
      key: 'kitIssue.additionExists',
      params: { kit: 'tiny', name: 'Star' },
    },
    {
      path: 'additions.Moon.import.from',
      key: 'kitIssue.additionImport',
      params: { component: 'Moon', from: '@acme/ui' },
    },
  ]);
});

test('additions.json is read with the kit contract and says where it is refused', () => {
  assert.deepEqual(parseAdditions({ schemaVersion: 1, components: [] }), {
    additions: NO_ADDITIONS,
  });
  assert.deepEqual(parseAdditions(null), { at: 'additions.json' });
  assert.deepEqual(parseAdditions({ schemaVersion: 2, components: [] }), { at: 'schemaVersion' });
  assert.deepEqual(
    parseAdditions({ schemaVersion: 1, components: [{ ...star(), category: 'x' }] }),
    {
      at: 'components.0.category',
    },
  );
});

test('the entry of a project kit exports each addition from its file, after its own', () => {
  const own = parseKit(npmKitJson(), 'acme');
  const { kit } = mergeAdditions(own, { schemaVersion: 1, components: [star()] });
  assert.deepEqual(generatedEntry(kit, { names: ['Star'], dir: '../../../additions/acme/' }), {
    text: [
      HEADER,
      'import "@acme/ui/styles.css";',
      'import "../../../../src/theme/fonts.css";',
      'export { Button } from "@acme/ui";',
      'export { default as DatePicker } from "@acme/ui/date";',
      'export { Star } from "../../../additions/acme/components/Star";',
      '',
    ].join('\n'),
    lines: { Button: 4, DatePicker: 5, Star: 6 },
  });
  // Without additions the entry is the one it always was.
  assert.deepEqual(generatedEntry(own, { names: [], dir: '../' }), generatedEntry(own));
});

test('the entry of a built-in kit with additions re-exports the kit and adds its additions', () => {
  const { kit } = mergeAdditions(tiny(), { schemaVersion: 1, components: [star()] });
  const base = '/plugin/kits/tiny/tsx/index.ts';
  assert.deepEqual(generatedEntry(kit, { names: ['Star'], dir: '../', base }), {
    text: [
      HEADER,
      'export * from "/plugin/kits/tiny/tsx/index.ts";',
      'export { Star } from "../components/Star";',
      '',
    ].join('\n'),
    lines: { Star: 3 },
  });
  assert.deepEqual(generatedEntry(tiny(), { names: [], dir: '../', base }), {
    text: `${HEADER}\nexport * from "/plugin/kits/tiny/tsx/index.ts";\n`,
    lines: {},
  });
});

test('an addition is written with its file, merged by loadKit, and changes the hash', () => {
  const shop = additionsProject();
  const dir = shop.additionsDir('tiny');
  const before = loadKit(shop.kits, 'tiny');
  assert.deepEqual([before.additions, before.additionsDir], [[], undefined]);
  // Without additions the layered store gives the kit the hash it always had.
  assert.equal(before.hash, loadKit(createFolderKitStore(FIXTURE_KITS), 'tiny').hash);

  shop.writer.writeAddition('tiny', star(), [starFile()], false);
  assert.equal(readFileSync(join(dir, 'components', 'Star.tsx'), 'utf8'), STAR_TSX);
  assert.deepEqual(readJson(join(dir, 'additions.json')), {
    schemaVersion: 1,
    components: [star()],
  });

  const loaded = loadKit(shop.kits, 'tiny');
  assert.deepEqual(names(loaded.kit), ['Button', 'Icon', 'Star']);
  assert.deepEqual(loaded.additions, ['Star']);
  assert.deepEqual(loaded.issues, []);
  assert.equal(loaded.additionsDir, dir);
  // A built-in kit is never written to: its `@kit` is an entry in the additions folder.
  assert.equal(loaded.entry, join(dir, 'generated', 'kit.ts'));
  assert.equal(loaded.dir, join(FIXTURE_KITS, 'tiny'));
  assert.notEqual(loaded.hash, before.hash);
});

test('only a store that knows the project reads additions, and only of a kit id', () => {
  const shop = additionsProject();
  assert.equal(shop.kits.readAdditions?.('tiny'), undefined);
  shop.writer.writeAddition('tiny', star(), [starFile()], false);
  assert.deepEqual(shop.kits.readAdditions?.('tiny'), {
    json: { schemaVersion: 1, components: [star()] },
    dir: shop.additionsDir('tiny'),
  });
  assert.equal(shop.kits.readAdditions?.('../tiny'), undefined);
  const builtinOnly = createLayeredKitStore(createFolderKitStore(FIXTURE_KITS), undefined);
  assert.equal(builtinOnly.readAdditions?.('tiny'), undefined);
  assert.equal(createFolderKitStore(FIXTURE_KITS).readAdditions, undefined);
});

test('sync writes the additions entry of a built-in kit, once', () => {
  const shop = additionsProject();
  shop.writer.writeAddition('tiny', star(), [starFile()], false);
  const loaded = loadKit(shop.kits, 'tiny');
  const own = slashes(join(FIXTURE_KITS, 'tiny', 'tsx', 'index.ts'));
  const text = [
    HEADER,
    `export * from ${JSON.stringify(own)};`,
    'export { Star } from "../components/Star";',
    '',
  ].join('\n');
  assert.equal(entrySource(loaded)?.text, text);
  assert.equal(syncGeneratedEntry(shop.writer, loaded), true);
  assert.equal(readFileSync(loaded.entry, 'utf8'), text);
  assert.equal(syncGeneratedEntry(shop.writer, loaded), false);
  // A built-in kit without additions has no entry of kitvas's.
  assert.equal(entrySource(loadKit(layeredStore(tempProject()), 'tiny')), undefined);
});

test('a project kit exports its additions from its own generated entry; the project checks skip them', () => {
  const shop = additionsProject();
  writeProjectKit(shop.project, npmKitJson(), {
    'json/tokens.json': JSON.stringify(ACME_TOKENS),
    'json/css-var-map.json': JSON.stringify(ACME_MAP),
  });
  shop.writer.writeAddition('acme', star(), [starFile()], false);
  const loaded = loadKit(shop.kits, 'acme');
  const kitDir = join(projectKitsDir(shop.project), 'acme');
  assert.deepEqual(names(loaded.kit), ['Button', 'DatePicker', 'Star']);
  assert.equal(loaded.entry, join(kitDir, 'generated', 'kit.ts'));
  assert.ok(syncGeneratedEntry(shop.writer, loaded));
  const text = readFileSync(join(kitDir, 'generated', 'kit.ts'), 'utf8');
  assert.equal(
    text.split('\n').at(-2),
    'export { Star } from "../../../additions/acme/components/Star";',
  );
  assert.equal(entrySource(loaded)?.lines.Star, text.split('\n').length - 1);

  // `components/Star` is the addition's own file, not a package the project has to install.
  const files: ProjectFiles = {
    exists: () => true,
    realInside: () => true,
    packageVersion: (name) => (name === '@acme/ui' || name === 'react' ? '19.3.1' : undefined),
  };
  assert.deepEqual(projectIssues(files, loaded), []);
});

test('ADDITION_EXISTS for a name the kit has, kitvas UI Button included, even with replace', () => {
  const shop = additionsProject();
  const button = star({ name: 'Button', import: { from: 'components/Button', name: 'Button' } });
  const file = { path: 'components/Button.tsx', text: 'export function Button() {}\n' };
  for (const replace of [false, true]) {
    assert.throws(
      () => shop.writer.writeAddition('tiny', button, [file], replace),
      refused('ADDITION_EXISTS', { kit: 'tiny', name: 'Button' }),
    );
  }
  assert.equal(existsSync(shop.additionsDir('tiny')), false);

  // The writer `src/main.ts` makes reads the kits shipped with the plugin: kitvas UI has a Button.
  const project = tempProject();
  const writer = createFolderKitWriter(projectKitsDir(project));
  for (const replace of [false, true]) {
    assert.throws(
      () => writer.writeAddition('kitvas-ui', button, [file], replace),
      refused('ADDITION_EXISTS', { kit: 'kitvas-ui', name: 'Button' }),
    );
  }
  assert.equal(existsSync(join(project, '.kitvas', 'additions')), false);
});

test('replace replaces an earlier addition in its place, and without it the name is taken', () => {
  const shop = additionsProject();
  const dir = shop.additionsDir('tiny');
  const moon = star({ name: 'Moon', import: { from: 'components/Moon', name: 'Moon' } });
  shop.writer.writeAddition('tiny', star(), [starFile()], false);
  shop.writer.writeAddition('tiny', moon, [{ path: 'components/Moon.tsx', text: 'moon' }], false);

  const again = star({ description: 'A brighter star.' });
  assert.throws(
    () => shop.writer.writeAddition('tiny', again, [starFile('v2')], false),
    refused('ADDITION_EXISTS', { kit: 'tiny', name: 'Star' }),
  );
  assert.equal(readFileSync(join(dir, 'components', 'Star.tsx'), 'utf8'), STAR_TSX);

  shop.writer.writeAddition('tiny', again, [starFile('v2')], true);
  assert.deepEqual(readJson(join(dir, 'additions.json')), {
    schemaVersion: 1,
    components: [again, moon],
  });
  assert.equal(readFileSync(join(dir, 'components', 'Star.tsx'), 'utf8'), 'v2');
  assert.deepEqual(loadKit(shop.kits, 'tiny').additions, ['Star', 'Moon']);
});

test('ADDITION_INVALID for a file outside components/ or an entry the contract refuses', () => {
  const shop = additionsProject();
  for (const path of [
    '../evil.tsx',
    'components/../../evil.tsx',
    'Star.tsx',
    'components',
    join(tempDir(), 'Star.tsx'),
  ]) {
    assert.throws(
      () => shop.writer.writeAddition('tiny', star(), [{ path, text: 'x' }], false),
      refused('ADDITION_INVALID', { name: 'Star', detail: path }),
    );
  }
  assert.throws(
    () => shop.writer.writeAddition('tiny', star({ name: 'star' }), [starFile()], false),
    refused('ADDITION_INVALID', { name: 'star', detail: 'name' }),
  );
  const foreign = star({ import: { from: '@acme/ui', name: 'Star' } });
  assert.throws(
    () => shop.writer.writeAddition('tiny', foreign, [starFile()], false),
    refused('ADDITION_INVALID', { name: 'Star', detail: 'import.from' }),
  );
  assert.throws(
    () => shop.writer.writeAddition('nope', star(), [starFile()], false),
    refused('KIT_NOT_FOUND', { id: 'nope' }),
  );
  // Nothing was written by any of them.
  assert.equal(existsSync(shop.additionsDir('tiny')), false);
  assert.equal(existsSync(join(shop.project, '.kitvas', 'additions', 'evil.tsx')), false);
});

test('a broken additions.json is an issue of the kit and stops the writer', () => {
  const shop = additionsProject();
  const dir = shop.additionsDir('tiny');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'additions.json'), '{not json');
  const loaded = loadKit(shop.kits, 'tiny');
  assert.deepEqual(names(loaded.kit), ['Button', 'Icon']);
  assert.deepEqual(loaded.issues, [
    {
      path: 'additions',
      key: 'kitIssue.additionsInvalid',
      params: { kit: 'tiny', at: 'additions.json' },
    },
  ]);
  assert.throws(() => requireKit(shop.kits, 'tiny'), refused('KIT_INVALID'));
  assert.throws(
    () => shop.writer.writeAddition('tiny', star(), [starFile()], false),
    refused('ADDITION_INVALID', { name: 'Star', detail: 'additions.json' }),
  );
  assert.equal(existsSync(join(dir, 'components')), false);
});

test('export writes plain files, never over one that is there, and nothing outside the folder', () => {
  const shop = additionsProject();
  const out = join(tempDir(), 'out');
  const readme = { path: 'docs/README.md', text: '# Star\n' };
  shop.writer.exportFiles(out, [{ path: 'Star.tsx', text: STAR_TSX }, readme]);
  assert.equal(readFileSync(join(out, 'Star.tsx'), 'utf8'), STAR_TSX);
  assert.equal(readFileSync(join(out, 'docs', 'README.md'), 'utf8'), '# Star\n');

  assert.throws(
    () =>
      shop.writer.exportFiles(out, [
        { path: 'Other.tsx', text: 'x' },
        { path: 'Star.tsx', text: 'changed' },
      ]),
    refused('EXPORT_EXISTS', { path: join(out, 'Star.tsx') }),
  );
  assert.equal(readFileSync(join(out, 'Star.tsx'), 'utf8'), STAR_TSX);
  assert.equal(existsSync(join(out, 'Other.tsx')), false);

  assert.throws(
    () => shop.writer.exportFiles(out, [{ path: '../evil.md', text: 'x' }]),
    refused('ADDITION_INVALID', { name: '../evil.md', detail: out }),
  );
  assert.equal(existsSync(join(out, '..', 'evil.md')), false);

  // Nothing to export is no error and makes no folder.
  const empty = join(tempDir(), 'empty');
  shop.writer.exportFiles(empty, []);
  assert.equal(existsSync(empty), false);
});
