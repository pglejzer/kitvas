// The "Ask Claude" button on an edit kitvas cannot write itself (plan 13, task K): a refused edit,
// or a conflict where the place is gone. It leaves a note in the inbox that `kitvas inbox` hands to
// Claude. The note is written for Claude, in English, so its words are constants here and not
// page texts; the button and its status lines come from `text()`.

import type { EditOp, Refusal } from '../../../src/edit/index.ts';
import type { Inspect } from '../../../src/studio/api/edit-schemas.ts';
import type { EditorContext } from './context.ts';
import type { Conflict, Gesture, Refused } from './store.ts';
import { text } from './texts.ts';

/** What Claude is asked to do: a gesture the editor could not write, and why. */
export type AskSubject = {
  gesture: Gesture;
  /** The op the reason is about. */
  index: number;
  reason: Refusal | 'gone' | 'changed';
};

/** The longest note the inbox takes (`NewNoteSchema`). */
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
};

const tokenName = (token: string): string => token.replace(/^--kit-/, '').replace('-', '.');

function styleWords(value: { token: string } | { raw: string }): string {
  return 'token' in value ? tokenName(value.token) : value.raw;
}

function propWords(value: { kind: string; value: string | number | boolean }): string {
  return value.kind === 'string' ? `"${value.value}"` : String(value.value);
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
  }
}

/** The element a subject is about: the id of its op. */
export function elementOf(subject: AskSubject): string | null {
  const op = subject.gesture.ops[subject.index] ?? subject.gesture.ops[0];
  return op ? op.id : null;
}

/** The note's text: the element, the wanted change in words, and the reason. */
export function askText(subject: AskSubject, inspected: Inspect | null): string {
  const ops = subject.gesture.ops;
  const first = ops[subject.index] ?? ops[0];
  const where = first ? ` (element ${first.id})` : '';
  const tag = inspected && inspected.id === first?.id ? ` The element is a ${inspected.tag}.` : '';
  const file = inspected && inspected.id === first?.id ? ` Its file is ${inspected.file}.` : '';
  const wanted = ops.map(opWords).join('; then ');
  const lines = [
    `Please make this change in the draft source${where}: ${wanted || 'a change'}.`,
    `The studio could not write it itself because ${REASONS[subject.reason]}.${tag}${file}`,
  ];
  return lines.join(' ').slice(0, MAX_NOTE);
}

export type NoteBody = {
  kind: 'note';
  slug: string;
  element: string | null;
  text: string;
};

export function noteOf(slug: string, subject: AskSubject, inspected: Inspect | null): NoteBody {
  return {
    kind: 'note',
    slug,
    element: elementOf(subject),
    text: askText(subject, inspected),
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

async function postNote(body: NoteBody): Promise<boolean> {
  try {
    const response = await fetch('/api/v1/inbox', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function mountAsk(ctx: EditorContext): void {
  const box = document.createElement('div');
  box.className = 'edit-ask';
  box.dataset.edit = 'ask';
  box.hidden = true;
  const hint = document.createElement('span');
  hint.className = 'edit-ask-hint';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text('ask.button');
  const status = document.createElement('span');
  status.className = 'edit-ask-status';
  status.setAttribute('role', 'status');
  box.append(hint, button, status);
  ctx.panel.append(box);

  let current: AskSubject | null = null;

  const render = (): void => {
    const { refused, conflict } = ctx.store.get();
    const next = subjectOf(refused, conflict);
    if (next?.gesture !== current?.gesture) status.textContent = '';
    current = next;
    box.hidden = next === null;
    hint.textContent = next ? text('ask.hint') : '';
    button.disabled = false;
  };

  button.addEventListener('click', () => {
    const subject = current;
    if (!subject) return;
    button.disabled = true;
    status.textContent = '';
    void postNote(noteOf(ctx.slug, subject, ctx.store.get().inspected)).then((sent) => {
      status.textContent = text(sent ? 'ask.sent' : 'ask.failed');
      button.disabled = sent;
    });
  });

  ctx.store.subscribe((state, previous) => {
    if (state.refused !== previous.refused || state.conflict !== previous.conflict) render();
  });
  render();
}
