// The ask bar (redesign spec goal 10; plan 19, task T3; mock v10 lines 169 to 174 and 889 to 894):
// one line at the canvas's bottom centre, in Edit only. The listening dot, the chip with what is
// selected, the field, the key hint and Send. Enter sends the words to Claude through
// `aiControl().send`; a `/` first opens the commands. The page draws the empty form hidden
// (`draft-stage.ts`); this fills and shows it. The words are data: sent, never run.

import { barStateOf } from '../../shell/bar-status.ts';
import { isMac, shortcutHint } from '../../shell/shortcuts.ts';
import { iconButton } from '../../ui/icon.ts';
import { aiControl } from '../ai/control.ts';
import { commandOf } from '../ai/status.ts';
import type { EditorContext } from '../context.ts';
import { el } from '../props/controls/controls.ts';
import type { EditorState } from '../store.ts';
import { runAction } from '../structure/actions.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import { createCommandList, isListKey, listKey } from './command-list.ts';
import { type Command, commandsFor, queryOf } from './commands.ts';
import { setAskFocus } from './focus.ts';
import { askModel, isSendKey, wordsToSend } from './model.ts';

export function mountAskBar(ctx: EditorContext): void {
  const host = ctx.main.querySelector('form[data-ask-bar]');
  if (!(host instanceof HTMLFormElement)) return;
  const form = host;
  const { store } = ctx;

  const dot = el('span', 'k-dot ask-dot');
  dot.setAttribute('aria-hidden', 'true');
  const chip = el('span', 'k-chip ask-chip');
  const field = el('input', 'ask-field');
  field.type = 'text';
  field.autocomplete = 'off';
  field.spellcheck = false;
  field.setAttribute('role', 'combobox');
  field.setAttribute('aria-label', text('ask.field'));
  field.setAttribute('aria-autocomplete', 'list');
  field.setAttribute('aria-expanded', 'false');
  const hint = el(
    'kbd',
    'k-kbd ask-hint',
    shortcutHint('ask', isMac(navigator.platform), text) ?? '',
  );
  hint.hidden = hint.textContent === '';
  const send = iconButton('arrow-up', text('ask.send'));
  send.type = 'submit';
  send.classList.add('ask-send');
  form.append(dot, chip, field, hint, send);

  // What sits above the bar: the commands, the "not listening" line, and one line of news.
  const above = el('div', 'ask-above');
  const note = el('div', 'k-pop ask-note');
  const noteWords = el('span', 'ask-note-words', text('ask.off.note'));
  const copy = el('button', 'k-btn ask-copy', text('ask.copy'));
  copy.type = 'button';
  note.append(noteWords, el('code', 'ask-note-code', commandOf(ctx.slug)), copy);
  const news = el('p', 'k-meta ask-news');
  news.setAttribute('role', 'status');
  const list = createCommandList((command) => void pick(command));
  above.append(list.element, note, news);
  form.append(above);
  field.setAttribute('aria-controls', list.listboxId);

  let commands: Command[] = [];
  let active = 0;
  /** Escape closed the list for this text; typing opens it again. */
  let dismissed = false;
  let sending = false;
  /** The cursor is in the bar (the field or a button of it). */
  let engaged = false;

  const say = (words: string): void => {
    news.textContent = words;
    news.hidden = words === '';
  };

  function closeList(): void {
    list.hide();
    commands = [];
    field.setAttribute('aria-expanded', 'false');
    field.removeAttribute('aria-activedescendant');
  }

  function drawList(state: EditorState): void {
    const query = queryOf(field.value);
    if (query === null || dismissed || askModel(state).mode !== 'ready') {
      if (list.isOpen()) closeList();
      drawNote(state);
      return;
    }
    commands = commandsFor(state, query);
    active = Math.min(active, Math.max(0, commands.length - 1));
    const id = list.render(commands, active);
    list.show();
    field.setAttribute('aria-expanded', 'true');
    if (id === null) field.removeAttribute('aria-activedescendant');
    else field.setAttribute('aria-activedescendant', id);
    drawNote(state);
  }

  /** The note lies over the canvas: it shows only while the person is at the bar, never with the commands. */
  function drawNote(state: EditorState): void {
    note.hidden = form.hidden || askModel(state).listening || !engaged || list.isOpen();
  }

  /** Picks a command: one that is on runs; one that is off keeps its reason on the screen. */
  async function pick(command: Command): Promise<void> {
    if (!command.enabled) return;
    field.value = '';
    dismissed = false;
    closeList();
    say('');
    if (command.id === 'improve') {
      const control = aiControl();
      if (control === null) return say(text('ask.unavailable'));
      let done = false;
      try {
        done = await control.improve();
      } catch {
        done = false;
      }
      if (!done) say(text('ask.notSent'));
      return;
    }
    await runAction(ctx, command.id);
  }

  async function submit(): Promise<void> {
    if (sending || askModel(store.get()).mode !== 'ready') return;
    const raw = field.value;
    // A `/` is a command, never a request: with no match, Enter sends nothing.
    if (queryOf(raw) !== null) {
      const command = commands[active];
      if (command) await pick(command);
      return;
    }
    const prepared = wordsToSend(raw);
    if (prepared === null) return;
    const control = aiControl();
    if (control === null) {
      say(text('ask.unavailable'));
      return;
    }
    sending = true;
    send.disabled = true;
    let sent = false;
    try {
      sent = await control.send(prepared.words);
    } catch {
      sent = false;
    }
    sending = false;
    send.disabled = false;
    if (!sent) {
      say(text('ask.notSent'));
      return;
    }
    // The field clears only when it was sent, and only if the person typed nothing meanwhile.
    if (field.value === raw) field.value = '';
    closeList();
    say(prepared.cut ? text('ask.cut', { n: prepared.words.length }) : '');
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });

  field.addEventListener('input', () => {
    dismissed = false;
    active = 0;
    say('');
    drawList(store.get());
  });

  field.addEventListener('keydown', (event) => {
    // Our keys never reach the page's key handler: it skips prevented events.
    const take = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (list.isOpen() && isListKey(event.key) && !event.isComposing) {
      const step = listKey(commands, active, event.key);
      take();
      if (step.kind === 'move') {
        active = step.active;
        drawList(store.get());
      } else if (step.kind === 'run') {
        void pick(step.command);
      } else if (step.kind === 'close') {
        dismissed = true;
        closeList();
      }
      return;
    }
    if (isSendKey(event)) {
      take();
      void submit();
    } else if (event.key === 'Escape' && field.value === '') {
      take();
      field.blur();
    }
  });

  copy.addEventListener('click', () => {
    const done = (key: string): void => toast(ctx.main, text(key));
    try {
      void navigator.clipboard.writeText(commandOf(ctx.slug)).then(
        () => done('copy.done'),
        () => done('ai.copy.failed'),
      );
    } catch {
      done('ai.copy.failed');
    }
  });

  function render(state: EditorState): void {
    const model = askModel(state);
    form.hidden = model.mode === 'off' || model.mode === 'viewing';
    form.dataset.mode = model.mode;
    const ready = model.mode === 'ready';
    field.disabled = !ready;
    field.placeholder = model.placeholder;
    send.disabled = !ready || sending;
    chip.hidden = model.chip === null;
    chip.textContent = model.chip ?? '';
    const bar = barStateOf(state.listening);
    if (bar === null) dot.removeAttribute('data-state');
    else dot.dataset.state = bar;
    // The words stay while the field is off (nothing selected for a moment); only the list closes.
    drawList(state);
    if (form.hidden) say('');
  }

  form.addEventListener('focusin', () => {
    engaged = true;
    render(store.get());
  });
  form.addEventListener('focusout', (event) => {
    // A press on Copy keeps the note: the focus only moves inside the bar.
    const next = event.relatedTarget;
    engaged = next instanceof Node && form.contains(next);
    render(store.get());
  });

  setAskFocus(() => {
    if (form.hidden || field.disabled) return false;
    field.focus();
    return true;
  });
  say('');
  render(store.get());
  store.subscribe((state) => render(state));
}
