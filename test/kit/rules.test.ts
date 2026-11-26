import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseKit } from '../../src/kit/domain/contract.ts';
import { kitIssues } from '../../src/kit/domain/rules.ts';
import { tinyKitJson } from '../helpers/kit/kits.ts';

type RawComponent = {
  name: string;
  props: { name: string; type: string; values?: string[]; default?: string }[];
  examples?: { title: string; code: string; imports: string[] }[];
};

function issuesAfter(change: (components: RawComponent[], raw: Record<string, unknown>) => void) {
  const raw = tinyKitJson();
  change(raw.components as RawComponent[], raw);
  return kitIssues(parseKit(raw, 'tiny')).map((issue) => [issue.path, issue.key]);
}

/** The component at `index`, failing the test if it is missing. */
function componentAt(components: RawComponent[], index: number): RawComponent {
  const found = components[index];
  assert.ok(found, `no component at ${index}`);
  return found;
}

test('the fixture has no problems', () => {
  assert.deepEqual(
    issuesAfter(() => {}),
    [],
  );
});

test('a component listed twice', () => {
  assert.deepEqual(
    issuesAfter((components) => {
      components.push(structuredClone(componentAt(components, 1)));
    }),
    [['components.Icon', 'kitIssue.duplicateComponent']],
  );
});

test('enum props need values, and a default that is one of them', () => {
  assert.deepEqual(
    issuesAfter((components) => {
      const button = componentAt(components, 0);
      button.props.push({ name: 'size', type: 'enum' });
      button.props.push({ name: 'tone', type: 'enum', values: ['a', 'b'], default: 'c' });
    }),
    [
      ['components.Button.props.size', 'kitIssue.enumWithoutValues'],
      ['components.Button.props.tone', 'kitIssue.defaultNotInValues'],
    ],
  );
});

test('examples may only import what the kit has', () => {
  assert.deepEqual(
    issuesAfter((components) => {
      componentAt(components, 0).examples = [{ title: 'x', code: '<Card />', imports: ['Card'] }];
    }),
    [['components.Button.examples', 'kitIssue.unknownImport']],
  );
});

test('the icon component must be in the kit', () => {
  assert.deepEqual(
    issuesAfter((_components, raw) => {
      (raw.icons as { component: string }).component = 'Glyph';
    }),
    [['icons.component', 'kitIssue.iconComponentMissing']],
  );
});
