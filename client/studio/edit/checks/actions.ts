// The actions of a finding of the full check (plan 18f, task 4; spec S4.8): "Use <token>", an
// ordinary style edit through the editor's own edit path (one undo step), only in Edit mode on the
// latest version; "Ask Claude", a `say` request about the element; and "Show on canvas". Two small
// text buttons at most (`action-plan.ts`); Ask Claude is an icon in the head beside a fix. The
// button of each is drawn from the store, so a card follows the mode, the kit and a running edit.

import { choiceStoreOf } from '../../options/choice.ts';
import { iconButton } from '../../ui/icon.ts';
import { postRequest } from '../ai/api.ts';
import { inspect } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { fixOps, reasonKey } from '../live/fix.ts';
import { el } from '../props/controls/controls.ts';
import type { EditorState } from '../store.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import { planActions } from './action-plan.ts';
import { askRequest } from './ask-text.ts';
import { type Evidence, evidenceOf, type FindingFacts } from './evidence.ts';
import { choiceOf } from './option-chip.ts';
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
export async function applyToken(
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

/** A small text button; a long label is cut with an ellipsis and keeps its full text in `title`. */
function small(words: string, className: string): HTMLButtonElement {
  const node = button('', `k-btn k-btn-sm ${className}`);
  node.title = words;
  node.append(el('span', 'k-clip', words));
  return node;
}

/** What a card offers: the text buttons for its foot, and the icon buttons for its head. */
export type CardActions = { foot: HTMLElement[]; tools: HTMLElement[] };

/**
 * The actions of one finding (`action-plan.ts`): at most two text buttons, the fix or Ask Claude
 * (quiet filled) and Show on canvas (plain); with a fix, Ask Claude is an icon button in the head.
 */
export function actionsOf(
  ctx: EditorContext,
  facts: FindingFacts,
  redraw: () => void,
): CardActions {
  const state = ctx.store.get();
  const tokens = state.edit?.tokens ?? [];
  const fix = canUse(state) && facts.element !== null ? fixToken(facts, tokens) : null;
  const plan = planActions({ fix: fix !== null, element: facts.element });
  const foot: HTMLElement[] = [];
  const tools: HTMLElement[] = [];

  function askButton(node: HTMLButtonElement): HTMLButtonElement {
    const key = keyOf(facts);
    const sent = asked.get(key);
    node.disabled = sent === true;
    if (sent !== undefined) node.title = text(sent ? 'ask.sent' : 'ask.requestFailed');
    node.addEventListener('click', () => {
      node.disabled = true;
      void postRequest(ctx.slug, askRequest(facts)).then((done) => {
        // The answer comes in the Claude tab, where the request shows with its status.
        toast(ctx.main, text(done ? 'ask.sentAi' : 'ask.requestFailed'));
        asked.set(key, done);
        redraw();
      });
    });
    return node;
  }

  if (plan.lead === 'use' && fix !== null) {
    const evidence = evidenceOf(facts, tokens);
    const apply = small(text('checks.use', { token: fix.label }), 'k-btn-soft');
    apply.disabled = state.busy;
    apply.addEventListener('click', () => {
      apply.disabled = true;
      void applyToken(ctx, facts, fix, evidence).finally(redraw);
    });
    foot.push(apply);
  } else {
    foot.push(askButton(small(text('ask.button'), 'k-btn-soft')));
  }
  const { element } = facts;
  if (plan.show && element !== null) {
    const show = small(text('checks.show'), '');
    show.addEventListener('click', () => {
      // A finding seen only with option values shows them first, so the element is on the page.
      const seenWith = facts.options ?? [];
      if (seenWith.length > 0) choiceStoreOf(ctx.main)?.set(choiceOf(seenWith));
      ctx.store.set({ selection: [element] });
      // The frame handles messages in order: it scrolls, then the ring flashes where it now is.
      ctx.bridge.reveal?.(element);
      ctx.bridge.flash?.([element]);
    });
    foot.push(show);
  }
  if (plan.askIcon) {
    const label = text('ask.button');
    const ask = iconButton('tab-claude', label);
    ask.dataset.checksAsk = '';
    tools.push(askButton(ask));
  }
  return { foot, tools };
}
