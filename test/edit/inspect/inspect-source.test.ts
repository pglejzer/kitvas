// The Source strip's facts in the inspect answer (plan 18f, task 2; spec S4.6 item 7): the opening
// tag as one line of at most 200 characters, and where the element's class rule starts.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createDraft, type DraftStore } from '../../../src/drafts/index.ts';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import { inspectElement } from '../../../src/edit/app/inspect.ts';
import { lineAt, MAX_SOURCE_TAG, oneLine, sourceOf } from '../../../src/edit/app/inspect-source.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { InspectSchema } from '../../../src/studio/api/edit/edit-schemas.ts';
import { etagOf } from '../../../src/studio/http/etag.ts';
import { NOW, tempDrafts } from '../../helpers/draft/drafts.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';

const BASE = { id: 'kitvas-ui', version: '1.1.0', hash: 'b'.repeat(64) };

const TSX = [
  "import { Button } from '@kit';",
  '',
  'export function Pricing() {',
  '  return (',
  '    <section className="pricing">',
  '      <Button',
  '        variant="primary"',
  '        size="lg"',
  '      >',
  '        Buy',
  '      </Button>',
  '      <p>Cancel whenever you like.</p>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

const SCSS = [
  '// The pricing section.',
  '',
  '.pricing {',
  '  padding: var(--kit-space-16);',
  '}',
  '',
  '.pricing {',
  '  gap: var(--kit-space-12);',
  '}',
  '',
].join('\n');

const SCSS_FILE = 'src/scss/sections/pricing.scss';
const SECTION_TAG = '<section className="pricing">';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

function drafts(): DraftStore {
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: BASE, now: NOW });
  const files: Record<string, string> = {
    'md/layout.md': '# Layout: Shop\n\n## pricing\nPurpose: Show the plans.\nComponents: Button\n',
    'src/tsx/sections/Pricing.tsx': TSX,
    [SCSS_FILE]: SCSS,
  };
  for (const [path, text] of Object.entries(files)) store.writeText('shop', `v1/${path}`, text);
  return store;
}

const inspectIn = (store: DraftStore, id: string) =>
  inspectElement({ drafts: store, kits: builtinKits(), compiler, etag: etagOf }, 'shop', id);

test('the source line is one line of at most 200 characters', () => {
  const tag = '<Button\n  variant="primary"\n\tsize="lg"\n>';
  assert.equal(oneLine(tag), '<Button variant="primary" size="lg" >');
  const cut = oneLine(`<Card title="${'x'.repeat(400)}">`);
  assert.equal(cut.length, MAX_SOURCE_TAG);
  assert.ok(cut.endsWith('…'));
  assert.ok(!cut.includes('\n'));
  // A character of two code units is never cut in half.
  const safe = oneLine(`<p title="${'a'.repeat(188)}\u{1F600}x">`);
  assert.ok(safe.length <= MAX_SOURCE_TAG);
  assert.doesNotMatch(safe, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
});

test('the rule line is where the first rule of the class starts', () => {
  assert.equal(lineAt(SCSS, SCSS.indexOf('.pricing')), 3);
  const start = TSX.indexOf('<section');
  const tag = { start, end: TSX.indexOf('>', start) + 1 };
  const input = { tsx: TSX, tag, scssFile: SCSS_FILE, scss: SCSS };
  assert.deepEqual(sourceOf({ ...input, className: 'pricing' }), {
    tag: SECTION_TAG,
    ruleFile: SCSS_FILE,
    ruleLine: 3,
  });
  // No class of its own, no rule of the class, or no SCSS file: no rule to name.
  const none = { tag: SECTION_TAG, ruleFile: null, ruleLine: null };
  assert.deepEqual(sourceOf({ ...input, className: null }), none);
  assert.deepEqual(sourceOf({ ...input, className: 'card' }), none);
  const bare = { ...input, scssFile: null, scss: undefined };
  assert.deepEqual(sourceOf({ ...bare, className: 'pricing' }), none);
});

test('the inspect answer carries the tag as one line and the rule of its class', async () => {
  const store = drafts();
  const section = await inspectIn(store, 'sections/Pricing:section');
  assert.deepEqual(section.source, { tag: SECTION_TAG, ruleFile: SCSS_FILE, ruleLine: 3 });
  // The answer still passes the route's schema.
  assert.equal(InspectSchema.safeParse(section).success, true);
  const button = await inspectIn(store, 'sections/Pricing:section/Button');
  assert.equal(button.source.tag, '<Button variant="primary" size="lg" >');
  const plain = await inspectIn(store, 'sections/Pricing:section/p');
  assert.equal(plain.source.tag, '<p>');
  // A `p` without a class gets a new one on its first style edit: it has no rule yet.
  assert.equal(plain.source.ruleFile, null);
  assert.equal(plain.source.ruleLine, null);
});
