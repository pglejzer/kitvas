import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitWriter } from '../../src/kit/adapters/folder-writer.ts';
import {
  GENERATED_ENTRY,
  generatedEntry,
  type Kit,
  type KitWriter,
  type LoadedKit,
  parseKit,
  syncGeneratedEntry,
} from '../../src/kit/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { tinyKitJson } from '../helpers/kit/kits.ts';
import { tempDir } from '../helpers/tmp.ts';
import { type Json, npmKitJson, repoKitJson, webKitJson } from './helpers/project-kit.ts';

const HEADER =
  '// Written by kitvas from kit.json; do not edit. "kitvas kit verify" writes it again.';

const kitOf = (raw: Json): Kit => parseKit(raw, String(raw.id));

const loadedOf = (kit: Kit, project: string | undefined, folder = kit.id): LoadedKit => {
  const dir = join('project', '.kitvas', 'kits', folder);
  return {
    kit,
    dir,
    tokens: [],
    issues: [],
    hash: 'hash',
    project,
    cssVarMap: {},
    additions: [],
    additionsDir: undefined,
    entry: join(dir, ...kit.runtime.entry.split('/')),
  };
};

function fakeWriter() {
  const files = new Map<string, string>();
  const writes: string[] = [];
  const writer: KitWriter = {
    readText: (id, relPath) => files.get(`${id}/${relPath}`),
    writeText: (id, relPath, text) => {
      files.set(`${id}/${relPath}`, text);
      writes.push(`${id}/${relPath}`);
    },
    writeBytes: (id, relPath) => {
      files.set(`${id}/${relPath}`, '<bytes>');
    },
    remove: (id, relPath) => {
      files.delete(`${id}/${relPath}`);
    },
    writeAddition: () => {
      throw new Error('no additions here');
    },
    exportFiles: () => {
      throw new Error('no export here');
    },
  };
  return { writer, files, writes };
}

test('an npm kit re-exports from its packages, after its global styles', () => {
  assert.equal(GENERATED_ENTRY, 'generated/kit.ts');
  assert.deepEqual(generatedEntry(kitOf(npmKitJson())), {
    text: [
      HEADER,
      'import "@acme/ui/styles.css";',
      'import "../../../../src/theme/fonts.css";',
      'export { Button } from "@acme/ui";',
      'export { default as DatePicker } from "@acme/ui/date";',
      '',
    ].join('\n'),
    lines: { Button: 4, DatePicker: 5 },
  });
});

test('a repo kit re-exports from project paths relative to generated/', () => {
  assert.deepEqual(generatedEntry(kitOf(repoKitJson())), {
    text: [
      HEADER,
      'import "../../../../src/ds/tokens.css";',
      'import "react-day-picker/style.css";',
      'export { Button } from "../../../../src/ds/Button";',
      'export { DsCard as Card } from "../../../../src/ds/card";',
      '',
    ].join('\n'),
    lines: { Button: 4, Card: 5 },
  });
});

test('a written kit re-exports its own files from ../components/', () => {
  assert.deepEqual(generatedEntry(kitOf(webKitJson())), {
    text: [
      HEADER,
      'import "../components/base.css";',
      'export { Button } from "../components/Button";',
      'export { Card } from "../components/Card";',
      '',
    ].join('\n'),
    lines: { Button: 3, Card: 4 },
  });
});

test('a written kit leaves out imports that are not its own files', () => {
  const raw = webKitJson();
  const [button, card] = raw.components as { import: { from: string; name: string } }[];
  assert.ok(button && card);
  button.import = { from: '../../x', name: 'Button' };
  card.import = { from: 'src/ds/Card', name: 'Card' };
  (raw.runtime as { styles: { imports: string[] } }).styles.imports = ['src/theme.css'];
  assert.deepEqual(generatedEntry(kitOf(raw)), { text: `${HEADER}\n`, lines: {} });
});

test('names are quoted unless plain, and imports that do not fit are left out', () => {
  const raw = npmKitJson();
  const base = { category: 'display', description: 'x.', props: [] };
  (raw.components as Json[]).push(
    { ...base, name: 'Badge', import: { from: '@acme/ui', name: 'badge-x' } },
    { ...base, name: 'Chip', import: { from: 'https://cdn.example/chip.js', name: 'Chip' } },
    { ...base, name: 'Button', import: { from: '@acme/other', name: 'Button' } },
    { ...base, name: 'Tag', import: { from: '@acme/ui"; import "evil', name: 'Tag' } },
  );
  (raw.runtime as { styles: { imports: string[] } }).styles.imports = ['../evil.css'];
  const { text, lines } = generatedEntry(kitOf(raw));
  assert.equal(
    text,
    [
      HEADER,
      'export { Button } from "@acme/ui";',
      'export { default as DatePicker } from "@acme/ui/date";',
      'export { "badge-x" as Badge } from "@acme/ui";',
      '',
    ].join('\n'),
  );
  assert.deepEqual(lines, { Button: 2, DatePicker: 3, Badge: 4 });
});

test('a kit without components or styles is only the header', () => {
  // The contract wants a component; the skeleton of `kit new` has none, so it is built by hand.
  const kit = kitOf(npmKitJson());
  const empty: Kit = {
    ...kit,
    components: [],
    runtime: { ...kit.runtime, styles: { ...kit.runtime.styles, imports: [] } },
  };
  assert.deepEqual(generatedEntry(empty), { text: `${HEADER}\n`, lines: {} });
});

test('sync writes the entry of a project kit only when it is missing or different', () => {
  const { writer, files, writes } = fakeWriter();
  const kit = kitOf(npmKitJson());
  const loaded = loadedOf(kit, 'project');
  assert.equal(syncGeneratedEntry(writer, loaded), true);
  assert.deepEqual(writes, ['acme/generated/kit.ts']);
  assert.equal(files.get('acme/generated/kit.ts'), generatedEntry(kit).text);
  assert.equal(syncGeneratedEntry(writer, loaded), false);
  assert.equal(writes.length, 1);

  const fewer = { ...kit, components: kit.components.slice(0, 1) };
  assert.equal(syncGeneratedEntry(writer, loadedOf(fewer, 'project')), true);
  assert.equal(writes.length, 2);
  assert.equal(files.get('acme/generated/kit.ts'), generatedEntry(fewer).text);
});

test('sync writes into the kit folder, and leaves built-in kits alone', () => {
  const { writer, writes } = fakeWriter();
  const kit = kitOf(npmKitJson());
  assert.equal(syncGeneratedEntry(writer, loadedOf(kit, 'project', 'other')), true);
  assert.deepEqual(writes, ['other/generated/kit.ts']);
  assert.equal(syncGeneratedEntry(writer, loadedOf(kit, undefined)), false);
  assert.equal(syncGeneratedEntry(writer, loadedOf(kitOf(tinyKitJson()), 'project')), false);
  assert.equal(writes.length, 1);
});

test('the folder writer stays inside each kit folder', () => {
  const root = tempDir();
  const writer = createFolderKitWriter(root);
  writer.writeText('acme', GENERATED_ENTRY, 'x');
  assert.equal(readFileSync(join(root, 'acme', 'generated', 'kit.ts'), 'utf8'), 'x');
  assert.equal(writer.readText('acme', GENERATED_ENTRY), 'x');
  assert.equal(writer.readText('acme', 'kit.json'), undefined);
  assert.equal(writer.readText('acme', 'generated'), undefined);
  assert.equal(writer.readText('acme', '../other/kit.json'), undefined);
  const refused = (error: unknown) => error instanceof KitvasError && error.code === 'KIT_INVALID';
  assert.throws(() => writer.writeText('acme', '../escape.txt', 'x'), refused);
  assert.throws(() => writer.writeText('Not An Id', 'kit.json', 'x'), refused);
  assert.equal(existsSync(join(root, 'escape.txt')), false);
});

test('the folder writer writes bytes and removes files and folders, only inside a kit', () => {
  const root = tempDir();
  const writer = createFolderKitWriter(root);
  writer.writeBytes('acme', 'source/images/a/shot.png', Uint8Array.from([1, 2, 3, 255]));
  const shot = join(root, 'acme', 'source', 'images', 'a', 'shot.png');
  assert.deepEqual([...readFileSync(shot)], [1, 2, 3, 255]);
  writer.writeText('acme', 'kit.json', '{}');
  writer.remove('acme', 'source/images/a/shot.png');
  assert.equal(existsSync(shot), false);
  writer.remove('acme', 'source/images');
  assert.equal(existsSync(join(root, 'acme', 'source', 'images')), false);
  // Nothing to remove is not an error, and the kit's other files stay.
  writer.remove('acme', 'source/images');
  assert.equal(existsSync(join(root, 'acme', 'kit.json')), true);
  const refused = (error: unknown) => error instanceof KitvasError && error.code === 'KIT_INVALID';
  assert.throws(() => writer.writeBytes('acme', '../escape.png', Uint8Array.of(1)), refused);
  assert.throws(() => writer.remove('acme', '../other'), refused);
  // The kit folder itself is not a path inside it.
  assert.throws(() => writer.remove('acme', '.'), refused);
  assert.equal(existsSync(join(root, 'acme')), true);
});
