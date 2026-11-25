// The actions of a finding of the full check (plan 18f, task 4; spec S4.8): "Use <token>", an
// ordinary style edit through the editor's own edit path (one undo step), only in Edit mode on the
// latest version; "Ask Claude", a `say` request about the element; and "Show on canvas". The
// button of each is drawn from the store, so a card follows the mode, the kit and a running edit.

import { postRequest } from '../ai/api.ts';
import { inspect } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { fixOps, reasonKey } from '../live/fix.ts';
import { el } from '../props/controls.ts';
import type { EditorState } from '../store.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import { askRequest } from './ask-text.ts';
import { type Evidence, evidenceOf, type FindingFacts } from './evidence.ts';
import { colourProperty, fixToken, planOf, type TokenFix, tokenOf } from './token-fix.ts';

/** The findings Claude was asked about, by the finding, for as long as the page lives. */
const asked = new Map<string, boolean>();

const keyOf = (facts: FindingFacts): string =>
  `${facts.element ?? ''}|${facts.rule}|${facts.message}`;

function button(words: string, className: string): HTMLButtonElement {
  const node = el('button', className, words);
  node.type = 'button';
  return node;
}

/** "Use <token>" is offered in Edit mode, on the latest version, once the kit is known. */
export const canUse = (state: EditorState): boolean =>
  state.on && state.edit !== null && state.viewing === null;

/** What "Use <token>" does: sets the colour to the token on the element, as one undo step. */
async function use(
  ctx: EditorContext,
  facts: FindingFacts,
  fix: TokenFix,
  evidence: Evidence,
): Promise<void> {
  const { element } = facts;
  const state = ctx.store.get();
  const token = tokenOf(fix, state.edit?.tokens ?? []);
  if (element === null || token === undefined || state.edit === null || state.busy) return;
  const answer = await inspect(ctx.slug, element);
  if (!answer.ok) {
    toast(ctx.main, text('checks.use.failed'));
    return;
  }
  // A contrast finding is about the text colour; an off-kit colour is set where the rule holds it.
  const property =
    evidence.kind === 'colour' ? colourProperty(answer.body, evidence.value) : 'color';
  if (property === null) {
    toast(ctx.main, text('checks.use.none'));
    return;
  }
  const now = ctx.store.get();
  if (now.edit === null) return;
  const result = fixOps(planOf(property, token), answer.body, {
    format: now.edit.format,
    tokens: now.edit.tokens,
    locked: now.locked.includes(element),
  });
  if ('reason' in result) {
    toast(ctx.main, text(reasonKey(result.reason)));
    return;
  }
  const label = text('checks.use.label', { token: fix.label });
  await ctx.history.apply({ ops: result.ops, label, flash: true });
}

/** The buttons of one finding, in the order the card shows them. */
export function actionsOf(
  ctx: EditorContext,
  facts: FindingFacts,
  redraw: () => void,
): HTMLElement[] {
  const state = ctx.store.get();
  const tokens = state.edit?.tokens ?? [];
  const buttons: HTMLElement[] = [];
  const fix = canUse(state) && facts.element !== null ? fixToken(facts, tokens) : null;
  if (fix !== null) {
    const evidence = evidenceOf(facts, tokens);
    const apply = button(text('checks.use', { token: fix.label }), 'k-btn k-btn-line');
    apply.disabled = state.busy;
    apply.addEventListener('click', () => {
      apply.disabled = true;
      void use(ctx, facts, fix, evidence).finally(redraw);
    });
    buttons.push(apply);
  }
  const key = keyOf(facts);
  const ask = button(text('ask.button'), 'k-btn k-btn-line');
  const sent = asked.get(key);
  ask.disabled = sent === true;
  if (sent !== undefined) ask.title = text(sent ? 'ask.sent' : 'ask.requestFailed');
  ask.addEventListener('click', () => {
    ask.disabled = true;
    void postRequest(ctx.slug, askRequest(facts)).then((done) => {
      // The answer comes in the Claude tab, where the request shows with its status.
      toast(ctx.main, text(done ? 'ask.sentAi' : 'ask.requestFailed'));
      asked.set(key, done);
      redraw();
    });
  });
  buttons.push(ask);
  const { element } = facts;
  if (element !== null) {
    const show = button(text('checks.show'), 'k-btn k-btn-line');
    show.addEventListener('click', () => ctx.store.set({ selection: [element] }));
    buttons.push(show);
  }
  return buttons;
}
