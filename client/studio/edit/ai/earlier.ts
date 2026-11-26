// "Earlier" in the Claude tab (plan 18f, task 3; spec 4.9): one compact row per finished request,
// the request's words, its elements muted, and its end at the right: "In Version N", "Applied",
// "Answered" (or "Not done"). A request still open, or answered with variants nobody applied, stays
// a card above, where its variants and "Ask again" are. The decisions are pure; `renderEarlier`
// draws the rows with `textContent` only.

import type { RequestView } from '../../../../src/studio/api/requests/request-schemas.ts';
import { el } from '../props/controls/controls.ts';
import { text } from '../texts.ts';
import type { RequestModel } from './tab.ts';

/** How a finished request ended. */
export type End =
  | { kind: 'inVersion'; version: number }
  | { kind: 'applied' }
  | { kind: 'answered' }
  | { kind: 'failed' };

/**
 * Whether a request is finished: Claude took it and answered or failed, and no variant of it is
 * left to apply (one applied here counts as done).
 */
export function isEarlier(request: RequestView, applied: boolean): boolean {
  if (request.status === 'waiting' || request.status === 'taken') return false;
  return !(request.answer?.kind === 'variants' && !applied);
}

/**
 * How a finished request ended: not done when it failed; Applied when a variant of it was applied
 * from this page; "In Version N" when Claude changed the draft itself and the draft has moved to
 * a version after the one the request was made on (its change is in the next one); else Answered.
 */
export function endOf(request: RequestView, applied: boolean, latest: number | null): End {
  if (request.status === 'failed' || request.answer?.kind === 'failed') return { kind: 'failed' };
  if (applied) return { kind: 'applied' };
  if (request.answer?.kind === 'done' && latest !== null && latest > request.version) {
    return { kind: 'inVersion', version: request.version + 1 };
  }
  return { kind: 'answered' };
}

/** The text key of an end, under `studio.edit.`, with its params. */
export function endWords(end: End): { key: string; params: Record<string, number> } {
  if (end.kind === 'inVersion')
    return { key: 'ai.end.inVersion', params: { version: end.version } };
  if (end.kind === 'failed') return { key: 'ai.state.failed', params: {} };
  return { key: `ai.end.${end.kind}`, params: {} };
}

function pastRow(model: RequestModel, latest: number | null): HTMLElement {
  const { request } = model;
  const row = el('li', 'k-card claude-past');
  row.dataset.status = request.status;
  const words = request.text.trim();
  const body = el('span', 'claude-past-text');
  body.append(
    el('span', 'claude-past-words', words === '' ? text(`ai.kind.${request.kind}`) : words),
  );
  if (model.names !== '') body.append(el('small', 'k-meta claude-past-on', model.names));
  const said = request.answer;
  if (said?.kind === 'done' && said.message.trim() !== '') row.title = said.message.trim();
  if (said?.kind === 'failed') row.title = text('ai.failed', { reason: said.reason });
  const end = endWords(endOf(request, model.applied, latest));
  row.append(body, el('span', 'claude-past-end', text(end.key, end.params)));
  return row;
}

/** The "Earlier" heading and its rows; none when nothing is finished. */
export function renderEarlier(
  models: readonly RequestModel[],
  latest: number | null,
): HTMLElement[] {
  if (models.length === 0) return [];
  const list = el('ol', 'claude-earlier');
  for (const model of models) list.append(pastRow(model, latest));
  return [el('h4', 'claude-earlier-title', text('ai.earlier')), list];
}
