// The draft's requests to Claude on the page (spec 4d, goals 1 and 2; plan 17, task B), as plain
// data: the GET answer read with care (the page uses no shape it did not check), the `requests`
// event, the order the AI tab lists them in, the bodies the tab posts, and the variants the pill
// on the canvas offers (plan 19, task 4). No DOM.
//
// The client may not import values from `src/`, so the lists and limits are copies of those in
// `src/studio/api/requests/request-schemas.ts`; `test/client/studio/edit/ai/requests.test.ts`
// keeps them equal.

import type { PropValue, StyleContext, StyleValue } from '../../../../src/edit/index.ts';
import type {
  Listening,
  NewRequest,
  RequestAnswer,
  RequestKind,
  RequestStatus,
  Requests,
  RequestView,
  Variant,
  VariantChange,
} from '../../../../src/studio/api/requests/request-schemas.ts';
import type { StreamEvent } from '../../live/sse.ts';
import { PROPERTIES } from '../props/steps.ts';
import type { VariantRef } from './control.ts';

export const REQUEST_KIND_LIST: readonly RequestKind[] = ['say', 'improve', 'ask', 'note', 'why'];
export const REQUEST_STATUS_LIST: readonly RequestStatus[] = [
  'waiting',
  'taken',
  'answered',
  'failed',
  'dropped',
];
export const MAX_REQUEST_TEXT = 1_000;
export const MAX_REQUEST_ELEMENTS = 20;
export const MAX_VARIANTS = 3;
export const MAX_VARIANT_CHANGES = 40;
export const MAX_VARIANT_LABEL = 60;

const STATES = ['hover', 'focus-visible', 'active'] as const;
const LISTENING_STATES: readonly Listening['state'][] = ['listening', 'working', 'off'];
/** Copies of `TOKEN_VAR` and `UTILITY` in `src/edit/domain/ops.ts`. */
const TOKEN_VAR = /^--kit-[A-Za-z0-9_-]{1,80}$/;
const UTILITY = /^[A-Za-z0-9:_\-[\]/.#%(),]{1,120}$/;
const MAX_TEXT = 2_000;

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown, max = 100_000): value is string =>
  typeof value === 'string' && value.length <= max;
const isId = (value: unknown): value is string => isText(value, 200) && value.length > 0;
const isUtility = (value: unknown): value is string => isText(value) && UTILITY.test(value);

/** One item of `list` that `value` is, narrowed without a cast; `undefined` for anything else. */
const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined =>
  list.find((item) => item === value);

function readContext(value: unknown): StyleContext | undefined {
  if (!isObject(value)) return undefined;
  const raw = value.width;
  const width =
    raw === null ? null : typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 ? raw : -1;
  const state = value.state === null ? null : oneOf(STATES, value.state);
  if (width === -1 || state === undefined) return undefined;
  return { width, state };
}

function readStyleValue(value: unknown): StyleValue | undefined {
  if (!isObject(value)) return undefined;
  if (typeof value.token === 'string') {
    return TOKEN_VAR.test(value.token) ? { token: value.token } : undefined;
  }
  const { raw } = value;
  if (!isText(raw, 200) || raw.trim() === '') return undefined;
  return value.mark === false ? { raw, mark: false } : { raw };
}

function readPropValue(value: unknown): PropValue | undefined {
  if (!isObject(value)) return undefined;
  const held = value.value;
  if (value.kind === 'string' && isText(held, MAX_TEXT)) return { kind: 'string', value: held };
  if (value.kind === 'number' && typeof held === 'number' && Number.isFinite(held)) {
    return { kind: 'number', value: held };
  }
  if (value.kind === 'boolean' && typeof held === 'boolean') {
    return { kind: 'boolean', value: held };
  }
  return undefined;
}

function readChange(value: unknown): VariantChange | undefined {
  if (!isObject(value) || !isId(value.id)) return undefined;
  const { id } = value;
  switch (value.kind) {
    case 'style': {
      const property = oneOf(PROPERTIES, value.property);
      const style = readStyleValue(value.value);
      return property && style ? { kind: 'style', id, property, value: style } : undefined;
    }
    case 'prop': {
      const prop = readPropValue(value.value);
      return isText(value.name, 64) && prop
        ? { kind: 'prop', id, name: value.name, value: prop }
        : undefined;
    }
    case 'text':
      return isText(value.value, MAX_TEXT) ? { kind: 'text', id, value: value.value } : undefined;
    case 'utility': {
      const next = value.value === null || isUtility(value.value) ? value.value : undefined;
      const before = value.before === null || isUtility(value.before) ? value.before : undefined;
      return next === undefined || before === undefined
        ? undefined
        : { kind: 'utility', id, value: next, before };
    }
    default:
      return undefined;
  }
}

function readVariant(value: unknown): Variant | undefined {
  if (!isObject(value) || !isText(value.label, MAX_VARIANT_LABEL)) return undefined;
  const label = value.label.trim();
  const { changes } = value;
  if (label === '' || !Array.isArray(changes)) return undefined;
  if (changes.length === 0 || changes.length > MAX_VARIANT_CHANGES) return undefined;
  const read = changes.map(readChange);
  if (!read.every((one): one is VariantChange => one !== undefined)) return undefined;
  return { label, changes: read };
}

function readAnswer(value: unknown): RequestAnswer | null | undefined {
  if (value === null) return null;
  if (!isObject(value)) return undefined;
  if (value.kind === 'done') {
    return isText(value.message) ? { kind: 'done', message: value.message } : undefined;
  }
  if (value.kind === 'failed') {
    return isText(value.reason) ? { kind: 'failed', reason: value.reason } : undefined;
  }
  if (value.kind !== 'variants' || !Array.isArray(value.variants)) return undefined;
  const variants = value.variants.slice(0, MAX_VARIANTS).map(readVariant);
  if (variants.length === 0) return undefined;
  if (!variants.every((one): one is Variant => one !== undefined)) return undefined;
  return { kind: 'variants', variants };
}

/** One request of the GET answer; `undefined` for a malformed one, which the tab leaves out. */
export function readRequest(value: unknown): RequestView | undefined {
  if (!isObject(value)) return undefined;
  const { id, text, version, at, note, stale, elements } = value;
  const kind = oneOf(REQUEST_KIND_LIST, value.kind);
  const status = oneOf(REQUEST_STATUS_LIST, value.status);
  const context = readContext(value.context);
  const answer = readAnswer(value.answer);
  if (!isId(id) || !kind || !status || !context || answer === undefined) return undefined;
  if (!isText(text) || !isText(at, 64) || typeof stale !== 'boolean') return undefined;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return undefined;
  if (!(note === null || isId(note))) return undefined;
  if (!Array.isArray(elements) || !elements.every(isId)) return undefined;
  return {
    id,
    kind,
    elements: [...elements],
    context,
    text,
    version,
    at,
    status,
    note,
    stale,
    answer,
  };
}

function readListening(value: unknown): Listening | undefined {
  if (!isObject(value)) return undefined;
  const state = oneOf(LISTENING_STATES, value.state);
  const { since } = value;
  if (!state || !(since === null || isText(since, 64))) return undefined;
  return { state, since };
}

/** The GET answer as the tab uses it; `null` when it is not one. Bad requests are left out. */
export function readRequests(body: unknown): Requests | null {
  if (!isObject(body) || !Array.isArray(body.requests)) return null;
  const listening = readListening(body.listening);
  if (!listening) return null;
  const requests = body.requests.flatMap((one) => {
    const read = readRequest(one);
    return read ? [read] : [];
  });
  return { requests, listening };
}

/** The draft a `requests` event names (C5): its requests or the listening state changed. */
export function requestsSlugOf(event: StreamEvent): string | undefined {
  if (event.event !== 'requests') return undefined;
  let data: unknown;
  try {
    data = JSON.parse(event.data);
  } catch {
    return undefined;
  }
  return isObject(data) && typeof data.slug === 'string' ? data.slug : undefined;
}

/**
 * The requests the tab lists (spec 4d, goal 9): those about a selected element first, then the
 * rest, each group newest first as the server sends them. A dropped one is not listed.
 */
export function orderRequests(
  requests: readonly RequestView[],
  selection: readonly string[],
): { selected: RequestView[]; others: RequestView[] } {
  const chosen = new Set(selection);
  const listed = requests.filter((request) => request.status !== 'dropped');
  const touches = (request: RequestView): boolean => request.elements.some((id) => chosen.has(id));
  return {
    selected: listed.filter(touches),
    others: listed.filter((request) => !touches(request)),
  };
}

/** The elements a request names: the selection, without repeats, up to the limit. */
export const requestElements = (selection: readonly string[]): string[] =>
  [...new Set(selection)].slice(0, MAX_REQUEST_ELEMENTS);

const copyContext = (context: StyleContext): StyleContext => ({
  width: context.width,
  state: context.state,
});

/** "What should change?" with Send: a `say` request; `null` with no words or no selection. */
export function sayRequest(
  words: string,
  selection: readonly string[],
  context: StyleContext,
): NewRequest | null {
  const text = words.trim().slice(0, MAX_REQUEST_TEXT).trim();
  const elements = requestElements(selection);
  if (text === '' || elements.length === 0) return null;
  return { kind: 'say', elements, context: copyContext(context), text };
}

/** Improve: an `improve` request with no words; `null` with no selection. */
export function improveRequest(
  selection: readonly string[],
  context: StyleContext,
): NewRequest | null {
  const elements = requestElements(selection);
  if (elements.length === 0) return null;
  return { kind: 'improve', elements, context: copyContext(context), text: '' };
}

/**
 * "Ask again" of an out-of-date request: the same words, context and elements, those still in
 * the draft (`present`). A `say` unless it was an Improve. `null` when its elements are all gone
 * or it has no words to say again.
 */
export function againRequest(
  request: RequestView,
  present: (id: string) => boolean,
): NewRequest | null {
  const elements = requestElements(request.elements.filter(present));
  if (elements.length === 0) return null;
  const context = copyContext(request.context);
  if (request.kind === 'improve') return { kind: 'improve', elements, context, text: '' };
  const text = request.text.trim().slice(0, MAX_REQUEST_TEXT).trim();
  return text === '' ? null : { kind: 'say', elements, context, text };
}

/** The variants of a request's answer; none for any other answer. */
export const variantsOf = (request: RequestView): Variant[] =>
  request.answer?.kind === 'variants' ? request.answer.variants : [];

/** The key of a variant's card: its request and its place in the answer. */
export const variantKey = (request: string, index: number): string => `${request}#${index}`;

/** What the tab knows of a variant's card now: whether it can be tried, and why not. */
export type CardNow = { ready: boolean; reason: string | null };

/**
 * A variant as the pill names it. `reason`: the card's words for why it cannot be applied now,
 * beside the control's `VariantRef` (plan 19, task 4); `null` while it can.
 */
export type PillVariant = VariantRef & { reason: string | null };

/**
 * The variants the pill on the canvas offers for `selection[0]` (plan 19, task 4): those of the
 * newest answered request with variants that names it and has none applied from this page. None
 * with nothing selected, and none when that request is out of date: a newer answer of Claude's
 * supersedes the older ones, and an out-of-date one cannot be applied. A dropped, waiting or
 * failed request has no variants; one applied here is finished (`applied`). `card`: the drawn
 * card of a key, `undefined` while it is not drawn (then it is not ready).
 */
export function variantRefs(
  requests: readonly RequestView[],
  selection: readonly string[],
  applied: ReadonlyMap<string, number>,
  card: (key: string) => CardNow | undefined,
): PillVariant[] {
  const id = selection[0];
  if (id === undefined) return [];
  const newest = requests.find(
    (request) =>
      request.status === 'answered' &&
      request.answer?.kind === 'variants' &&
      request.elements.includes(id) &&
      !applied.has(request.id),
  );
  if (newest === undefined || newest.stale) return [];
  return variantsOf(newest).map((variant, index) => {
    const key = variantKey(newest.id, index);
    const now = card(key);
    return {
      key,
      request: newest.id,
      index,
      label: variant.label,
      ready: now?.ready === true,
      reason: now === undefined ? null : now.reason,
    };
  });
}
