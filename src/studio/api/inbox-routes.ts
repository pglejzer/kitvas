// The inbox: studio pages leave notes for Claude; `kitvas inbox` waits for them and takes them.

import { jsonReply, send } from '../http/reply.ts';
import { type ApiRoute, apiRoute } from '../http/router.ts';
import { type Inbox, InboxItemSchema, NewNoteSchema } from '../inbox/inbox.ts';
import { InboxListSchema, NoParams, TakeNotesSchema } from './schemas.ts';

export function inboxRoutes(deps: { inbox: Inbox }): ApiRoute[] {
  return [
    apiRoute({
      id: 'addNote',
      summary: 'Leaves a note for Claude. It waits in the inbox until `kitvas inbox` takes it.',
      method: 'POST',
      path: '/api/v1/inbox',
      policy: 'write',
      params: NoParams,
      request: NewNoteSchema,
      response: { status: 202, schema: InboxItemSchema },
      handle: ({ body }) => ({ status: 202, body: deps.inbox.add(body) }),
    }),
    // Taking removes the notes, so it is a write: POST with the studio's Origin, never a GET.
    apiRoute({
      id: 'takeNotes',
      summary:
        'Takes every waiting note. With `timeout` (seconds, at most 600) it first waits for the next one.',
      method: 'POST',
      path: '/api/v1/inbox/take',
      policy: 'write',
      params: NoParams,
      request: TakeNotesSchema,
      response: { status: 200, schema: InboxListSchema },
      handle: ({ body }) => {
        const seconds = body.timeout ?? 0;
        return {
          status: 200,
          body: null,
          // Held by hand: a caller that leaves gives its place up, so no note goes to nobody.
          open: (res, headers) => {
            const waiting = deps.inbox.wait(seconds * 1_000);
            res.once('close', waiting.cancel);
            waiting.items.then((items) => send(res, jsonReply(200, { items }), headers));
          },
        };
      },
    }),
  ];
}
