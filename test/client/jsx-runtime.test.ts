import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadDep } from '../../src/shared/deps/deps.ts';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';

(globalThis as Record<string, unknown>).__KITVAS_IDS__ = {
  'src/tsx/a.tsx:1:1': 'a:main',
  'src/tsx/a.tsx:2:3': 'a:main/Button',
  'src/tsx/a.tsx:3:3': 'a:main/li',
  'src/tsx/a.tsx:4:3': 'a:main/Fragment',
};

const { Fragment, jsxDEV } = await import('../../client/jsx/jsx-dev-runtime.ts');
const React = await loadDep<typeof import('react')>('react', [PLUGIN_ROOT]);
const { renderToStaticMarkup } = await loadDep<typeof import('react-dom/server')>(
  'react-dom/server',
  [PLUGIN_ROOT],
);

const at = (line: number, column: number, fileName = 'src/tsx/a.tsx') => ({
  fileName,
  lineNumber: line,
  columnNumber: column,
});
const el = (type: unknown, props: Record<string, unknown>, source?: object, key?: string) =>
  jsxDEV(type, props, key, false, source, undefined) as import('react').ReactElement;
const html = (element: unknown): string =>
  renderToStaticMarkup(element as import('react').ReactElement);

function Button({ children, ...rest }: { children?: import('react').ReactNode }) {
  return React.createElement('button', rest, children);
}

test('a host element of the draft gets its id; others get none', () => {
  assert.equal(html(el('main', { children: 'x' }, at(1, 1))), '<main data-ks="a:main">x</main>');
  assert.equal(html(el('main', { children: 'x' }, at(9, 9))), '<main>x</main>');
  assert.equal(html(el('main', { children: 'x' })), '<main>x</main>');
  assert.equal(
    html(el('main', { children: 'x' }, at(1, 1, 'src\\tsx\\a.tsx'))),
    '<main data-ks="a:main">x</main>',
  );
});

test('a fragment never gets an id', () => {
  assert.equal(html(el(Fragment, { children: 'x' }, at(4, 3))), 'x');
});

test('a component passes its id to the root it forwards props to', () => {
  assert.equal(
    html(el(Button, { children: 'Go' }, at(2, 3))),
    '<button data-ks="a:main/Button">Go</button>',
  );
  assert.equal(
    html(el(React.memo(Button), { children: 'Go' }, at(2, 3))),
    '<button data-ks="a:main/Button">Go</button>',
  );
});

test('an id that came in through props is kept', () => {
  assert.equal(
    html(el('button', { 'data-ks': 'a:main/Button', children: 'Go' }, at(1, 1))),
    '<button data-ks="a:main/Button">Go</button>',
  );
});

test('elements rendered in a loop share the id of their source element', () => {
  const items = ['a', 'b'].map((item) => el('li', { children: item }, at(3, 3), item));
  assert.equal(
    html(el('ul', { children: items })),
    '<ul><li data-ks="a:main/li">a</li><li data-ks="a:main/li">b</li></ul>',
  );
});

test('kit components the draft renders are recorded with their plain props', () => {
  const scope = globalThis as Record<string, unknown>;
  scope.__KITVAS_KIT__ = { Button, ICONS: {} };
  const onClick = () => undefined;
  html(el(Button, { children: 'Go', variant: 'plain', onClick, disabled: undefined }, at(2, 3)));
  html(el(Button, { children: 'Go', variant: 'plain', onClick }, at(2, 3)));
  html(el('main', { children: 'x' }, at(1, 1)));
  html(el(Button, { children: 'Go' }, at(9, 9)));
  assert.deepEqual(
    [...(scope.__KITVAS_USAGE__ as Map<string, unknown>).values()],
    [
      {
        id: 'a:main/Button',
        component: 'Button',
        props: { children: 'Go', variant: 'plain', onClick: null },
      },
    ],
  );
});
