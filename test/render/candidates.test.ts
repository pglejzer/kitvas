import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CANDIDATE_LIMITS,
  classCandidates,
  escapeClass,
  fileCandidates,
  hasClassRule,
  looksLikeClass,
  probeRule,
  unbuiltClasses,
} from '../../src/render/domain/candidates.ts';

test('candidates are the words of the text with a letter, unique, in order', () => {
  assert.deepEqual(classCandidates('<div className="flex p-4 flex" />'), [
    'div',
    'className',
    'flex',
    'p-4',
  ]);
  // A template literal with a placeholder, built from parts so the test string has no `${` in it.
  const template = ['`w-1/2 $', '{x}`'].join('');
  assert.deepEqual(classCandidates(`cn('a-1', cond && "md:p-[13px]", ${template})`), [
    'cn',
    'a-1',
    'cond',
    'md:p-[13px]',
    'w-1/2',
    'x',
  ]);
  assert.deepEqual(classCandidates('a=b;c,d<e>f'), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(classCandidates('  \n\t 12 && -- '), []);
});

test('files are read in order until a limit, a file that cannot be read is skipped', () => {
  const texts: Record<string, string> = { a: 'p-4 flex', b: 'm-2 gap-1', c: 'grid' };
  const read = (file: string): string | undefined => texts[file];
  assert.deepEqual(fileCandidates(['a', 'gone', 'b', 'c'], read, { files: 2, chars: 100 }), [
    'p-4',
    'flex',
    'm-2',
    'gap-1',
  ]);
  assert.deepEqual(fileCandidates(['a', 'b', 'c'], read, { files: 10, chars: 10 }), [
    'p-4',
    'flex',
  ]);
  assert.deepEqual(fileCandidates(['c', 'a'], read), ['grid', 'p-4', 'flex']);
  assert.deepEqual(CANDIDATE_LIMITS, { files: 2000, chars: 20 * 1024 * 1024 });
});

test('a class worth reporting has a dash or a colon and starts like a utility', () => {
  for (const name of ['p-4', 'md:flex', '-mt-2', '!p-0', '@md:flex', '*:p-2', '[mask:none]']) {
    assert.equal(looksLikeClass(name), true, name);
  }
  for (const name of ['flex', 'state:', 'variant?:', '_props:', 'Button-x', '@/lib/utils']) {
    assert.equal(looksLikeClass(name), false, name);
  }
});

test('class names are escaped as CSS.escape does', () => {
  assert.equal(escapeClass('hover:opacity-90'), 'hover\\:opacity-90');
  assert.equal(escapeClass('w-1/2'), 'w-1\\/2');
  assert.equal(escapeClass('p-2.5'), 'p-2\\.5');
  assert.equal(escapeClass('bg-[#fff]'), 'bg-\\[\\#fff\\]');
  assert.equal(escapeClass('2xl:flex'), '\\32 xl\\:flex');
  assert.equal(escapeClass('-mt-2'), '-mt-2');
  assert.equal(escapeClass('-2'), '-\\32 ');
  assert.equal(escapeClass('-'), '\\-');
});

test('a class has a rule when its selector is not part of a longer name', () => {
  const css = '.p-4 {\n  padding: 1rem;\n}\n.hover\\:opacity-90:hover {\n  opacity: 0.9;\n}\n';
  assert.equal(hasClassRule(css, 'p-4'), true);
  assert.equal(hasClassRule(css, 'hover:opacity-90'), true);
  assert.equal(hasClassRule(css, 'p-2'), false);
  assert.equal(hasClassRule('.p-45 {}', 'p-4'), false);
  assert.equal(hasClassRule('.p-4\\.5 {}', 'p-4'), false);
  assert.equal(hasClassRule('.p-45 {} .p-4,.x {}', 'p-4'), true);
});

test('the probe rule uses each custom property once and nothing else', () => {
  assert.equal(
    probeRule(['--color-x', '--color-x', 'not a name', '--b']),
    '.kitvas-probe {\n  --kitvas-probe-0: var(--color-x);\n  --kitvas-probe-1: var(--b);\n}\n',
  );
  assert.equal(probeRule([]), '');
  assert.equal(probeRule(['--x); } body { color: red']), '');
});

test('theme paths in the probe become variables the theme fills, on the root and the body', () => {
  assert.equal(
    probeRule(['--b', 'theme(colors.primary)', 'theme(colors.primary)', 'theme(spacing.4)']),
    [
      '.kitvas-probe {',
      '  --kitvas-probe-0: var(--b);',
      '}',
      ':root, body {',
      "  --kitvas-theme-colors-primary: theme('colors.primary');",
      "  --kitvas-theme-spacing-4: theme('spacing.4');",
      '}',
      '',
    ].join('\n'),
  );
  assert.equal(probeRule(["theme(colors.x'); } body { color: red; } x { --y: theme('a)"]), '');
});

test('the classes a CSS has no rule for are the ones that produced nothing', () => {
  const css = '.p-4 {\n  padding: 1rem;\n}\n';
  assert.deepEqual(unbuiltClasses(['p-4', 'flex', 'not-a-class', 'bg-x', 'state:'], css), [
    'bg-x',
    'not-a-class',
  ]);
});
