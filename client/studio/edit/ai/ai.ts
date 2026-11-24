// The Claude tab (spec 4d, goals 1 and 2; plan 17, task B): "What should change?", Improve, the
// listening status, the draft's requests and their variants (preview on hover, checks, apply as
// one gesture). Fills `store.requests` and `store.listening`: read on start, on each `requests`
// event of this draft, after a change of its files (a request goes out of date) and, while a
// session is seen, now and then (`status.ts`). The decisions are in the pure files beside it:
// `requests.ts` (data and order), `variants.ts` (changes to ops), `preview.ts` (preview and
// checks), `names.ts`, `status.ts`, `tab.ts` and `foot.ts` (what is drawn). Plan 18, task D: the
// pane scrolls between its content and the foot, where Apply and Discard act on the chosen card.

import type {
  NewRequest,
  RequestView,
} from '../../../../src/studio/api/requests/request-schemas.ts';
import type { Frame } from '../../frames.ts';
import { sourceOf } from '../../live/job-events.ts';
import { onStudioEvent } from '../../live/live.ts';
import { inspect } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { changeChips, opChips } from '../history/chips.ts';
import { el } from '../props/controls.ts';
import type { EditorState } from '../store.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import { dropRequest, getRequests, postRequest } from './api.ts';
import { chosenOf, createFoot } from './foot.ts';
import { blockedOf, missing, namesOf, presenceOf } from './names.ts';
import {
  createVariantPreview,
  measuringFrame,
  type Previewable,
  showsLater,
  type VariantPreview,
} from './preview.ts';
import {
  againRequest,
  improveRequest,
  orderRequests,
  requestsSlugOf,
  sayRequest,
  variantKey,
  variantsOf,
} from './requests.ts';
import { createStatus, LISTEN_RECHECK_MS, recheckLater } from './status.ts';
import {
  type CardModel,
  type CardParts,
  createForm,
  drawCheck,
  type RequestModel,
  renderRequests,
} from './tab.ts';
import { type BuiltVariant, buildVariant, type ElementView, variantIds } from './variants.ts';

export { blockedOf, namesOf, presenceOf } from './names.ts';

/** Inspect answers that come close together are drawn once. */
const DRAW_MS = 16;

type Drawn = { model: CardModel; parts: CardParts; request: string; index: number };

export function mountAi(ctx: EditorContext): void {
  const section = ctx.panel.querySelector('section[data-edit="ai"]');
  if (!(section instanceof HTMLElement)) return;
  const { store, bridge, slug, main, history } = ctx;

  /** Each element a variant names, as the server described it since the files last changed. */
  const views = new Map<string, ElementView>();
  const reading = new Set<string>();
  let generation = 0;
  /** The variant applied from this page, by request: its card says Applied, the others not. */
  const applied = new Map<string, number>();
  let applying: string | null = null;
  /** The card the foot acts on: the last one clicked, or chosen with Enter or Space. */
  let chosen: string | null = null;
  let sending = false;
  let said = '';
  let dragging = false;
  let cards = new Map<string, Drawn>();
  let drawTimer: ReturnType<typeof setTimeout> | null = null;

  const root = el('div', 'k-pad claude');
  const status = createStatus(slug, main);
  const form = createForm({ send, improve });
  const list = el('div', 'claude-list');
  root.append(status.element, form.element, list);
  const scroll = el('div', 'k-scroll');
  scroll.append(root);
  const foot = createFoot({
    apply: (key) => void apply(key),
    discard: () => choose(null),
  });
  // C8: the part that scrolls, then the foot that stays in view.
  section.append(scroll, foot.element);

  const preview: VariantPreview = createVariantPreview({
    show: (changes, width) => {
      if (bridge.sendPreview) bridge.sendPreview(changes, width);
      else bridge.send({ type: 'preview', changes });
    },
    hide: () => bridge.send({ type: 'unpreview' }),
    measure: (ids, width) => {
      const source = bridge.cards;
      const widthOf = source ? (frame: Frame): number => source.widthOf(frame) : undefined;
      const frame = measuringFrame(bridge.frames(), widthOf, width);
      if (!frame) return null;
      const request = bridge.nextRequest();
      bridge.sendLive({ type: 'measure-live', request, ids, expect: [] }, frame);
      return request;
    },
    allowed: () => {
      const state = store.get();
      return state.on && !state.busy && state.viewing === null && !dragging;
    },
    find: (key) => previewableOf(key),
    shown: (key) => {
      const drawn = key === null ? undefined : cards.get(key);
      const next = drawn ? { request: drawn.request, index: drawn.index } : null;
      const now = store.get().variant;
      const same = now?.request === next?.request && now?.index === next?.index;
      if (!same) store.set({ variant: next });
    },
    checked: (key) => {
      const drawn = cards.get(key);
      if (drawn) drawCheck(drawn.parts.check, drawn.model, preview.check(key));
    },
  });

  function previewableOf(key: string): Previewable | null {
    const drawn = cards.get(key);
    if (!drawn) return null;
    const { model } = drawn;
    if (model.built.kind !== 'ready' || model.outdated || model.applied) return null;
    if (model.blocked !== null) return null;
    const request = store.get().requests.find((one) => one.id === drawn.request);
    return { ops: model.built.ops, ids: model.built.ids, width: request?.context.width ?? null };
  }

  // The requests: one read at a time; a change during it asks for one more.
  let readingRequests = false;
  let readAgain = false;
  let recheck: ReturnType<typeof setTimeout> | null = null;

  function read(): void {
    if (readingRequests) {
      readAgain = true;
      return;
    }
    readingRequests = true;
    void getRequests(slug).then((answer) => {
      readingRequests = false;
      if (answer) store.set({ requests: answer.requests, listening: answer.listening });
      if (recheck !== null) clearTimeout(recheck);
      const later = answer !== null && recheckLater(answer.listening);
      recheck = later ? setTimeout(read, LISTEN_RECHECK_MS) : null;
      if (readAgain) {
        readAgain = false;
        read();
      }
    });
  }

  // The variants' elements, read as the server has them now.
  function forget(): void {
    generation += 1;
    views.clear();
    reading.clear();
    preview.reset();
  }

  function drawSoon(): void {
    if (drawTimer !== null) return;
    drawTimer = setTimeout(() => {
      drawTimer = null;
      draw();
    }, DRAW_MS);
  }

  function want(ids: readonly string[]): void {
    const mine = generation;
    for (const id of ids) {
      if (views.has(id) || reading.has(id)) continue;
      reading.add(id);
      void inspect(slug, id).then((answer) => {
        // The files changed meanwhile: the answer describes an element that is not so now.
        if (mine !== generation) return;
        reading.delete(id);
        views.set(id, answer.ok ? answer.body : missing(answer.status));
        drawSoon();
      });
    }
  }

  function buildOf(request: RequestView, index: number, state: EditorState): BuiltVariant {
    const variant = variantsOf(request)[index];
    if (!variant) return { kind: 'loading', ids: [] };
    if (state.edit === null) return { kind: 'loading', ids: variantIds(variant) };
    return buildVariant(variant, {
      views,
      format: state.edit.format,
      context: request.context,
      tokens: state.edit.tokens,
      locked: state.locked,
    });
  }

  function modelOf(
    request: RequestView,
    state: EditorState,
    nameOf: (id: string) => string,
  ): RequestModel {
    const variants = variantsOf(request);
    const done = applied.get(request.id);
    const outdated = request.stale || done !== undefined;
    // Only variants that may still be applied need their elements read.
    if (!outdated) want(variants.flatMap(variantIds));
    const blocked = blockedOf(state);
    const models = variants.map((variant, index): CardModel => {
      const made = buildOf(request, index, state);
      return {
        key: variantKey(request.id, index),
        label: variant.label,
        changes: variant.changes.length,
        chips: made.kind === 'ready' ? opChips(made.ops) : changeChips(variant.changes),
        built: made,
        outdated: outdated && done !== index,
        applied: done === index,
        blocked,
        later: made.kind === 'ready' && showsLater(made.ops),
        nameOf,
      };
    });
    // Ask again once nothing of it was applied here.
    const again =
      request.stale && done === undefined && variants.length > 0
        ? againRequest(request, presenceOf(state.tree))
        : undefined;
    return { request, names: request.elements.map(nameOf).join(', '), cards: models, again };
  }

  /** The foot and the chosen card's ring follow the store's `busy` without drawing the cards. */
  function syncButtons(): void {
    const { busy } = store.get();
    for (const [key, { parts }] of cards) parts.card.toggleAttribute('data-on', key === chosen);
    const some = cards.size > 0;
    foot.render({ chosen: chosenOf(chosen, cards), busy: busy || applying !== null, some });
  }

  function choose(key: string | null): void {
    chosen = key;
    syncButtons();
  }

  /** What has focus in the list, so the same control has it again after a redraw. */
  function focusMark(): string | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !list.contains(active)) return null;
    return active.dataset.aiFocus ?? null;
  }

  function draw(): void {
    const state = store.get();
    const mark = focusMark();
    const nameOf = namesOf(state.tree);
    const { selected, others } = orderRequests(state.requests, state.selection);
    const models = {
      selected: selected.map((request) => modelOf(request, state, nameOf)),
      others: others.map((request) => modelOf(request, state, nameOf)),
    };
    const byKey = new Map<string, Omit<Drawn, 'parts'>>();
    for (const model of [...models.selected, ...models.others]) {
      model.cards.forEach((card, index) => {
        byKey.set(card.key, { model: card, request: model.request.id, index });
      });
    }
    const next = new Map<string, Drawn>();
    list.replaceChildren(
      ...renderRequests(models, handlers, (key, parts) => {
        const known = byKey.get(key);
        if (known) next.set(key, { ...known, parts });
      }),
    );
    cards = next;
    // A chosen card that is gone, or can no longer be applied, is chosen no more.
    if (chosenOf(chosen, cards) === null) chosen = null;
    for (const [key, drawn] of cards) {
      drawCheck(drawn.parts.check, drawn.model, preview.check(key));
    }
    syncButtons();
    if (mark !== null) {
      const same = [...list.querySelectorAll<HTMLElement>('[data-ai-focus]')].find(
        (one) => one.dataset.aiFocus === mark,
      );
      same?.focus();
    }
    // The card shown may be gone, or not ready any more.
    preview.refresh();
  }

  function renderForm(): void {
    const state = store.get();
    form.render({
      selected: state.selection.length,
      blocked: state.viewing === null ? null : 'ai.viewing',
      sending,
      message: said,
    });
  }

  function submit(body: NewRequest, clears: boolean): void {
    sending = true;
    said = '';
    renderForm();
    void postRequest(slug, body).then((sent) => {
      sending = false;
      said = text(sent ? 'ai.sent' : 'ai.sendFailed');
      if (sent && clears) form.clear();
      renderForm();
      if (sent) read();
    });
  }

  function send(words: string): void {
    const state = store.get();
    const body = sayRequest(words, state.selection, state.context);
    if (body) submit(body, true);
  }

  function improve(): void {
    const state = store.get();
    const body = improveRequest(state.selection, state.context);
    if (body) submit(body, false);
  }

  async function apply(key: string): Promise<void> {
    const drawn = cards.get(key);
    if (!drawn || applying !== null || store.get().busy) return;
    const { model, request, index } = drawn;
    if (model.built.kind !== 'ready' || model.outdated || model.blocked !== null) return;
    applying = key;
    syncButtons();
    // The history shows the same edits while it sends them; the build then replaces them.
    preview.handOver(key);
    const label = text('ai.variant.label', { label: model.label });
    const outcome = await history.apply({ ops: model.built.ops, label, flash: true });
    applying = null;
    if (outcome?.outcome === 'applied') {
      applied.set(request, index);
      foot.applied();
    }
    draw();
  }

  const handlers = {
    choose: (key: string): void => choose(key),
    drop: (id: string): void => {
      void dropRequest(slug, id).then((dropped) => {
        if (dropped) read();
        else toast(main, text('ai.drop.failed'));
      });
    },
    again: (body: NewRequest): void => {
      void postRequest(slug, body).then((sent) => {
        toast(main, text(sent ? 'ai.sent' : 'ai.sendFailed'));
        if (sent) read();
      });
    },
    point: (key: string | null): void => preview.point(key),
    focus: (key: string | null): void => preview.focus(key),
  };

  function setDragging(on: boolean): void {
    if (dragging === on) return;
    dragging = on;
    preview.refresh();
  }

  // A drag holds every preview back: a handle in a frame, the layers tree, a file.
  bridge.on((message) => {
    if (message.type === 'handle') setDragging(!message.done);
    else if (message.type === 'drop') setDragging(false);
  });
  document.addEventListener('dragstart', () => setDragging(true), true);
  for (const type of ['dragend', 'drop'] as const) {
    window.addEventListener(type, () => setDragging(false), true);
  }

  bridge.onLive((_frame, message) => {
    if (message.type === 'live-facts') preview.facts(message.request, message.facts);
  });

  onStudioEvent((event) => {
    if (event.event === 'reset' || requestsSlugOf(event) === slug) {
      read();
      return;
    }
    // A change of the draft's files may put a request out of date (its `stale`).
    if (sourceOf(event)?.slug === slug) read();
  });

  store.subscribe((state, previous) => {
    if (state.listening !== previous.listening) status.render(state.listening);
    const files = state.etags !== previous.etags || state.edit?.version !== previous.edit?.version;
    if (files) forget();
    // A new build in the cards has no preview in it.
    if (state.builds !== previous.builds) preview.lost();
    const redraw =
      files ||
      state.requests !== previous.requests ||
      state.selection !== previous.selection ||
      state.on !== previous.on ||
      state.viewing !== previous.viewing ||
      state.locked !== previous.locked ||
      state.tree !== previous.tree ||
      state.edit !== previous.edit;
    if (redraw) draw();
    else if (state.busy !== previous.busy) {
      syncButtons();
      preview.refresh();
    }
    if (state.selection !== previous.selection || state.viewing !== previous.viewing) {
      renderForm();
    }
  });

  status.render(store.get().listening);
  renderForm();
  draw();
  read();
}
