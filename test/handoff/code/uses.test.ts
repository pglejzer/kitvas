import assert from 'node:assert/strict';
import { test } from 'node:test';
import { componentUses, tokenUsesOf } from '../../../src/handoff/domain/code/uses.ts';
import type { IdsFile } from '../../../src/render/index.ts';

const at = (tag: string) => ({ file: 'src/tsx/sections/Hero.tsx', line: 1, column: 1, tag });

function idsOf(tags: string[]): IdsFile {
  return {
    schemaVersion: 1,
    ids: Object.fromEntries(tags.map((tag, index) => [`sections/Hero:${tag}.${index}`, at(tag)])),
  };
}

test('capitalised tags are counted and joined with the import that brings them in', () => {
  const sources = [
    {
      path: 'Hero.tsx',
      text: "import { Button, Card } from '@kit';\nimport Badge from '../parts/Badge.tsx';\n",
    },
  ];
  const found = componentUses({
    ids: idsOf(['section', 'Button', 'Button', 'Card', 'Badge', 'h1']),
    sources,
  });
  assert.deepEqual(found, [
    { name: 'Badge', from: '../parts/Badge.tsx', uses: 1 },
    { name: 'Button', from: '@kit', uses: 2 },
    { name: 'Card', from: '@kit', uses: 1 },
  ]);
});

test('a part such as Card.Header counts for Card', () => {
  const found = componentUses({
    ids: idsOf(['Card', 'Card.Header', 'Card.Body']),
    sources: [{ path: 'a.tsx', text: "import { Card } from '@kit';" }],
  });
  assert.deepEqual(found, [{ name: 'Card', from: '@kit', uses: 3 }]);
});

test('a name with no import is left out', () => {
  const found = componentUses({
    ids: idsOf(['Local', 'Button']),
    sources: [{ path: 'a.tsx', text: "import { Button } from '@kit';\nfunction Local() {}" }],
  });
  assert.deepEqual(found, [{ name: 'Button', from: '@kit', uses: 1 }]);
});

test('every import form: aliases, a default beside braces, a namespace, several lines', () => {
  const text = [
    "import type { Props } from './types.ts';",
    "import type Other from './other.ts';",
    "import './styles.scss';",
    "import { Button as Primary, type Size, Icon } from '@kit';",
    "import Badge, { Chip } from './parts.tsx';",
    "import * as UI from '@acme/ui';",
    'import {',
    '  Stack,',
    '  Grid,',
    "} from './layout.tsx';",
  ].join('\n');
  const found = componentUses({
    ids: idsOf([
      'Primary',
      'Icon',
      'Badge',
      'Chip',
      'UI.Panel',
      'Stack',
      'Grid',
      'Props',
      'Other',
      'Size',
    ]),
    sources: [{ path: 'a.tsx', text }],
  });
  assert.deepEqual(
    found.map(({ name, from }) => [name, from]),
    [
      ['Badge', './parts.tsx'],
      ['Chip', './parts.tsx'],
      ['Grid', './layout.tsx'],
      ['Icon', '@kit'],
      ['Primary', '@kit'],
      ['Stack', './layout.tsx'],
      ['UI', '@acme/ui'],
    ],
  );
});

test('the first import of a name wins and uses are counted from the ids only', () => {
  const found = componentUses({
    ids: idsOf(['Button']),
    sources: [
      { path: 'a.tsx', text: "import { Button } from '@kit';\n<Button /><Button />" },
      { path: 'b.tsx', text: "import { Button } from './mine.tsx';" },
    ],
  });
  assert.deepEqual(found, [{ name: 'Button', from: '@kit', uses: 1 }]);
});

test('kit variables are counted once per place they are written', () => {
  const found = tokenUsesOf([
    {
      path: 'Hero.tsx',
      text: '<div style={{ gap: "var(--kit-space-md)", color: `var( --kit-color-ink )` }} />',
    },
    {
      path: 'hero.scss',
      text: '.a { padding: var(--kit-space-md) var(--kit-space-lg); margin: var(--other-x); }\n.b { gap: var(--kit-space-md, 8px); }',
    },
  ]);
  assert.deepEqual(found, [
    { var: '--kit-color-ink', uses: 1 },
    { var: '--kit-space-lg', uses: 1 },
    { var: '--kit-space-md', uses: 3 },
  ]);
});

test('no sources, no uses', () => {
  assert.deepEqual(tokenUsesOf([]), []);
  assert.deepEqual(componentUses({ ids: idsOf([]), sources: [] }), []);
});
