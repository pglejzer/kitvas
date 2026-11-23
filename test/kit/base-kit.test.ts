import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { cssVarName, requireKit } from '../../src/kit/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';

const dir = join(PLUGIN_ROOT, 'kits', 'base');
const read = (...parts: string[]): string => readFileSync(join(dir, ...parts), 'utf8');
const base = requireKit(createFolderKitStore(join(PLUGIN_ROOT, 'kits')), 'base');

test('the Base kit is valid and has its 12 components', () => {
  assert.deepEqual(base.issues, []);
  assert.deepEqual(
    base.kit.components.map((component) => component.name),
    [
      'Button',
      'Input',
      'Select',
      'Checkbox',
      'Card',
      'Text',
      'Heading',
      'Stack',
      'Grid',
      'Icon',
      'Badge',
      'Dialog',
    ],
  );
  assert.equal(base.tokens.length, 45);
});

test('every catalog component has a source file, an export and an example that uses it', () => {
  const index = read('tsx', 'index.ts');
  const problems: string[] = [];
  for (const component of base.kit.components) {
    const { name, category } = component;
    const file = `tsx/${category}/${name}.tsx`;
    if (!existsSync(join(dir, file))) problems.push(`${name}: no ${file}`);
    if (!new RegExp(`\\b${name}\\b[^;]*from './${category}/${name}\\.tsx'`).test(index)) {
      problems.push(`${name}: not exported from tsx/index.ts`);
    }
    if (component.examples.length === 0) problems.push(`${name}: no example`);
    for (const example of component.examples) {
      if (!example.code.includes(`<${name}`)) {
        problems.push(`${name}: "${example.title}" does not use it`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('styles use only custom properties that are tokens', () => {
  const tokens = new Set(base.tokens.map((token) => cssVarName(token.path)));
  const unknown = new Set<string>();
  const files = readdirSync(join(dir, 'scss'), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.scss'))
    .map((file) => file.replaceAll('\\', '/'));
  assert.ok(files.length > 1);
  for (const file of files) {
    for (const match of read('scss', file).matchAll(/--kit-[a-z0-9-]+/g)) {
      if (!tokens.has(match[0])) unknown.add(`${file}: ${match[0]}`);
    }
  }
  assert.deepEqual([...unknown], []);
});

test('the icon names of the catalog are the icons that are drawn', () => {
  const source = read('tsx', 'display', 'icon-paths.ts');
  const drawn = [...source.matchAll(/^\s*'?([a-z-]+)'?:\s*'M/gm)]
    .map((match) => match[1] ?? '')
    .sort();
  assert.ok(base.kit.icons?.source === 'component');
  assert.deepEqual(drawn, [...base.kit.icons.names].sort());
  const nameProp = base.kit.components
    .find((component) => component.name === 'Icon')
    ?.props.find((prop) => prop.name === 'name');
  assert.deepEqual(nameProp?.values, base.kit.icons.names);
});

test('components and styles sit in a folder per category, never loose', () => {
  const categories = new Set<string>(base.kit.components.map((component) => component.category));
  const problems: string[] = [];
  const entries = { tsx: 'index.ts', scss: 'index.scss' };
  for (const [folder, entry] of Object.entries(entries)) {
    for (const item of readdirSync(join(dir, folder), { withFileTypes: true })) {
      if (item.isFile() && item.name !== entry) problems.push(`${folder}/${item.name} is loose`);
      if (item.isDirectory() && item.name !== 'core' && !categories.has(item.name)) {
        problems.push(`${folder}/${item.name}/ is not a category`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
