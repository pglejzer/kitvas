// Rules: ux forms and errors (ADR 0043). Thresholds and word lists come from the guideline entries.

import type { FactNode, FieldFacts } from '../facts.ts';
import type { RawFinding } from '../finding.ts';
import {
  INPUT_CONTACT_WORDS,
  INPUT_QUANTITY_WORDS,
  NON_FIELD_TYPES,
  NON_TEXT_TYPES,
  SEARCH_WORDS,
  UX_BROKEN_ANCHOR,
  UX_ERROR_WORDING,
  UX_FIELD_COUNT,
  UX_FIELDSET,
  UX_INPUT_TYPE,
  UX_KEEPS_INPUT,
  UX_LABEL_POSITION,
  UX_REQUIRED_MARKS,
  UX_SINGLE_COLUMN,
  UX_SUBMIT,
  UX_VISIBLE_LABEL,
  VAGUE_ERROR_WORDS,
} from '../guidelines/ux-forms.ts';
import type { StatesInput, StatesRule, VisitInput, VisitRule } from './types.ts';
import { ruleFinding } from './types.ts';

type Entry = { index: number; node: FactNode; field: FieldFacts };

/** Every field a person fills in: not a button or hidden input, not visually hidden. */
function fieldsOf(input: VisitInput, includeHidden = false): Entry[] {
  const entries: Entry[] = [];
  input.facts.nodes.forEach((node, index) => {
    const field = node.field;
    if (field === null || NON_FIELD_TYPES.includes(field.type)) return;
    if (node.hidden && !includeHidden) return;
    entries.push({ index, node, field });
  });
  return entries;
}

/** Matches any of the words as a whole word (letters on both sides do not count). */
function wordsRegex(words: readonly string[]): RegExp {
  return new RegExp(`(?<![a-z])(${words.join('|')})(?![a-z])`, 'i');
}

const SEARCH_RE = wordsRegex(SEARCH_WORDS);
const CONTACT_RE = wordsRegex(Object.keys(INPUT_CONTACT_WORDS));
const QUANTITY_RE = wordsRegex(INPUT_QUANTITY_WORDS);

function nameOf(field: FieldFacts): string {
  return field.labelText || field.placeholder || field.name || field.type;
}

function isTextLike(field: FieldFacts): boolean {
  return !NON_TEXT_TYPES.includes(field.type);
}

function isGroupType(field: FieldFacts): boolean {
  return field.type === 'radio' || field.type === 'checkbox';
}

const visibleLabel: VisitRule = {
  id: UX_VISIBLE_LABEL.id,
  run(input) {
    const found: RawFinding[] = [];
    for (const { index, field } of fieldsOf(input)) {
      if (field.label === 'visible') continue;
      const search =
        field.type === 'search' ||
        SEARCH_RE.test(field.name) ||
        SEARCH_RE.test(field.placeholder) ||
        SEARCH_RE.test(field.labelText);
      found.push(
        ruleFinding(input, {
          rule: UX_VISIBLE_LABEL.id,
          severity: search ? 'review' : 'fix',
          node: index,
          kit: 'keep',
          message: {
            key: `checkRule.${UX_VISIBLE_LABEL.key}`,
            params: { field: nameOf(field), how: field.label },
          },
          hint: { key: `checkHint.${UX_VISIBLE_LABEL.key}`, params: {} },
        }),
      );
    }
    return found;
  },
};

const fieldset: VisitRule = {
  id: UX_FIELDSET.id,
  run(input) {
    const byName = new Map<string, Entry[]>();
    for (const entry of fieldsOf(input)) {
      if (!isGroupType(entry.field) || entry.field.name === '') continue;
      const list = byName.get(entry.field.name) ?? [];
      list.push(entry);
      byName.set(entry.field.name, list);
    }
    const found: RawFinding[] = [];
    for (const [name, list] of byName) {
      const first = list[0];
      if (first === undefined || list.length < UX_FIELDSET.thresholds.minGroup) continue;
      if (!list.some(({ field }) => field.group === -1 || field.groupName === '')) continue;
      found.push(
        ruleFinding(input, {
          rule: UX_FIELDSET.id,
          severity: 'fix',
          node: first.index,
          kit: 'keep',
          message: { key: `checkRule.${UX_FIELDSET.key}`, params: { name } },
          hint: { key: `checkHint.${UX_FIELDSET.key}`, params: {} },
        }),
      );
    }
    return found;
  },
};

const requiredMarks: VisitRule = {
  id: UX_REQUIRED_MARKS.id,
  run(input) {
    const byForm = new Map<number, Entry[]>();
    for (const entry of fieldsOf(input)) {
      const list = byForm.get(entry.field.form) ?? [];
      list.push(entry);
      byForm.set(entry.field.form, list);
    }
    const found: RawFinding[] = [];
    for (const list of byForm.values()) {
      const required = list.filter(({ field }) => field.required);
      const marked = required.filter(({ field }) => field.mark === 'required');
      const unmarked = required.filter(({ field }) => field.mark !== 'required');
      const optional = list.filter(({ field }) => field.mark === 'optional');
      const anyRequiredMark = list.some(({ field }) => field.mark === 'required');
      const uneven = marked.length > 0 && unmarked.length > 0;
      const mixed = anyRequiredMark && optional.length > 0;
      if (!uneven && !mixed) continue;
      const at = uneven ? unmarked[0] : optional[0];
      if (at === undefined) continue;
      found.push(
        ruleFinding(input, {
          rule: UX_REQUIRED_MARKS.id,
          severity: 'review',
          node: at.index,
          kit: 'keep',
          message: {
            key: `checkRule.${UX_REQUIRED_MARKS.key}`,
            params: { field: nameOf(at.field) },
          },
          hint: { key: `checkHint.${UX_REQUIRED_MARKS.key}`, params: {} },
        }),
      );
    }
    return found;
  },
};

const labelPosition: VisitRule = {
  id: UX_LABEL_POSITION.id,
  run(input) {
    if (input.seen.width !== UX_LABEL_POSITION.thresholds.width) return [];
    const found: RawFinding[] = [];
    for (const { index, node, field } of fieldsOf(input)) {
      const label = field.labelBox;
      if (!isTextLike(field) || field.label !== 'visible' || label === null) continue;
      const [, fieldTop, , fieldHeight] = node.box;
      const labelTop = label[1];
      const labelBottom = label[1] + label[3];
      // A label that wraps the field and reaches past it is not beside it.
      if (labelTop <= fieldTop && labelBottom >= fieldTop + fieldHeight) continue;
      if (labelBottom <= fieldTop + UX_LABEL_POSITION.thresholds.aboveTolerance) continue;
      found.push(
        ruleFinding(input, {
          rule: UX_LABEL_POSITION.id,
          severity: 'review',
          node: index,
          kit: 'keep',
          message: { key: `checkRule.${UX_LABEL_POSITION.key}`, params: { field: nameOf(field) } },
          hint: { key: `checkHint.${UX_LABEL_POSITION.key}`, params: {} },
        }),
      );
    }
    return found;
  },
};

const singleColumn: VisitRule = {
  id: UX_SINGLE_COLUMN.id,
  run(input) {
    if (input.seen.width !== UX_SINGLE_COLUMN.thresholds.width) return [];
    const texts = fieldsOf(input).filter(({ field, node }) => isTextLike(field) && node.box[3] > 0);
    const found: RawFinding[] = [];
    texts.forEach((entry, at) => {
      const [, top, , height] = entry.node.box;
      const sharesRow = texts.slice(0, at).some((other) => {
        const [, otherTop, , otherHeight] = other.node.box;
        const shared = Math.min(top + height, otherTop + otherHeight) - Math.max(top, otherTop);
        return shared > Math.min(height, otherHeight) * UX_SINGLE_COLUMN.thresholds.overlap;
      });
      if (!sharesRow) return;
      found.push(
        ruleFinding(input, {
          rule: UX_SINGLE_COLUMN.id,
          severity: 'review',
          node: entry.index,
          kit: 'keep',
          message: {
            key: `checkRule.${UX_SINGLE_COLUMN.key}`,
            params: { field: nameOf(entry.field) },
          },
          hint: { key: `checkHint.${UX_SINGLE_COLUMN.key}`, params: {} },
        }),
      );
    });
    return found;
  },
};

const fieldCount: VisitRule = {
  id: UX_FIELD_COUNT.id,
  run(input) {
    if (
      input.screen === null ||
      !UX_FIELD_COUNT.screens.some((screen) => screen === input.screen)
    ) {
      return [];
    }
    const byForm = new Map<number, { first: Entry; count: number; groups: Set<string> }>();
    for (const entry of fieldsOf(input)) {
      const { field } = entry;
      const slot = byForm.get(field.form) ?? { first: entry, count: 0, groups: new Set<string>() };
      byForm.set(field.form, slot);
      if (isGroupType(field) && field.name !== '') {
        if (slot.groups.has(field.name)) continue;
        slot.groups.add(field.name);
      }
      slot.count += 1;
    }
    const found: RawFinding[] = [];
    for (const { first, count } of byForm.values()) {
      if (count <= UX_FIELD_COUNT.thresholds.maxFields) continue;
      found.push(
        ruleFinding(input, {
          rule: UX_FIELD_COUNT.id,
          severity: 'review',
          node: first.index,
          message: { key: `checkRule.${UX_FIELD_COUNT.key}`, params: { count } },
          hint: {
            key: `checkHint.${UX_FIELD_COUNT.key}`,
            params: { max: UX_FIELD_COUNT.thresholds.maxFields },
          },
        }),
      );
    }
    return found;
  },
};

const inputType: VisitRule = {
  id: UX_INPUT_TYPE.id,
  run(input) {
    const found: RawFinding[] = [];
    for (const { index, field } of fieldsOf(input)) {
      const words = `${field.labelText} ${field.name}`;
      let suggest: string | null = null;
      if (field.type === 'text') {
        const hit = CONTACT_RE.exec(words)?.[1]?.toLowerCase();
        suggest = hit === undefined ? null : (INPUT_CONTACT_WORDS[hit] ?? null);
      } else if (field.type === 'number' && !QUANTITY_RE.test(words)) {
        suggest = 'text';
      }
      if (suggest === null) continue;
      found.push(
        ruleFinding(input, {
          rule: UX_INPUT_TYPE.id,
          severity: 'review',
          node: index,
          kit: 'keep',
          message: {
            key: `checkRule.${UX_INPUT_TYPE.key}`,
            params: { field: nameOf(field), type: field.type },
          },
          hint: { key: `checkHint.${UX_INPUT_TYPE.key}`, params: { suggest } },
        }),
      );
    }
    return found;
  },
};

/** True when `node` is `form` or sits inside it. */
function isInside(nodes: FactNode[], node: number, form: number): boolean {
  let at = node;
  for (let steps = 0; at >= 0 && steps <= nodes.length; steps += 1) {
    if (at === form) return true;
    at = nodes[at]?.parent ?? -1;
  }
  return false;
}

const submit: VisitRule = {
  id: UX_SUBMIT.id,
  run(input) {
    const forms = new Set<number>();
    for (const { field } of fieldsOf(input)) if (field.form >= 0) forms.add(field.form);
    const { nodes } = input.facts;
    const found: RawFinding[] = [];
    for (const form of forms) {
      const hasSubmit = nodes.some(
        (node, index) => node.action?.submit === true && isInside(nodes, index, form),
      );
      if (hasSubmit) continue;
      found.push(
        ruleFinding(input, {
          rule: UX_SUBMIT.id,
          severity: 'review',
          node: form,
          message: { key: `checkRule.${UX_SUBMIT.key}`, params: {} },
          hint: { key: `checkHint.${UX_SUBMIT.key}`, params: {} },
        }),
      );
    }
    return found;
  },
};

/** The text of an error message without the "Error:" prefix a visually hidden span may add. */
function errorBody(text: string): string {
  return text
    .trim()
    .replace(/^error:\s*/i, '')
    .trim();
}

function vague(text: string): boolean {
  const body = errorBody(text);
  if (VAGUE_ERROR_WORDS.includes(body.replace(/\.$/, '').toLowerCase())) return true;
  const words = body.split(/\s+/).filter((word) => word !== '');
  return words.length < UX_ERROR_WORDING.thresholds.minWords;
}

const errorWording: VisitRule = {
  id: UX_ERROR_WORDING.id,
  run(input) {
    if (input.stateKind !== 'error') return [];
    const found: RawFinding[] = [];
    for (const { index, field } of fieldsOf(input, true)) {
      if (!field.invalid) continue;
      const bad = field.described.find((entry) => vague(entry.text));
      if (bad === undefined) continue;
      found.push(
        ruleFinding(input, {
          rule: UX_ERROR_WORDING.id,
          severity: 'review',
          node: index,
          kit: 'keep',
          message: {
            key: `checkRule.${UX_ERROR_WORDING.key}`,
            params: { field: nameOf(field), text: errorBody(bad.text) },
          },
          hint: { key: `checkHint.${UX_ERROR_WORDING.key}`, params: {} },
        }),
      );
    }
    return found;
  },
};

const brokenAnchor: VisitRule = {
  id: UX_BROKEN_ANCHOR.id,
  run(input) {
    const { nodes } = input.facts;
    const ids = new Set<string>();
    for (const node of nodes) if (node.domId !== null) ids.add(node.domId);
    const found: RawFinding[] = [];
    nodes.forEach((node, index) => {
      const href = node.action?.kind === 'link' ? node.action.href : null;
      if (href === null || !href.startsWith('#') || href.length <= 1) return;
      const target = href.slice(1);
      let decoded = target;
      try {
        decoded = decodeURIComponent(target);
      } catch {
        // A malformed escape: compare the raw text.
      }
      if (ids.has(target) || ids.has(decoded)) return;
      found.push(
        ruleFinding(input, {
          rule: UX_BROKEN_ANCHOR.id,
          severity: 'fix',
          node: index,
          kit: 'keep',
          message: { key: `checkRule.${UX_BROKEN_ANCHOR.key}`, params: { href } },
          hint: { key: `checkHint.${UX_BROKEN_ANCHOR.key}`, params: { target } },
        }),
      );
    });
    return found;
  },
};

const keepsInput: StatesRule = {
  id: UX_KEEPS_INPUT.id,
  run(input: StatesInput) {
    const key = (ks: string, name: string): string => `${ks}\u0000${name}`;
    const before = new Map<string, string>();
    for (const { node, field } of fieldsOf(input.baseline, true)) {
      if (node.ks === null || field.type === 'password') continue;
      const k = key(node.ks, field.name);
      if (!before.has(k)) before.set(k, field.value);
    }
    const found: RawFinding[] = [];
    for (const visit of input.visits) {
      if (visit.stateKind !== 'error') continue;
      for (const { index, node, field } of fieldsOf(visit, true)) {
        if (node.ks === null || field.type === 'password') continue;
        const was = before.get(key(node.ks, field.name));
        if (was === undefined || was === '' || was === field.value) continue;
        found.push(
          ruleFinding(visit, {
            rule: UX_KEEPS_INPUT.id,
            severity: 'fix',
            node: index,
            kit: 'keep',
            message: { key: `checkRule.${UX_KEEPS_INPUT.key}`, params: { field: nameOf(field) } },
            hint: { key: `checkHint.${UX_KEEPS_INPUT.key}`, params: {} },
          }),
        );
      }
    }
    return found;
  },
};

export const UX_FORMS_RULES: VisitRule[] = [
  visibleLabel,
  fieldset,
  requiredMarks,
  labelPosition,
  singleColumn,
  fieldCount,
  inputType,
  submit,
  errorWording,
  brokenAnchor,
];
export const UX_FORMS_STATE_RULES: StatesRule[] = [keepsInput];
