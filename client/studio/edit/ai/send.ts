// Sending a request to Claude (redesign spec, goal 10; plan 19, task 4): what the Claude tab's form
// did, now behind the tab's control, so the ask bar under the canvas is the one place to type. A
// `say` request with the person's words or an `improve` one, about the selection, with the edit
// context; never while an older version is shown. Each says whether it was sent; once one is,
// the tab reads the requests again. The words are data: `sayRequest` cuts them, nothing else
// reads them.

import type { NewRequest } from '../../../../src/studio/api/requests/request-schemas.ts';
import type { EditorState } from '../store.ts';
import { improveRequest, sayRequest } from './requests.ts';

export type SenderDeps = {
  /** What a request is about: the selection, the edit context, the version shown. */
  state(): Pick<EditorState, 'selection' | 'context' | 'viewing'>;
  /** `postRequest` of `api.ts` for the draft: whether the studio took the request. */
  post(body: NewRequest): Promise<boolean>;
  /** A request went out: the tab reads the requests again. */
  sent(): void;
};

export type Sender = {
  /** A `say` request with `words`; false when nothing was sent (no words, no selection, refused). */
  send(words: string): Promise<boolean>;
  /** An `improve` request; false when nothing was sent. */
  improve(): Promise<boolean>;
  /** A body made elsewhere ("Ask again"); false when it was not sent. */
  post(body: NewRequest): Promise<boolean>;
};

export function createSender(deps: SenderDeps): Sender {
  async function post(body: NewRequest | null): Promise<boolean> {
    if (body === null) return false;
    const sent = await deps.post(body);
    if (sent) deps.sent();
    return sent;
  }

  /** Nothing is asked about an older version: Claude answers on the latest one. */
  const now = (): Pick<EditorState, 'selection' | 'context'> | null => {
    const state = deps.state();
    return state.viewing === null ? state : null;
  };

  return {
    send(words) {
      const state = now();
      return post(state && sayRequest(words, state.selection, state.context));
    },
    improve() {
      const state = now();
      return post(state && improveRequest(state.selection, state.context));
    },
    post: (body) => post(body),
  };
}
