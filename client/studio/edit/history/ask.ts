// The "Ask Claude" button on an edit kitvas cannot write itself (plan 13, task K): a refused edit,
// or a conflict where the place is gone. Since stage 4d (plan 17, task B) it sends an `ask`
// request of the draft, with the edit the person wanted (its ops) and its words: the request is
// kept on disk until a listening Claude Code session takes it, and the Claude tab shows its status
// and answer. The words are written for Claude, in English, so they are constants here and not
// page texts; the button and its status lines come from `text()`.

import type { EditOp, Refusal, StyleContext } from '../../../../src/edit/index.ts';
import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import type { NewRequest } from '../../../../src/studio/api/requests/request-schemas.ts';
import { postRequest } from '../ai/api.ts';
import { MAX_REQUEST_ELEMENTS, MAX_REQUEST_TEXT, MAX_VARIANT_CHANGES } from '../ai/requests.ts';
import type { EditorContext } from '../context.ts';
import type { Conflict, Gesture, Refused } from '../store.ts';
import { elementOf as opElement } from '../store.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';

/** What Claude is asked to do: a gesture the editor could not write, and why. */
export type AskSubject = {
  gesture: Gesture;
  /** The op the reason is about. */
  index: number;
  reason: Refusal | 'gone' | 'changed';
};

/** The longest note the studio-wide inbox takes (`NewNoteSchema`). */
export const MAX_NOTE = 4_000;

const REASONS: Record<AskSubject['reason'], string> = {
  computed: 'the value is an expression in the source, not a plain literal',
  spread: 'the tag spreads props, so the prop may be set elsewhere',
  'not-found': 'the place in the source was not found',
  ambiguous: 'more than one place in the source matches',
  'no-text': 'the element has no single plain text child',
  'has-class': 'the element already has a className',
  'no-classname': 'the component does not take a className',
  utility: 'the value comes from a utility class',
  nested: 'the style is set in a nested block or a media query',
  invalid: 'the result would not compile',
  gone: 'the place was removed from the source by someone else',
  changed: 'the place was changed by someone else',
  'in-expression': 'the element is written inside an expression (a list or a condition)',
  'section-root': 'the element is the root of a section, which moves as a section',
  'slot-root': "the element is a prop's value, which can only be replaced",
  scope: 'the code names a variable or a component that does not exist where it would go',
  'class-clash': 'a class of the element has another rule of the same name in the target section',
  'not-accepted': 'the target takes no children',
  mixed: 'the target mixes text and elements',
  'nested-interactive': 'it would put an interactive element inside another',
  'not-siblings': 'the elements are not siblings of one parent',
  'no-element-children': 'the element does not start and end with child elements',
  'unknown-component': 'the code names a component the kit does not have',
  'kit-mismatch': 'the section comes from a draft that uses another kit',
  'not-in-session': 'the element did not exist when the session started',
  'into-self': 'the element would go inside itself',
  'prop-covered':
    'a prop of the component sets this property, so it has one value for every width and state',
  'not-breakpoint': 'the width is not one of the kit breakpoints',
  'list-not-literal': 'the list does not map over a literal array in the same file',
  'list-item-gone': 'the list has no item at that place any more',
  'list-text-not-literal': 'the text is not a plain string field of the list item',
  'not-list-item':
    'the element is a part of a list item, not the root element the list renders for each item',
  'utility-unknown': 'kitvas does not know how to change this utility class',
  locked: 'the element is locked, so the editor keeps it as it is',
  'kit-state-wins':
    "the kit's own style for this state is more specific than a class rule, so a value set there would not show",
  'item-key': "the list's key does not give each item a name a class can use",
};

const tokenName = (token: string): string => token.replace(/^--kit-/, '').replace('-', '.');

function styleWords(value: { token: string } | { raw: string }): string {
  return 'token' in value ? tokenName(value.token) : value.raw;
}

function propWords(value: { kind: string; value: string | number | boolean }): string {
  return value.kind === 'string' ? `"${value.value}"` : String(value.value);
}

/** ADR 0060: a text written through its source, at the copy its path names. */
function sourceWords(op: Extract<EditOp, { op: 'setItemText' }>, path: readonly number[]): string {
  const places = path.map((place) => place + 1);
  const where =
    places.length === 0
      ? ''
      : places.length === 1
        ? ` in item ${places[0]} of the list`
        : ` in item ${places.join(' > ')} of the nested lists`;
  const wanted = op.value === op.before ? '' : ` to "${op.value}"`;
  return `change the text "${op.before}"${where}${wanted}`;
}

/**
 * ADR 0065: the item a list op names. In a list inside another the path says which outer item's
 * list it is, so the words name every place, outer first.
 */
function itemWords(item: number, path: readonly number[] | undefined): string {
  if (path === undefined || path.length < 2) return `item ${item + 1} of the list`;
  return `item ${path.map((place) => place + 1).join(' > ')} of the nested lists`;
}

/** A move by path: the place in the item's own list, or the item it stands before elsewhere. */
function moveWords(op: Extract<EditOp, { op: 'moveItem' }>): string {
  const from = itemWords(op.item, op.path);
  const { path, toPath } = op;
  if (path === undefined || toPath === undefined || path.length < 2) {
    return `move ${from} to place ${op.to + 1}`;
  }
  const same = path.slice(0, -1).every((place, depth) => place === toPath[depth]);
  if (same) return `move ${from} to place ${op.to + 1} of its list`;
  return `move ${from} to place ${toPath.map((place) => place + 1).join(' > ')}`;
}

/** Text refusals the hint above Ask Claude words itself; every other one has the general hint. */
const TEXT_REASONS: ReadonlySet<AskSubject['reason']> = new Set<AskSubject['reason']>([
  'computed',
  'ambiguous',
  'no-text',
  'not-found',
  'list-item-gone',
]);

/** The hint above Ask Claude (a key): why a text cannot be typed in place, else the general one. */
export function hintKey(subject: AskSubject): string {
  const op = subject.gesture.ops[subject.index];
  const isText = op?.op === 'setText' || op?.op === 'setItemText';
  return isText && TEXT_REASONS.has(subject.reason) ? `ask.text.${subject.reason}` : 'ask.hint';
}

/** The wanted change of one op, in words. */
export function opWords(op: EditOp): string {
  switch (op.op) {
    case 'setProp':
      return `set ${op.name} to ${propWords(op.value)}`;
    case 'removeProp':
      return `remove the ${op.name} prop`;
    case 'setText':
      return `change the text to "${op.value}"`;
    case 'setStyle':
      return `set ${op.property} to ${styleWords(op.value)} in the class "${op.className}"`;
    case 'removeStyle':
      return `remove ${op.property} from the class "${op.className}"`;
    case 'addClass':
      return `add the class "${op.className}"`;
    case 'removeClass':
      return `remove the class "${op.className}"`;
    case 'setUtility':
      return op.value === null
        ? `remove the utility class "${op.before ?? ''}"`
        : `use the utility class "${op.value}"${op.before === null ? '' : ` instead of "${op.before}"`}`;
    case 'moveItem':
      return moveWords(op);
    case 'duplicateItem':
      return `duplicate ${itemWords(op.item, op.path)}`;
    case 'removeItem':
      return `delete ${itemWords(op.item, op.path)}`;
    case 'addItemClass':
      return `give ${itemWords(op.path.at(-1) ?? 0, op.path)} its own class "${op.className}"`;
    case 'setItemText':
      return op.path === undefined
        ? `change the text of item ${op.item + 1} of the list to "${op.value}"`
        : sourceWords(op, op.path);
    case 'moveElement':
      return `move the element ${op.place} ${op.anchor}`;
    case 'insertElement':
      return `insert ${op.source.slice(0, 200)} ${op.place} ${op.anchor}`;
    case 'removeElement':
      return 'delete the element';
    case 'wrapElements':
      return `wrap the elements from ${op.first} to ${op.last} in ${op.open}`;
    case 'unwrapElement':
      return 'replace the element with its children';
    case 'replaceTag':
      return `replace the element with a ${op.tag}`;
    case 'replaceElement':
      return `replace the element with ${op.source.slice(0, 200)}`;
    case 'resetElement':
      return 'put the element back as it was when the session started';
    case 'moveSection':
      return `move the section "${op.section}" ${op.after ? `after "${op.after}"` : 'to the top'}`;
    case 'insertSection':
      return `copy the section "${op.from.section}" of the draft "${op.from.slug}"`;
    case 'removeSection':
      return `delete the section "${op.section}"`;
    case 'patch':
    case 'file':
      return `undo an earlier change in ${op.file}`;
  }
}

/** The element a subject is about: the id of its op. */
export function elementOf(subject: AskSubject): string | null {
  const op = subject.gesture.ops[subject.index] ?? subject.gesture.ops[0];
  return op ? opElement(op) : null;
}

/**
 * The words for Claude: the element, the wanted change, and the reason, at most `max` long. A
 * long change (an inserted subtree) is cut short, so the reason always reaches Claude.
 */
export function askText(subject: AskSubject, inspected: Inspect | null, max = MAX_NOTE): string {
  const ops = subject.gesture.ops;
  const first = ops[subject.index] ?? ops[0];
  const id = first ? opElement(first) : null;
  const where = id ? ` (element ${id})` : '';
  const tag = inspected && inspected.id === id ? ` The element is a ${inspected.tag}.` : '';
  const file = inspected && inspected.id === id ? ` Its file is ${inspected.file}.` : '';
  const all = ops.map(opWords).join('; then ') || 'a change';
  const head = `Please make this change in the draft source${where}: `;
  const why = REASONS[subject.reason];
  const reason = `The studio could not write it itself because ${why}.${tag}${file}`;
  // Room for the change between the head and ". " before the reason.
  const room = max - head.length - reason.length - 2;
  const wanted = all.length <= room ? all : `${all.slice(0, Math.max(0, room - 1))}…`;
  return `${head}${wanted}. ${reason}`.slice(0, max);
}

/**
 * The `ask` request of a subject (spec 4d, goal 1): the elements its ops name (the one the reason
 * is about first), the edit context it was made in, the words, and the ops themselves, so Claude
 * sees exactly the edit the person wanted.
 */
export function askRequestOf(
  subject: AskSubject,
  inspected: Inspect | null,
  context: StyleContext,
): NewRequest {
  const named = subject.gesture.ops.map(opElement);
  const ids = [elementOf(subject), ...named].filter((id): id is string => id !== null);
  const ops = subject.gesture.ops.slice(0, MAX_VARIANT_CHANGES);
  return {
    kind: 'ask',
    elements: [...new Set(ids)].slice(0, MAX_REQUEST_ELEMENTS),
    context: { width: context.width, state: context.state, option: context.option },
    text: askText(subject, inspected, MAX_REQUEST_TEXT).trim(),
    ...(ops.length > 0 ? { ops } : {}),
  };
}

/** The subject to ask about now: a refused edit, else a conflict whose place is gone. */
export function subjectOf(refused: Refused | null, conflict: Conflict | null): AskSubject | null {
  if (refused) return { gesture: refused.gesture, index: refused.index, reason: refused.reason };
  if (conflict && conflict.outcome.reason === 'gone') {
    return { gesture: conflict.gesture, index: conflict.outcome.index, reason: 'gone' };
  }
  return null;
}

export function mountAsk(ctx: EditorContext): void {
  // A refused edit (plan 18): a note above the panes, beside the conflict note, that rises in.
  const box = document.createElement('div');
  box.className = 'conflict-ask k-rise';
  box.dataset.edit = 'ask';
  box.hidden = true;
  const hint = document.createElement('p');
  hint.className = 'conflict-ask-hint';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'k-btn k-btn-line';
  button.textContent = text('ask.button');
  const status = document.createElement('span');
  status.className = 'k-meta conflict-ask-status';
  status.setAttribute('role', 'status');
  const actions = document.createElement('div');
  actions.className = 'conflict-actions';
  actions.append(button, status);
  box.append(hint, actions);
  // In the right panel under the conflict box, outside the panes their renders replace.
  const conflict = ctx.panel.querySelector('[data-edit="conflict"]');
  if (conflict) conflict.after(box);
  else ctx.panel.append(box);

  let current: AskSubject | null = null;

  const render = (): void => {
    const { refused, conflict } = ctx.store.get();
    const next = subjectOf(refused, conflict);
    if (next?.gesture !== current?.gesture) status.textContent = '';
    current = next;
    box.hidden = next === null;
    hint.textContent = next ? text(hintKey(next)) : '';
    button.disabled = false;
  };

  button.addEventListener('click', () => {
    const subject = current;
    if (!subject) return;
    button.disabled = true;
    status.textContent = '';
    const { inspected, context } = ctx.store.get();
    void postRequest(ctx.slug, askRequestOf(subject, inspected, context)).then((sent) => {
      status.textContent = text(sent ? 'ask.sent' : 'ask.requestFailed');
      button.disabled = sent;
      // The answer comes in the Claude tab, where the request shows with its status.
      if (sent) toast(ctx.main, text('ask.sentAi'));
    });
  });

  ctx.store.subscribe((state, previous) => {
    if (state.refused !== previous.refused || state.conflict !== previous.conflict) render();
  });
  render();
}
