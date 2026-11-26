import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createEsbuildCompiler } from '../../../src/edit/adapters/esbuild-compiler.ts';
import { locateElement } from '../../../src/edit/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';

const compiler = createEsbuildCompiler([PLUGIN_ROOT]);
after(() => compiler.dispose());

const FILE = 'src/tsx/sections/Hero.tsx';

const HERO = [
  "import { Button } from '@kit';",
  '',
  'export function Hero({ items }: { items: string[] }) {',
  '  return (',
  '    <section className="hero">',
  '      <h1>Shop</h1>',
  '      <ul>',
  '        {items.map((item) => (',
  '          <li key={item}>{item}</li>',
  '        ))}',
  '      </ul>',
  '      <Button>Buy</Button>',
  '      <Button variant="plain">Later</Button>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

/** The text from the element's offset to the end of its line. */
async function found(text: string, id: string, file = FILE): Promise<string> {
  const at = await locateElement(compiler, text, file, id);
  if (typeof at !== 'number') throw new Error(`${id}: ${at}`);
  const end = text.indexOf('\n', at);
  return text.slice(at, end < 0 ? text.length : end).replace(/\r$/, '');
}

test('an element is found by its id at the < of its opening tag', async () => {
  assert.equal(await found(HERO, 'sections/Hero:section'), '<section className="hero">');
  assert.equal(await found(HERO, 'sections/Hero:section/h1'), '<h1>Shop</h1>');
  assert.equal(
    await found(HERO, 'sections/Hero:section/Button.2'),
    '<Button variant="plain">Later</Button>',
  );
});

test('an item of a mapped list is the one JSX site of the list', async () => {
  assert.equal(await found(HERO, 'sections/Hero:section/ul/li'), '<li key={item}>{item}</li>');
});

test('an element is found again after someone added lines above it', async () => {
  const changed = HERO.replace(
    '      <Button>Buy</Button>',
    '      {/* a note */}\n      <p>New</p>\n      <Button>Buy</Button>',
  );
  assert.equal(
    await found(changed, 'sections/Hero:section/Button.2'),
    '<Button variant="plain">Later</Button>',
  );
  assert.equal(await found(changed, 'sections/Hero:section/p'), '<p>New</p>');
});

test('Polish words before the tag on its line do not move the offset', async () => {
  const text = [
    "import { Button } from '@kit';",
    '',
    'export function Hero() {',
    '  return (',
    '    <section>',
    '      <p>Zażółć gęślą jaźń</p><Button variant="plain">Później</Button>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  assert.equal(
    await found(text, 'sections/Hero:section/Button'),
    '<Button variant="plain">Później</Button>',
  );
});

test('a CRLF file is read by its lines as esbuild counts them', async () => {
  const text = HERO.replaceAll('\n', '\r\n');
  assert.equal(
    await found(text, 'sections/Hero:section/Button.2'),
    '<Button variant="plain">Later</Button>',
  );
});

test('text that does not compile is invalid', async () => {
  const broken = HERO.replace('    </section>', '    </div>');
  assert.equal(await locateElement(compiler, broken, FILE, 'sections/Hero:section'), 'invalid');
});

test('an id that names no element of the current text is not-found', async () => {
  assert.equal(
    await locateElement(compiler, HERO, FILE, 'sections/Hero:section/Button.3'),
    'not-found',
  );
  const removed = HERO.replace('      <Button variant="plain">Later</Button>\n', '');
  assert.equal(
    await locateElement(compiler, removed, FILE, 'sections/Hero:section/Button.2'),
    'not-found',
  );
  // The id's file part must be the file's own.
  const other = 'src/tsx/sections/Other.tsx';
  assert.equal(await locateElement(compiler, HERO, other, 'sections/Hero:section'), 'not-found');
});
