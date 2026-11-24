// The Claude tab's parts (spec 4d, goal 2; plan 17, task B; plan 18, task D): the form ("What
// should change?", Send and Improve), the requests with their words, status and Drop, and a card
// per variant with its changes as chips, its signs and its check. A card is chosen by a click (or
// Enter or Space) and applied from the pane's foot (`foot.ts`). Built with `createElement` and
// `textContent` only: the words are the person's and Claude's, never markup. `ai.ts` gives the
// models and does what the handlers say.

import type {
  NewRequest,
  RequestStatus,
  RequestView,
} from '../../../../src/studio/api/requests/request-schemas.ts';
import { icon } from '../../ui/icon.ts';
import { chipRow } from '../history/chip-view.ts';
import type { ChangeChip } from '../history/chips.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import type { CheckResult } from './preview.ts';
import { MAX_REQUEST_TEXT } from './requests.ts';
import { type BuiltVariant, reasonKey } from './variants.ts';

export type CardModel = {
  key: string;
  label: string;
  changes: number;
  /** What it changes: the built ops' values when it is ready, else what its changes set. */
  chips: readonly ChangeChip[];
  built: BuiltVariant;
  /** The request is out of date, or another of its variants was applied here. */
  outdated: boolean;
  applied: boolean;
  /** Why it cannot be tried now though it is ready (a text key); `null` when it can. */
  blocked: string | null;
  /** Some of its ops show only after the build. */
  later: boolean;
  /** The element's name for a problem's words. */
  nameOf(id: string): string;
};

export type RequestModel = {
  request: RequestView;
  /** The elements it is about, by their layer names. */
  names: string;
  cards: CardModel[];
  /** "Ask again" of an out-of-date request; `null`: its elements are gone; `undefined`: none. */
  again: NewRequest | null | undefined;
};

export type Handlers = {
  /** The card was clicked, or Enter or Space was pressed on it: the foot applies it. */
  choose(key: string): void;
  drop(id: string): void;
  again(request: NewRequest): void;
  point(key: string | null): void;
  focus(key: string | null): void;
};

/** A drawn card's parts that change without drawing the list again. */
export type CardParts = { card: HTMLElement; check: HTMLElement };

/** Hears each card as it is drawn. */
type Drawn = (key: string, parts: CardParts) => void;

function button(className: string, words: string, focus: string): HTMLButtonElement {
  const node = el('button', className, words);
  node.type = 'button';
  node.dataset.aiFocus = focus;
  return node;
}

// The form.

export type FormState = {
  selected: number;
  /** Why nothing can be asked now (a text key); `null` when it can. */
  blocked: string | null;
  sending: boolean;
  message: string;
};

export type Form = { element: HTMLFormElement; render(state: FormState): void; clear(): void };

/** The hint under the field: what a request is about, or why none can be made. */
export function formHint(state: Pick<FormState, 'selected' | 'blocked'>): {
  key: string;
  params: Record<string, number>;
} {
  if (state.blocked !== null) return { key: state.blocked, params: {} };
  if (state.selected === 0) return { key: 'ai.noSelection', params: {} };
  if (state.selected === 1) return { key: 'ai.forOne', params: {} };
  return { key: 'ai.forMany', params: { n: state.selected } };
}

export function createForm(handlers: { send(words: string): void; improve(): void }): Form {
  const element = el('form', 'claude-form');
  element.noValidate = true;
  const label = el('label', 'claude-label', text('ai.ask.label'));
  label.htmlFor = 'ai-words';
  const field = el('textarea', 'k-field claude-field');
  field.id = 'ai-words';
  field.rows = 3;
  field.maxLength = MAX_REQUEST_TEXT;
  const hint = el('p', 'k-meta claude-hint');
  hint.id = 'ai-words-hint';
  field.setAttribute('aria-describedby', hint.id);
  const improve = el('button', 'k-btn', text('ai.improve'));
  improve.type = 'button';
  improve.title = text('ai.improve.title');
  const send = el('button', 'k-btn k-btn-line', text('ai.send'));
  send.type = 'submit';
  const actions = el('div', 'claude-form-actions');
  actions.append(improve, send);
  const said = el('p', 'k-meta claude-said');
  said.setAttribute('role', 'status');
  element.append(label, field, hint, actions, said);

  let last: FormState = { selected: 0, blocked: null, sending: false, message: '' };
  const sync = (): void => {
    const off = last.selected === 0 || last.blocked !== null || last.sending;
    send.disabled = off || field.value.trim() === '';
    improve.disabled = off;
  };

  element.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!send.disabled) handlers.send(field.value);
  });
  // Ctrl+Enter (Cmd+Enter) sends; a plain Enter is a new line of the request.
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      element.requestSubmit();
    }
  });
  field.addEventListener('input', sync);
  improve.addEventListener('click', () => {
    if (!improve.disabled) handlers.improve();
  });

  return {
    element,
    render(state) {
      last = state;
      const words = formHint(state);
      hint.textContent = text(words.key, words.params);
      said.textContent = state.sending ? text('ai.sending') : state.message;
      sync();
    },
    clear() {
      field.value = '';
      sync();
    },
  };
}

// The list.

/** A line of the check: a tone mark and its words. */
function checkLine(mark: HTMLElement | SVGSVGElement, words: string): HTMLElement {
  const line = el('p', 'claude-check-line');
  line.append(mark, el('span', undefined, words));
  return line;
}

function dot(state: 'working' | 'fix' | 'review' | null): HTMLElement {
  const mark = el('span', 'k-dot');
  if (state !== null) mark.dataset.state = state;
  mark.setAttribute('aria-hidden', 'true');
  return mark;
}

/** The words of a card's check: none while it cannot be tried. */
export function drawCheck(
  target: HTMLElement,
  model: CardModel,
  check: CheckResult | undefined,
): void {
  target.replaceChildren();
  target.removeAttribute('data-state');
  if (model.built.kind !== 'ready' || model.outdated || model.applied) return;
  if (model.blocked !== null) {
    target.append(el('p', 'k-meta', text(model.blocked)));
    return;
  }
  if (check === undefined) {
    target.append(el('p', 'k-meta', text('ai.check.hint')));
    return;
  }
  target.dataset.state = check.state;
  if (check.state === 'running') {
    target.append(checkLine(dot('working'), text('ai.check.running')));
  } else if (check.state === 'after') {
    target.append(el('p', 'k-meta', text('ai.check.after')));
  } else if (check.problems.length === 0) {
    const ok = icon('check-circle');
    ok.classList.add('k-good');
    target.append(checkLine(ok, text('ai.check.ok')));
  } else {
    const problems = el('ul', 'claude-problems');
    for (const problem of check.problems) {
      const row = el('li', 'claude-check-line');
      row.dataset.tone = problem.severity;
      row.append(dot(problem.severity), el('span', undefined, problem.message));
      problems.append(row);
    }
    target.append(problems);
  }
}

function sign(words: string, tone: 'review' | 'good', title?: string): HTMLElement {
  const node = el('span', 'k-chip claude-sign', words);
  node.dataset.tone = tone;
  if (title !== undefined) node.title = title;
  return node;
}

/** The line under a card's head: why it cannot be applied, or what there is to know. */
function cardNote(model: CardModel): HTMLElement | null {
  const { built } = model;
  // An applied or out-of-date variant is not built again (its elements are not read): its sign
  // says all there is, never "reading" or "already like this" (live check, plan 17).
  if (model.applied || model.outdated) return null;
  if (built.kind === 'loading') return el('p', 'k-meta', text('ai.variant.loading'));
  if (built.kind === 'same') return el('p', 'k-meta', text('ai.variant.same'));
  if (built.kind === 'invalid') {
    const note = el('p', 'claude-variant-problem');
    const { id, reason } = built.problem;
    const words = text('ai.variant.problem', {
      name: model.nameOf(id),
      reason: text(reasonKey(reason)),
    });
    note.append(el('strong', 'k-review', text('ai.variant.invalid')), ' ', words);
    return note;
  }
  return model.later && !model.outdated ? el('p', 'k-meta', text('ai.variant.later')) : null;
}

function variantCard(model: CardModel, handlers: Handlers, drawn: Drawn): HTMLElement {
  const { key } = model;
  const card = el('li', 'k-item claude-variant');
  card.dataset.variant = model.key;
  card.dataset.kind = model.built.kind;
  if (model.outdated) card.dataset.outdated = '';
  // Focusable, so a keyboard previews and checks it as a pointer does.
  card.tabIndex = 0;
  card.dataset.aiFocus = `card:${model.key}`;
  const head = el('div', 'claude-variant-head');
  const count =
    model.changes === 1 ? text('ai.variant.one') : text('ai.variant.count', { n: model.changes });
  head.append(el('span', 'claude-variant-label', model.label), el('span', 'k-meta', count));
  card.append(head);
  const chips = chipRow(model.chips);
  if (chips) card.append(chips);
  const signs = el('div', 'claude-signs');
  if (model.applied) signs.append(sign(text('ai.variant.applied'), 'good'));
  else if (model.outdated) signs.append(sign(text('ai.stale'), 'review'));
  if (model.built.kind === 'ready') {
    const { dropsText, offKit } = model.built;
    const flag = (name: string): HTMLElement =>
      sign(text(`ai.variant.${name}`), 'review', text(`ai.variant.${name}Title`));
    if (dropsText) signs.append(flag('textDrops'));
    if (offKit) signs.append(flag('offKit'));
  }
  if (signs.childElementCount > 0) card.append(signs);
  const note = cardNote(model);
  if (note) card.append(note);
  const check = el('div', 'claude-check');
  check.setAttribute('aria-live', 'polite');
  card.append(check);
  card.addEventListener('pointerenter', (event) => {
    // A button held down is a drag passing over the panel: it previews nothing.
    if (event.buttons === 0) handlers.point(key);
  });
  card.addEventListener('pointerleave', () => handlers.point(null));
  card.addEventListener('focusin', () => handlers.focus(key));
  card.addEventListener('focusout', (event) => {
    const to = event.relatedTarget;
    if (!(to instanceof Node) || !card.contains(to)) handlers.focus(null);
  });
  card.addEventListener('click', () => handlers.choose(key));
  card.addEventListener('keydown', (event) => {
    if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    handlers.choose(key);
  });
  drawn(key, { card, check });
  return card;
}

/** The answer of a request that came to no variants: Claude's closing words or reason. */
function answerLine(request: RequestView): HTMLElement | null {
  const { answer } = request;
  if (answer?.kind === 'done') {
    const message = answer.message.trim();
    const words = message === '' ? text('ai.doneEmpty') : text('ai.done', { message });
    return el('p', 'claude-answer', words);
  }
  if (answer?.kind === 'failed') {
    const line = el('p', 'claude-answer k-review', text('ai.failed', { reason: answer.reason }));
    line.dataset.tone = 'review';
    return line;
  }
  return null;
}

/** The status dot of a request: working while Claude has it, a tone once it is answered. */
const STATUS_DOTS: Record<RequestStatus, 'working' | 'good' | 'fix' | null> = {
  waiting: null,
  taken: 'working',
  answered: 'good',
  failed: 'fix',
  dropped: null,
};

function requestItem(model: RequestModel, handlers: Handlers, drawn: Drawn): HTMLElement {
  const { request } = model;
  const item = el('li', 'claude-request');
  item.dataset.status = request.status;
  item.dataset.kind = request.kind;
  const ask = el('div', 'k-item claude-ask');
  const head = el('div', 'claude-ask-head');
  const state = el('span', 'claude-state');
  const mark = el('span', 'k-dot');
  mark.setAttribute('aria-hidden', 'true');
  const tone = STATUS_DOTS[request.status];
  if (tone !== null) mark.dataset.state = tone;
  state.append(mark, el('span', undefined, text(`ai.state.${request.status}`)));
  head.append(el('span', 'k-chip', text(`ai.kind.${request.kind}`)), state);
  if (request.status === 'waiting') {
    const drop = button('k-btn claude-drop', text('ai.drop'), `drop:${request.id}`);
    drop.setAttribute('aria-label', text('ai.drop.label'));
    drop.addEventListener('click', () => handlers.drop(request.id));
    head.append(drop);
  }
  ask.append(head);
  const words = request.text.trim();
  if (words !== '') ask.append(el('p', 'claude-words', words));
  const { names } = model;
  if (names !== '') ask.append(el('p', 'k-meta', text('ai.on', { names })));
  const answer = answerLine(request);
  if (answer) ask.append(answer);
  const { again } = model;
  if (again !== undefined) {
    const stale = el('div', 'claude-stale');
    stale.append(el('p', 'k-meta', text(again === null ? 'ai.again.gone' : 'ai.stale.note')));
    if (again !== null) {
      const back = button('k-btn k-btn-line', text('ai.again'), `again:${request.id}`);
      back.addEventListener('click', () => handlers.again(again));
      stale.append(back);
    }
    ask.append(stale);
  }
  item.append(ask);
  // The variants are boxes of their own under the request's, never boxes in it.
  if (model.cards.length > 0) {
    const cards = el('ul', 'k-stack claude-variants');
    for (const card of model.cards) cards.append(variantCard(card, handlers, drawn));
    item.append(cards);
  }
  return item;
}

function group(
  title: string | null,
  models: readonly RequestModel[],
  handlers: Handlers,
  drawn: Drawn,
): HTMLElement[] {
  const list = el('ol', 'claude-requests');
  for (const model of models) list.append(requestItem(model, handlers, drawn));
  return title === null ? [list] : [el('h4', 'k-meta claude-group', title), list];
}

/** The requests, those about the selection first; `drawn` hears every card's changing parts. */
export function renderRequests(
  lists: { selected: readonly RequestModel[]; others: readonly RequestModel[] },
  handlers: Handlers,
  drawn: Drawn,
): HTMLElement[] {
  const title = el('h3', 'claude-title', text('ai.requests'));
  const { selected, others } = lists;
  if (selected.length === 0 && others.length === 0) {
    return [title, el('p', 'k-quiet', text('ai.empty'))];
  }
  if (selected.length === 0) return [title, ...group(null, others, handlers, drawn)];
  return [
    title,
    ...group(text('ai.group.selected'), selected, handlers, drawn),
    ...(others.length === 0 ? [] : group(text('ai.group.others'), others, handlers, drawn)),
  ];
}
