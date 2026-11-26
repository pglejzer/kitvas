import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CRAFT_RULES,
  DEEP_RULES,
  GUIDELINES,
  LOCK_RULE_IDS,
  OPTION_RULE_IDS,
  REWORK_RULE_IDS,
  SHARED_RULE_IDS,
  SOURCE_RULE_IDS,
  STATE_RULES,
  VISIT_RULES,
} from '../../src/checks/index.ts';
import { SCREEN_KINDS } from '../../src/drafts/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';

const locale = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'locales', 'en.json'), 'utf8')) as Record<
  string,
  string
>;

const camel = (id: string): string =>
  id
    .split(/[/-]/)
    .map((word, i) => (i === 0 ? word : (word[0] ?? '').toUpperCase() + word.slice(1)))
    .join('');

const ruleIds = [
  ...VISIT_RULES.map((rule) => rule.id),
  ...STATE_RULES.map((rule) => rule.id),
  ...DEEP_RULES.map((rule) => rule.id),
  ...SOURCE_RULE_IDS,
  ...REWORK_RULE_IDS,
  ...CRAFT_RULES.map((rule) => rule.id),
  ...LOCK_RULE_IDS,
  ...OPTION_RULE_IDS,
  ...SHARED_RULE_IDS,
];

test('ids are unique and start with their check', () => {
  const ids = GUIDELINES.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of GUIDELINES) {
    assert.equal(entry.id.split('/')[0], entry.check, entry.id);
  }
});

test('keys are the camelCase of the id', () => {
  for (const entry of GUIDELINES) assert.equal(entry.key, camel(entry.id), entry.id);
});

test('sources are https links, and a sourced entry has one', () => {
  for (const entry of GUIDELINES) {
    for (const source of entry.sources) {
      assert.ok(source.url.startsWith('https://'), `${entry.id}: ${source.url}`);
      assert.ok(source.name.length > 0, entry.id);
    }
    if (entry.basis === 'source') assert.ok(entry.sources.length >= 1, entry.id);
  }
});

test('every auto and deep entry has exactly one rule', () => {
  for (const entry of GUIDELINES.filter((e) => e.mode !== 'manual')) {
    const rules = ruleIds.filter((id) => id === entry.id);
    assert.equal(rules.length, 1, `${entry.id} has ${rules.length} rules`);
  }
});

test('every rule is in the book as auto or deep', () => {
  for (const id of ruleIds) {
    const entry = GUIDELINES.find((candidate) => candidate.id === id);
    assert.ok(entry, `${id} is not in the book`);
    assert.ok(entry.mode === 'auto' || entry.mode === 'deep', `${id} is ${entry.mode}`);
  }
});

test('manual entries have no rule and no severity', () => {
  for (const entry of GUIDELINES.filter((e) => e.mode === 'manual')) {
    assert.equal(entry.severity, null, entry.id);
    assert.ok(!ruleIds.includes(entry.id), entry.id);
  }
  for (const entry of GUIDELINES.filter((e) => e.mode !== 'manual')) {
    assert.notEqual(entry.severity, null, entry.id);
  }
});

test('every entry has its locale keys', () => {
  for (const entry of GUIDELINES) {
    const keys = [`guideline.${entry.key}.rule`, `guideline.${entry.key}.why`];
    if (entry.mode !== 'manual') {
      keys.push(`checkRule.${entry.key}`, `checkHint.${entry.key}`);
    }
    for (const key of keys) {
      assert.ok(typeof locale[key] === 'string' && locale[key] !== '', `${entry.id}: ${key}`);
    }
  }
});

test('screens are screen kinds', () => {
  const kinds: readonly string[] = SCREEN_KINDS;
  for (const entry of GUIDELINES) {
    for (const screen of entry.screens ?? []) assert.ok(kinds.includes(screen), entry.id);
  }
});

test('the checklist has the twenty manual entries', () => {
  assert.equal(GUIDELINES.filter((entry) => entry.mode === 'manual').length, 20);
});
