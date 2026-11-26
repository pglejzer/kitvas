import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitWriter } from '../../src/kit/adapters/folder-writer.ts';
import {
  type KitWriter,
  loadKit,
  type MergeDeps,
  type MergeResult,
  mergeKit,
} from '../../src/kit/index.ts';
import { KitvasError, projectKitsDir } from '../../src/shared/index.ts';
import { FIXTURE_KITS } from '../helpers/kits.ts';
import {
  ACME_MAP,
  ACME_TOKENS,
  type Json,
  layeredStore,
  npmKitJson,
  tempProject,
  webKitJson,
  writeProjectKit,
  writeText,
} from './helpers/project-kit.ts';

const KIT_FILES = {
  'json/tokens.json': JSON.stringify(ACME_TOKENS),
  'json/css-var-map.json': JSON.stringify(ACME_MAP),
};

/** A component entry as a learner writes it into a fragment. */
const component = (name: string, from = '@acme/ui', extra: Json = {}): Json => ({
  name,
  category: 'display',
  description: `${name} of the fragment.`,
  import: { from, name },
  props: [{ name: 'children', type: 'node' }],
  ...extra,
});

const json = (value: unknown): string => JSON.stringify(value, null, 2);

/** The component names of the kit as `loadKit` reads it now. */
const loadedNames = (project: string, id: string): string[] =>
  loadKit(layeredStore(project), id).kit.components.map((entry) => entry.name);

/** Each issue of a merge as its fragment, its place and its message key. */
const places = (result: MergeResult): string[][] =>
  result.issues.map((issue) => [issue.fragment, issue.path, issue.key]);

/** A project with the npm kit `acme` (or `kitJson`) and the fragments `parts` by name. */
function setup(parts: Record<string, string> = {}, kitJson: Json = npmKitJson()) {
  const dir = tempProject();
  const files: Record<string, string> = { ...KIT_FILES };
  for (const [name, text] of Object.entries(parts)) files[`parts/${name}`] = text;
  const kitDir = writeProjectKit(dir, kitJson, files);
  const deps: MergeDeps = {
    kits: layeredStore(dir),
    kitWriter: createFolderKitWriter(projectKitsDir(dir)),
  };
  const kitText = (): string => readFileSync(join(kitDir, 'kit.json'), 'utf8');
  return { dir, kitDir, deps, kitText, id: String(kitJson.id) };
}

test('good fragments go into kit.json: replaced in place, added at the end, parts/ removed', () => {
  const button = component('Button', '@acme/ui', { description: 'The better button.' });
  const { kitDir, deps, kitText, dir, id } = setup({
    'inputs.json': json({ components: [component('TextField'), button] }),
    'display.json': json({
      components: [component('Badge')],
      gaps: [{ path: 'Badge.props.sx', reason: 'unsupported' }],
    }),
  });
  const result = mergeKit(deps, id);
  assert.deepEqual(result, {
    id: 'acme',
    merged: true,
    added: ['Badge', 'TextField'],
    replaced: ['Button'],
    components: 4,
    gaps: 1,
    issues: [],
  });
  assert.equal(existsSync(join(kitDir, 'parts')), false);
  const written = JSON.parse(kitText()) as Json;
  assert.deepEqual(written.gaps, [{ path: 'Badge.props.sx', reason: 'unsupported' }]);
  assert.ok(kitText().endsWith('}\n'));
  assert.deepEqual(loadedNames(dir, id), ['Button', 'DatePicker', 'Badge', 'TextField']);
  const loaded = loadKit(layeredStore(dir), id);
  assert.equal(loaded.kit.components[0]?.description, 'The better button.');
  assert.deepEqual(loaded.issues, []);
});

test('the skeleton of kit new, with no component yet, takes its components from fragments', () => {
  const skeleton = { ...npmKitJson(), components: [], gaps: [] };
  const parts = { 'all.json': json({ components: [component('Button')] }) };
  const { deps, dir, id } = setup(parts, skeleton);
  assert.equal(mergeKit(deps, id).merged, true);
  assert.deepEqual(loadedNames(dir, id), ['Button']);
});

test('one wrong fragment and nothing is written: kit.json and parts/ stay as they were', () => {
  const { kitDir, deps, kitText, id } = setup({
    'display.json': json({ components: [component('Badge')] }),
    'inputs.json': json({
      components: [component('TextField', '@acme/ui', { examples: [{ code: '<TextField />' }] })],
    }),
  });
  const before = kitText();
  const result = mergeKit(deps, id);
  assert.equal(result.merged, false);
  assert.deepEqual(places(result), [
    ['inputs', 'components.0.examples.0.title', 'kitIssue.fragmentContract'],
    ['inputs', 'components.0.examples.0.imports', 'kitIssue.fragmentContract'],
  ]);
  assert.equal('components' in result, false);
  assert.equal(kitText(), before);
  assert.equal(existsSync(join(kitDir, 'parts', 'display.json')), true);
});

test('a name in two fragments, a stray file and text that is no JSON are each an issue', () => {
  const { deps, kitText, id } = setup({
    'actions.json': json({ components: [component('Link')] }),
    'more.json': json({ components: [component('Link')] }),
    'broken.json': '{ "components": ',
    'notes.md': 'what is left',
  });
  const before = kitText();
  assert.deepEqual(places(mergeKit(deps, id)), [
    ['', '', 'kitIssue.fragmentFile'],
    ['broken', '', 'kitIssue.fragmentNotJson'],
    ['more', 'components.0.name', 'kitIssue.fragmentNameTwice'],
  ]);
  assert.equal(kitText(), before);
});

test('no fragments: nothing merged, the count of components as it is', () => {
  const { kitDir, deps, kitText, id } = setup();
  const before = kitText();
  assert.deepEqual(mergeKit(deps, id), { id, merged: false, components: 2, issues: [] });
  mkdirSync(join(kitDir, 'parts'));
  assert.deepEqual(mergeKit(deps, id), { id, merged: false, components: 2, issues: [] });
  assert.equal(kitText(), before);
});

test('a writer that cannot list folders finds no fragments', () => {
  const { deps, id } = setup({ 'all.json': json({ components: [component('Link')] }) });
  const { listFolder: _unused, ...rest } = deps.kitWriter;
  const plain: KitWriter = rest;
  assert.equal(mergeKit({ ...deps, kitWriter: plain }, id).merged, false);
});

test('a built-in kit is refused, a missing kit is not found', () => {
  const dir = tempProject();
  const deps: MergeDeps = {
    kits: layeredStore(dir, FIXTURE_KITS),
    kitWriter: createFolderKitWriter(projectKitsDir(dir)),
  };
  assert.throws(
    () => mergeKit(deps, 'tiny'),
    (error) => error instanceof KitvasError && error.code === 'KIT_SOURCE_INVALID',
  );
  assert.throws(
    () => mergeKit(deps, 'nope'),
    (error) => error instanceof KitvasError && error.code === 'KIT_NOT_FOUND',
  );
});

test('a kit.json whose components are not a list is refused before anything is read', () => {
  const { deps, id } = setup({}, { ...npmKitJson(), components: { Button: {} } });
  assert.throws(
    () => mergeKit(deps, id),
    (error) => error instanceof KitvasError && error.code === 'KIT_INVALID',
  );
});

test('parts/ is no part of a kit: loading and the hash leave it out', () => {
  const npm = setup();
  const before = loadKit(layeredStore(npm.dir), npm.id);
  writeText(join(npm.kitDir, 'parts', 'inputs.json'), json({ components: [component('Link')] }));
  const after = loadKit(layeredStore(npm.dir), npm.id);
  assert.equal(after.hash, before.hash);
  assert.deepEqual(
    after.kit.components.map((entry) => entry.name),
    before.kit.components.map((entry) => entry.name),
  );

  // A written kit hashes its components/ folder, never parts/.
  const web = setup({}, webKitJson());
  writeText(join(web.kitDir, 'components', 'Button.tsx'), 'export function Button() {}');
  writeText(join(web.kitDir, 'source', 'refs', 'Button.1.png'), 'png');
  const site = loadKit(layeredStore(web.dir), web.id).hash;
  writeText(join(web.kitDir, 'parts', 'cards.json'), json({ components: [] }));
  assert.equal(loadKit(layeredStore(web.dir), web.id).hash, site);
});

test('the folder writer lists a folder of the kit: files with sizes, the rest by name', () => {
  const { kitDir, deps, id } = setup({ 'b.json': '{}', 'a.json': '[1]' });
  mkdirSync(join(kitDir, 'parts', 'nested'));
  assert.deepEqual(deps.kitWriter.listFolder?.(id, 'parts'), {
    files: [
      { name: 'a.json', size: 3 },
      { name: 'b.json', size: 2 },
    ],
    other: ['nested'],
  });
  assert.equal(deps.kitWriter.listFolder?.(id, 'missing'), undefined);
  assert.throws(
    () => deps.kitWriter.listFolder?.(id, '../other'),
    (error) => error instanceof KitvasError && error.code === 'KIT_INVALID',
  );
});
