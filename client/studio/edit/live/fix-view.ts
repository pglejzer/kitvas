// Apply and Ask Claude on a live finding (ADR 0061). `createFixes` keeps the source view of each
// element a fix is planned for (read once per state of the files), the findings a fix was applied
// to and not measured since, and the findings Claude was asked about. `fixControl` draws one
// finding's quiet line (what Apply will do, or why there is none) and its button, Apply or Ask
// Claude, and follows the store. The rules are pure, in `fix.ts`.

import type { Inspect } from '../../../../src/studio/api/edit/edit-schemas.ts';
import { postRequest } from '../ai/api.ts';
import { inspect } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { el } from '../props/controls/controls.ts';
import type { EditorState } from '../store.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import {
  type FixOps,
  type FixPlan,
  type FixReason,
  findingRequest,
  fixOps,
  isPlan,
  labelKey,
  planFix,
  reasonKey,
  says,
} from './fix.ts';
import type { LiveRow } from './items.ts';

export type Fixes = {
  /** The element's source view: `undefined` while it is read (asking starts a read), `null` when it cannot be. */
  view(id: string): Inspect | null | undefined;
  /** A fix of this finding was applied, and no build was measured since. */
  applied(key: string): boolean;
  markApplied(key: string): void;
  /** Claude was asked about this finding: `true` sent, `false` failed, `undefined` not asked. */
  asked(key: string): boolean | undefined;
  markAsked(key: string, sent: boolean): void;
  /** Hears every read that came in and every mark; returns the way to stop. */
  listen(fn: () => void): () => void;
};

export function createFixes(ctx: Pick<EditorContext, 'slug' | 'store'>): Fixes {
  const { slug, store } = ctx;
  const views = new Map<string, Inspect | null>();
  const reading = new Set<string>();
  /** The build count when a fix of the finding was applied. */
  const applied = new Map<string, number>();
  const asked = new Map<string, boolean>();
  const listeners = new Set<() => void>();
  /** Bumped when the files change: a read for older files is dropped. */
  let generation = 0;
  const tell = (): void => {
    for (const fn of [...listeners]) fn();
  };

  store.subscribe((state, previous) => {
    if (state.etags !== previous.etags) {
      generation += 1;
      views.clear();
      reading.clear();
    }
    // The findings of a newer build were measured: an applied fix shows what it did.
    if (state.live === previous.live) return;
    let measured = false;
    for (const [key, builds] of applied) {
      if (state.builds <= builds) continue;
      applied.delete(key);
      measured = true;
    }
    if (measured) tell();
  });

  return {
    view(id) {
      if (views.has(id)) return views.get(id) ?? null;
      if (!reading.has(id)) {
        reading.add(id);
        const mine = generation;
        void inspect(slug, id).then((answer) => {
          if (mine !== generation) return;
          reading.delete(id);
          views.set(id, answer.ok ? answer.body : null);
          tell();
        });
      }
      return undefined;
    },
    applied: (key) => applied.has(key),
    markApplied(key) {
      applied.set(key, store.get().builds);
      tell();
    },
    asked: (key) => asked.get(key),
    markAsked(key, sent) {
      asked.set(key, sent);
      tell();
    },
    listen(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** What a finding's control redraws for: the request, the kit, locks, the files, the timeline. */
const touches = (state: EditorState, previous: EditorState): boolean =>
  state.busy !== previous.busy ||
  state.edit !== previous.edit ||
  state.etags !== previous.etags ||
  state.locked !== previous.locked ||
  state.viewing !== previous.viewing;

/** The parts of a finding's control: the quiet line above its actions, and its button. */
export type FixParts = { line: HTMLElement; button: HTMLElement };

/**
 * The fix of one live finding. A plan with ops on the element: the line says what Apply sets, and
 * Apply (the primary button) applies it through the history, so the change list has it and Undo
 * takes it back. No plan, a refusal, or a kind kitvas does not fix: the line says why (nothing
 * for a kind it never fixes) and Ask Claude files a request. An accepted finding has neither.
 */
export function fixControl(
  ctx: EditorContext,
  fixes: Fixes,
  element: string | null,
  row: LiveRow,
  lead = true,
): FixParts {
  const line = el('p', 'k-meta checks-fix-line');
  const slot = el('span', 'checks-fix');
  const key = `${element ?? ''}|${row.rule}|${row.message}`;

  function button(words: string, className: string): HTMLButtonElement {
    const node = el('button', className, words);
    node.type = 'button';
    return node;
  }

  function askButton(why: FixReason | 'no-token' | null): HTMLButtonElement {
    // Beside a fix of the row ("Use <token>") Ask Claude is the plain second button.
    const ask = button(text('ask.button'), lead ? 'k-btn k-btn-sm k-btn-soft' : 'k-btn k-btn-sm');
    const sent = fixes.asked(key);
    if (sent !== undefined) line.textContent = text(sent ? 'ask.sent' : 'ask.requestFailed');
    ask.disabled = sent === true;
    ask.addEventListener('click', () => {
      ask.disabled = true;
      const { rule, message, widths } = row;
      const request = findingRequest({ element, rule, message, widths, why });
      void postRequest(ctx.slug, request).then((done) => {
        // The answer comes in the Claude tab, where the request shows with its status.
        if (done) toast(ctx.main, text('ask.sentAi'));
        fixes.markAsked(key, done);
      });
    });
    return ask;
  }

  async function run(plan: FixPlan): Promise<void> {
    const state = ctx.store.get();
    // The ops are made now, from the source as the server last described it.
    const view = element === null ? undefined : fixes.view(element);
    if (!view || element === null || state.edit === null || state.busy) return;
    const result = fixOps(plan, view, {
      format: state.edit.format,
      tokens: state.edit.tokens,
      locked: state.locked.includes(element),
    });
    if ('reason' in result) {
      draw();
      return;
    }
    const label = text(labelKey(plan));
    const outcome = await ctx.history.apply({ ops: result.ops, label, flash: true });
    if (outcome?.outcome === 'applied') fixes.markApplied(key);
    else draw();
  }

  function applyButton(plan: FixPlan | null): HTMLButtonElement {
    const apply = button(text('live.fix.apply'), 'k-btn k-btn-sm k-btn-soft');
    const state = ctx.store.get();
    apply.disabled = plan === null || state.busy || state.viewing !== null;
    if (plan !== null) apply.addEventListener('click', () => void run(plan));
    return apply;
  }

  function draw(): void {
    line.replaceChildren();
    slot.replaceChildren();
    if (row.waived) return;
    if (fixes.applied(key)) {
      line.textContent = text('live.fix.applied');
      return;
    }
    const state = ctx.store.get();
    const tokens = state.edit?.tokens ?? [];
    const finding = { rule: row.rule, source: row.source, values: row.values };
    const plan = element === null ? null : planFix(finding, tokens);
    if (!isPlan(plan)) {
      if (plan !== null) line.textContent = text('live.fix.noToken', { needed: plan.needed });
      slot.append(askButton(plan === null ? null : 'no-token'));
      return;
    }
    const said = says(plan, text);
    const view = element === null || state.edit === null ? undefined : fixes.view(element);
    if (view === undefined || element === null || state.edit === null) {
      // The element is being read: Apply waits for it.
      line.textContent = said;
      slot.append(applyButton(null));
      return;
    }
    const result: FixOps =
      view === null
        ? { reason: 'not-found' }
        : fixOps(plan, view, {
            format: state.edit.format,
            tokens,
            locked: state.locked.includes(element),
          });
    if ('reason' in result) {
      line.textContent = text(reasonKey(result.reason));
      slot.append(askButton(result.reason));
      return;
    }
    line.textContent = result.everyItem ? `${said} ${text('live.fix.everyItem')}` : said;
    slot.append(applyButton(plan));
  }

  // A control that was on the page and left it stops listening, so rebuilt lists leak nothing.
  let connected = false;
  const stops: (() => void)[] = [];
  const gone = (): boolean => {
    if (slot.isConnected) connected = true;
    else if (connected) {
      for (const stop of stops) stop();
      return true;
    }
    return false;
  };
  stops.push(
    ctx.store.subscribe((state, previous) => {
      if (!gone() && touches(state, previous)) draw();
    }),
    fixes.listen(() => {
      if (!gone()) draw();
    }),
  );
  draw();
  return { line, button: slot };
}
