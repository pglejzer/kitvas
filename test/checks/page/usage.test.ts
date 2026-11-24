import assert from 'node:assert/strict';
import { test } from 'node:test';
import { elementPlace, type IdEntry } from '../../../src/checks/domain/code/ids.ts';
import { type CatalogComponent, usageFindings } from '../../../src/checks/domain/page/usage.ts';

const FILE = 'src/tsx/sections/Hero.tsx';
const IDS: IdEntry[] = [
  { id: 'sections/Hero:section/Button', file: FILE, line: 9, column: 7, tag: 'Button' },
  { id: 'sections/Hero:section/Icon', file: FILE, line: 10, column: 7, tag: 'Icon' },
];

const CATALOG: CatalogComponent[] = [
  {
    name: 'Button',
    category: 'action',
    styling: ['className', 'style'],
    props: [
      { name: 'variant', type: 'enum', values: ['solid', 'plain'] },
      { name: 'children', type: 'node', required: true },
      { name: 'onClick', type: 'callback' },
    ],
  },
  {
    name: 'Icon',
    category: 'display',
    styling: [],
    props: [{ name: 'name', type: 'string', required: true }],
  },
];

test('an id is placed where it is written; an unknown id has no place', () => {
  assert.deepEqual(elementPlace(IDS, 'sections/Hero:section/Icon'), {
    file: FILE,
    line: 10,
    column: 7,
  });
  assert.deepEqual(elementPlace(IDS, 'nope'), { file: null, line: 0, column: 0 });
  assert.deepEqual(elementPlace(IDS, null), { file: null, line: 0, column: 0 });
});

test('rendered kit components are held to the catalog', () => {
  const findings = usageFindings({
    usage: [
      {
        id: 'sections/Hero:section/Button',
        component: 'Button',
        props: {
          children: 'Buy',
          variant: 'ghost',
          className: 'hero-buy',
          'aria-label': 'Buy now',
          sizes: 'x',
          onClick: null,
        },
      },
      { id: 'sections/Hero:section/Icon', component: 'Icon', props: {} },
      { id: 'sections/Hero:section/Toolbar', component: 'Toolbar', props: {} },
      {
        id: 'sections/Hero:section/Button',
        component: 'Button',
        props: { children: null, variant: 'plain' },
      },
    ],
    catalog: CATALOG,
    ids: IDS,
    state: 'empty',
    width: 1280,
  });
  assert.deepEqual(
    findings.map((finding) => [finding.rule, finding.element, finding.line, finding.message]),
    [
      [
        'ds/bad-value',
        'sections/Hero:section/Button',
        9,
        {
          key: 'checkRule.badValue',
          params: { component: 'Button', prop: 'variant', value: 'ghost', values: 'solid, plain' },
        },
      ],
      [
        'ds/unknown-prop',
        'sections/Hero:section/Button',
        9,
        { key: 'checkRule.unknownProp', params: { component: 'Button', prop: 'sizes' } },
      ],
      [
        'ds/missing-prop',
        'sections/Hero:section/Icon',
        10,
        { key: 'checkRule.missingProp', params: { component: 'Icon', prop: 'name' } },
      ],
      [
        'ds/not-in-catalog',
        'sections/Hero:section/Toolbar',
        0,
        { key: 'checkRule.notInCatalog', params: { name: 'Toolbar' } },
      ],
    ],
  );
  assert.deepEqual(findings[0], {
    check: 'ds',
    rule: 'ds/bad-value',
    severity: 'fix',
    file: FILE,
    line: 9,
    column: 7,
    element: 'sections/Hero:section/Button',
    message: {
      key: 'checkRule.badValue',
      params: { component: 'Button', prop: 'variant', value: 'ghost', values: 'solid, plain' },
    },
    hint: { key: 'checkHint.badValue', params: {} },
    states: ['empty'],
    widths: [1280],
  });
  assert.deepEqual(findings[1]?.hint, {
    key: 'checkHint.unknownProp',
    params: { component: 'Button' },
  });
  assert.deepEqual(findings[2]?.hint, {
    key: 'checkHint.missingProp',
    params: { component: 'Icon' },
  });
  assert.deepEqual(findings[3]?.hint, { key: 'checkHint.notInCatalog', params: {} });
});
