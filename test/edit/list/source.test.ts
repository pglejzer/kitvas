// The string literal that renders a text the person saw (ADR 0060): the three texts of the lab's
// pricing draft, a nested list behind a condition, a text two items share (the path decides), an
// ambiguous condition, operands the editor cannot read, and a write that the request's hunk
// inverse takes back byte for byte, with LF and with CRLF.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyListEdit } from '../../../src/edit/domain/list/edit.ts';
import {
  listRoots,
  onlyExpression,
  showsExpression,
  textSource,
  writeTextSource,
} from '../../../src/edit/domain/list/source.ts';
import { applyHunks, makeHunks } from '../../../src/edit/domain/structure/patch.ts';

/** The offset of the first `start` in `text`. */
function at(text: string, start: string): number {
  const found = text.indexOf(start);
  if (found < 0) throw new Error(`no ${start}`);
  return found;
}

/** The source literal as written, or `refused: <reason>`. */
function sourceText(text: string, element: number, shown: string, path: number[]): string {
  const found = textSource(text, element, shown, path);
  if ('refused' in found) return `refused: ${found.refused}`;
  return text.slice(found.span.start, found.span.end);
}

/** The lines of the lab's pricing section (`Plans.tsx` of the `pricing` draft) with the texts. */
const PLANS_LINES = [
  "import { useState } from 'react';",
  "import { Heading, Text, Badge, Button, Card, Grid, Stack, Icon } from '@kit';",
  '',
  "type Billing = 'monthly' | 'annual';",
  '',
  'type Plan = {',
  '  id: string;',
  '  name: string;',
  '  description: string;',
  '  monthly: string;',
  '  annual: string;',
  '  billed?: string;',
  '  free?: boolean;',
  '  action: string;',
  '  featured?: boolean;',
  '  features: string[];',
  '};',
  '',
  'const plans: Plan[] = [',
  '  {',
  "    id: 'starter',",
  "    name: 'Starter',",
  "    description: 'For freelancers and small side projects.',",
  "    monthly: '0',",
  "    annual: '0',",
  '    free: true,',
  "    action: 'Start for free',",
  '    features: [',
  "      'Up to 3 projects',",
  "      '2 team members',",
  "      'Kanban and list views',",
  "      '1 GB file storage',",
  "      'Email support',",
  '    ],',
  '  },',
  '  {',
  "    id: 'pro',",
  "    name: 'Pro',",
  "    description: 'For growing teams that need to move fast.',",
  "    monthly: '49',",
  "    annual: '39',",
  "    billed: 'billed 468 zł yearly',",
  "    action: 'Try Pro free for 14 days',",
  '    featured: true,',
  '    features: [',
  "      'Unlimited projects',",
  "      'Up to 50 team members',",
  "      'Timeline and calendar views',",
  "      '100 GB file storage',",
  "      'Time tracking and reports',",
  "      'Slack, GitHub and Google Drive integrations',",
  "      'Priority email support',",
  '    ],',
  '  },',
  '  {',
  "    id: 'business',",
  "    name: 'Business',",
  "    description: 'For companies that need security and control.',",
  "    monthly: '129',",
  "    annual: '103',",
  "    billed: 'billed 1,236 zł yearly',",
  "    action: 'Try Business free',",
  '    features: [',
  "      'Everything in Pro',",
  "      'Unlimited team members',",
  "      'SSO (SAML) and audit log',",
  "      '1 TB file storage',",
  "      'Custom roles and permissions',",
  "      '99.9% uptime SLA',",
  "      'Dedicated account manager',",
  '    ],',
  '  },',
  '];',
  '',
  'export function Plans({ state }: { state: string }) {',
  "  const [billing, setBilling] = useState<Billing>('monthly');",
  "  const loading = state === 'loading';",
  "  const annual = billing === 'annual';",
  '',
  '  return (',
  '    <section className="plans">',
  '      <div className="plans__inner">',
  '        <Grid columns={3} gap="xl" className="plans__grid">',
  '          {plans.map((plan) => (',
  '            <Card',
  '              key={plan.id}',
  '              as="article"',
  '              padding="lg"',
  "              className={plan.featured ? 'plans__card plans__card--featured' : 'plans__card'}",
  '            >',
  '              <Stack gap="lg">',
  '                <Stack direction="row" gap="sm" align="center" justify="between">',
  '                  <Heading level={2} size="sm">{plan.name}</Heading>',
  '                  {plan.featured && <Badge tone="good">Most popular</Badge>}',
  '                </Stack>',
  '                <Text tone="muted">{plan.description}</Text>',
  '',
  '                {loading ? (',
  '                  <div role="status" aria-busy="true" className="plans__loading">',
  '                    <Text weight="medium">Loading prices…</Text>',
  '                    <div className="plans__bar" />',
  '                    <div className="plans__bar plans__bar--short" />',
  '                  </div>',
  '                ) : (',
  '                  <>',
  '                    <Stack gap="xs">',
  '                      <div className="plans__price">',
  '                        <span className="plans__amount">{annual ? plan.annual : plan.monthly} zł</span>',
  '                        {!plan.free && (',
  '                          <Text as="span" tone="muted" size="sm">per user / month</Text>',
  '                        )}',
  '                      </div>',
  '                      <Text tone="muted" size="sm">',
  "                        {plan.free ? 'free forever' : annual ? plan.billed : 'billed monthly'}",
  '                      </Text>',
  '                    </Stack>',
  '',
  "                    <Button variant={plan.featured ? 'solid' : 'outline'} className=\"plans__action\">",
  '                      {plan.action}',
  '                    </Button>',
  '',
  '                    <ul className="plans__features">',
  '                      {plan.features.map((feature) => (',
  '                        <li key={feature} className="plans__feature">',
  '                          <Icon name="check" size={16} />',
  '                          <Text as="span">{feature}</Text>',
  '                        </li>',
  '                      ))}',
  '                    </ul>',
  '                  </>',
  '                )}',
  '              </Stack>',
  '            </Card>',
  '          ))}',
  '        </Grid>',
  '      </div>',
  '    </section>',
  '  );',
  '}',
  '',
];

const PLANS = PLANS_LINES.join('\n');
const BUTTON = '<Button variant=';
const FEATURE = '<Text as="span">{feature}';
const BILLED = '<Text tone="muted" size="sm">';
const PRO_ACTION = 'Try Pro free for 14 days';

test('a button shows a list item field inside a condition of the callback', () => {
  const button = at(PLANS, BUTTON);
  assert.equal(sourceText(PLANS, button, PRO_ACTION, [1]), `'${PRO_ACTION}'`);
  assert.equal(sourceText(PLANS, button, 'Start for free', [0]), "'Start for free'");
  // The text another item holds is not the source of this copy's text.
  assert.equal(sourceText(PLANS, button, 'Start for free', [1]), 'refused: computed');
  const found = textSource(PLANS, button, 'Try Business free', [2]);
  assert.ok('span' in found);
  assert.equal(found.span.start, PLANS.indexOf("'Try Business free'"));
});

test('a feature of the inner list is the array literal in the field of the outer item', () => {
  const feature = at(PLANS, FEATURE);
  const slack = 'Slack, GitHub and Google Drive integrations';
  assert.equal(sourceText(PLANS, feature, slack, [1, 5]), `'${slack}'`);
  assert.equal(sourceText(PLANS, feature, 'Everything in Pro', [2, 0]), "'Everything in Pro'");
  assert.equal(sourceText(PLANS, feature, 'Everything in Pro', [1, 0]), 'refused: computed');
});

test('a condition of literals and an item field gives the branch that shows', () => {
  const billed = at(PLANS, BILLED);
  assert.equal(sourceText(PLANS, billed, 'free forever', [0]), "'free forever'");
  assert.equal(sourceText(PLANS, billed, 'billed monthly', [2]), "'billed monthly'");
  const pro = textSource(PLANS, billed, 'billed 468 zł yearly', [1]);
  assert.ok('span' in pro);
  // The field of the item, not a literal of the JSX.
  assert.equal(pro.span.start, PLANS.indexOf("'billed 468 zł yearly'"));
  // Pro's own field holds another text: no literal gives this one for Pro.
  assert.equal(sourceText(PLANS, billed, 'billed 1,236 zł yearly', [1]), 'refused: computed');
});

test('the list roots around a text are the root elements of the callbacks, outer first', () => {
  assert.deepEqual(listRoots(PLANS, at(PLANS, BUTTON)), [at(PLANS, '<Card')]);
  assert.deepEqual(listRoots(PLANS, at(PLANS, FEATURE)), [
    at(PLANS, '<Card'),
    at(PLANS, '<li key={feature}'),
  ]);
  assert.deepEqual(listRoots(PLANS, at(PLANS, '<section')), []);
});

test('a text beside other text is no one expression, and an element child is no text', () => {
  const amount = at(PLANS, '<span className="plans__amount">');
  assert.equal(showsExpression(PLANS, amount), true);
  assert.equal(onlyExpression(PLANS, amount), null);
  assert.equal(sourceText(PLANS, amount, '39 zł', [1]), 'refused: no-text');
  assert.equal(showsExpression(PLANS, at(PLANS, '<div className="plans__price">')), false);
  assert.equal(showsExpression(PLANS, at(PLANS, BUTTON)), true);
});

test('a path that names another number of lists, or an item that is gone, is refused', () => {
  const button = at(PLANS, BUTTON);
  assert.equal(sourceText(PLANS, button, PRO_ACTION, []), 'refused: not-found');
  assert.equal(sourceText(PLANS, button, PRO_ACTION, [3]), 'refused: list-item-gone');
  const feature = at(PLANS, FEATURE);
  assert.equal(sourceText(PLANS, feature, 'Email support', [0, 9]), 'refused: list-item-gone');
});

const lines = (...parts: string[]): string => parts.join('\n');

/** A list in a list, the inner one behind a condition; `Tags` is in both groups. */
const GROUPS = lines(
  "import { Stack } from '@kit';",
  '',
  'const groups = [',
  "  { title: 'Basics', items: ['Notes', 'Tags'] },",
  "  { title: 'Teams', items: ['Tags', 'Roles'] },",
  '];',
  '',
  'export function Groups({ state }: { state: string }) {',
  '  return (',
  '    <Stack gap="md">',
  '      {groups.map((group) => (',
  '        <section key={group.title}>',
  "          {state !== 'empty' && (",
  '            <ul>',
  '              {group.items.map((item) => (',
  '                <li key={item}>{item}</li>',
  '              ))}',
  '            </ul>',
  '          )}',
  '        </section>',
  '      ))}',
  '    </Stack>',
  '  );',
  '}',
  '',
);

test('a nested list behind a condition reads the item the path names', () => {
  const item = at(GROUPS, '<li');
  assert.deepEqual(listRoots(GROUPS, item), [at(GROUPS, '<section'), item]);
  assert.equal(sourceText(GROUPS, item, 'Roles', [1, 1]), "'Roles'");
  assert.equal(sourceText(GROUPS, item, 'Notes', [0, 0]), "'Notes'");
});

test('the same text in two items: the path decides which literal is written', () => {
  const item = at(GROUPS, '<li');
  const first = textSource(GROUPS, item, 'Tags', [0, 1]);
  const second = textSource(GROUPS, item, 'Tags', [1, 0]);
  assert.ok('span' in first && 'span' in second);
  assert.equal(first.span.start, GROUPS.indexOf("'Tags'"));
  assert.equal(second.span.start, GROUPS.indexOf("'Tags'", first.span.end));
  const written = writeTextSource(GROUPS, item, { value: 'Labels', before: 'Tags', path: [1, 0] });
  assert.ok(!('refused' in written));
  assert.equal(written.text, GROUPS.replace("['Tags', 'Roles']", "['Labels', 'Roles']"));
});

/** A component whose button shows `body`. */
function saveButton(body: string): string {
  return lines(
    'export function Save({ wide, label }: { wide: boolean; label?: string }) {',
    `  return <button type="button">${body}</button>;`,
    '}',
    '',
  );
}

/** The source of the text `shown` of a button that shows `body`. */
function buttonSource(body: string, shown: string): string {
  const text = saveButton(body);
  return sourceText(text, at(text, '<button'), shown, []);
}

test('two literals that give the same text are ambiguous; the one that differs is written', () => {
  assert.equal(buttonSource("{wide ? 'Save' : 'Save'}", 'Save'), 'refused: ambiguous');
  assert.equal(buttonSource("{wide ? 'Save changes' : 'Save'}", 'Save'), "'Save'");
  assert.equal(buttonSource("{wide ? 'Save changes' : 'Save'}", 'Saved'), 'refused: computed');
});

test('an operand the editor cannot read may be the text, so nothing is written', () => {
  // The prop may be `Save` too, and so may what a call or a component gives.
  assert.equal(buttonSource("{label ?? 'Save'}", 'Save'), 'refused: computed');
  assert.equal(buttonSource("{wide ? format('Save') : 'Save'}", 'Save'), 'refused: computed');
  assert.equal(buttonSource("{wide ? <Spinner /> : 'Save'}", 'Save'), 'refused: computed');
});

test('an expression of elements only shows no text of its own', () => {
  const text = saveButton('{wide ? <b>Save</b> : <i>Saved</i>}');
  assert.equal(showsExpression(text, at(text, '<button')), false);
  assert.equal(buttonSource('{wide ? <b>Save</b> : <i>Saved</i>}', 'Save'), 'refused: no-text');
});

test('null, a page element and a missing field show nothing, so the literal is the source', () => {
  assert.equal(buttonSource("{wide ? null : 'Save'}", 'Save'), "'Save'");
  assert.equal(buttonSource("{wide && 'Save'}", 'Save'), "'Save'");
  assert.equal(buttonSource("{wide ? <i /> : 'Save'}", 'Save'), "'Save'");
  assert.equal(buttonSource('{(wide) ? (`Save`) : undefined}', 'Save'), '`Save`');
  // Starter has no `billed`: `plan.billed` shows nothing there.
  assert.equal(sourceText(PLANS, at(PLANS, BILLED), 'free forever', [0]), "'free forever'");
});

type TextOp = { value: string; before: string; path: number[] };

/** The write, and the hunks a request answers with as its inverse, applied back. */
function roundTrip(text: string, element: number, op: TextOp): { written: string; back: string } {
  const written = writeTextSource(text, element, op);
  if ('refused' in written) throw new Error(written.refused);
  const back = applyHunks(written.text, makeHunks(text, written.text));
  if ('conflict' in back) throw new Error('conflict');
  return { written: written.text, back: back.text };
}

const ENDS = { LF: '\n', CRLF: '\r\n' };

for (const [name, eol] of Object.entries(ENDS)) {
  test(`a written text and its inverse give the file back byte for byte (${name})`, () => {
    const text = PLANS_LINES.join(eol);
    const before = 'Slack, GitHub and Google Drive integrations';
    const value = "Slack's own app";
    const { written, back } = roundTrip(text, at(text, FEATURE), { value, before, path: [1, 5] });
    // Only the literal changes, in its own quotes; every line keeps its end.
    assert.equal(written, text.replace(`'${before}'`, "'Slack\\'s own app'"));
    assert.equal(written.split('\r\n').length, text.split('\r\n').length);
    assert.equal(back, text);
    // The new text is found again where it was written.
    const again = sourceText(written, at(written, FEATURE), value, [1, 5]);
    assert.equal(again, "'Slack\\'s own app'");
    const branch = roundTrip(text, at(text, BILLED), {
      value: 'free, always',
      before: 'free forever',
      path: [0],
    });
    assert.equal(branch.written, text.replace("'free forever'", "'free, always'"));
    assert.equal(branch.back, text);
  });
}

test('a setItemText with a path writes through the source; one without keeps its meaning', () => {
  const op = {
    op: 'setItemText' as const,
    id: 'sections/Plans:section/div/Grid/Card/Stack/Button',
    item: 1,
    path: [1],
    value: 'Try Pro',
    before: PRO_ACTION,
  };
  const options = { force: false };
  const result = applyListEdit(PLANS, at(PLANS, BUTTON), op, options);
  assert.ok('text' in result);
  assert.equal(result.text, PLANS.replace(`'${PRO_ACTION}'`, "'Try Pro'"));
  // Without a path the button is no element its list reaches through elements.
  const { path: _path, ...old } = op;
  assert.ok('refused' in applyListEdit(PLANS, at(PLANS, BUTTON), old, options));
  // The text it showed, written again, changes nothing.
  const same = applyListEdit(PLANS, at(PLANS, BUTTON), { ...op, value: op.before }, options);
  assert.ok('text' in same);
  assert.equal(same.text, PLANS);
});
