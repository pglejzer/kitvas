import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraft } from '../../src/drafts/index.ts';
import { readPalette } from '../../src/edit/app/palette.ts';
import type { KitStore } from '../../src/kit/index.ts';
import { NOW, TINY, tempDrafts, writeVersionFiles } from '../helpers/drafts.ts';
import { builtinKits } from '../helpers/kits.ts';

const BASE = { id: 'base', version: '1.0.0', hash: 'b'.repeat(64) };

const layout = (id: string, purpose: string): string =>
  `# Layout: Shop\n\n## ${id}\nPurpose: ${purpose}\nComponents: Stack\n`;

function drafts() {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  createDraft(store, { slug: 'landing', title: 'Landing', kit: BASE, now: NOW });
  createDraft(store, { slug: 'other', title: 'Other', kit: TINY, now: NOW });
  writeVersionFiles(store, 'shop', 1, { 'md/layout.md': layout('cart', 'Show the cart.') });
  writeVersionFiles(store, 'landing', 1, { 'md/layout.md': layout('hero', 'Say hello.') });
  writeVersionFiles(store, 'other', 1, { 'md/layout.md': layout('tiny-hero', 'Another kit.') });
  return store;
}

test('the palette lists the base kit components with category, children and examples', () => {
  const palette = readPalette({ drafts: drafts(), kits: builtinKits() }, 'shop');
  const names = palette.components.map((component) => component.name);
  assert.ok(names.includes('Button'));
  assert.ok(names.includes('Card'));
  const button = palette.components.find((component) => component.name === 'Button');
  assert.equal(button?.category, 'action');
  assert.equal(button?.accepts, true);
  assert.equal(button?.parent, null);
  assert.equal(button?.examples[0]?.code, '<Button>Save</Button>');
  const input = palette.components.find((component) => component.name === 'Input');
  assert.equal(input?.accepts, false);
});

test('required props are those with no default, and children never counts', () => {
  const palette = readPalette({ drafts: drafts(), kits: builtinKits() }, 'shop');
  const input = palette.components.find((component) => component.name === 'Input');
  assert.deepEqual(input?.required, ['label']);
  const button = palette.components.find((component) => component.name === 'Button');
  assert.deepEqual(button?.required, []);
});

test('the palette carries the kit icons with their component', () => {
  const palette = readPalette({ drafts: drafts(), kits: builtinKits() }, 'shop');
  assert.equal(palette.icons?.component, 'Icon');
  assert.ok(palette.icons?.names.includes('check'));
});

test('sections come from other drafts with the same kit only', () => {
  const palette = readPalette({ drafts: drafts(), kits: builtinKits() }, 'shop');
  assert.deepEqual(palette.sections, [{ slug: 'landing', section: 'hero', purpose: 'Say hello.' }]);
});

test('a part is listed after its root with the root as its parent', () => {
  const real = builtinKits();
  const kits: KitStore = {
    ...real,
    read(id) {
      const files = real.read(id);
      if (!files || typeof files.kitJson !== 'object' || files.kitJson === null) return files;
      const kitJson: { components?: { name: string; parts?: string[] }[] } = { ...files.kitJson };
      kitJson.components = (kitJson.components ?? []).map((component) =>
        component.name === 'Card' ? { ...component, parts: ['Header'] } : component,
      );
      return { ...files, kitJson };
    },
  };
  const palette = readPalette({ drafts: drafts(), kits }, 'shop');
  const names = palette.components.map((component) => component.name);
  assert.equal(names[names.indexOf('Card') + 1], 'Card.Header');
  const part = palette.components.find((component) => component.name === 'Card.Header');
  assert.equal(part?.parent, 'Card');
  assert.equal(part?.category, 'layout');
});
