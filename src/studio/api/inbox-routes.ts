// The inbox: studio pages leave notes for Claude; `kitvas inbox` waits for them and takes them.
// Since stage 4d the take is also how a Claude session listens for the editor's requests: it
// hands over every waiting request of every draft too, marking them taken, and a request that
// comes while it waits ends the wait at once.

import { jsonReply, send } from '../http/reply.ts';
import { type ApiRoute, apiRoute } from '../http/router.ts';
import { InboxItemSchema, NewNoteSchema } from '../inbox/inbox.ts';
import { type InboxRequest, InboxTakeSchema } from '../requests/inbox-take.ts';
import { type RequestHost, requestsOf } from '../requests/requests.ts';
import { NoParams, TakeNotesSchema } from './schemas.ts';

export function inboxRoutes(deps: RequestHost): ApiRoute[] {
  const requests = requestsOf(deps);
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
      summary: 'Takes waiting notes and requests; `timeout` (seconds, at most 600) waits for one.',
      method: 'POST',
      path: '/api/v1/inbox/take',
      policy: 'write',
      params: NoParams,
      request: TakeNotesSchema,
      response: { status: 200, schema: InboxTakeSchema },
      handle: ({ body }) => {
        const seconds = body.timeout ?? 0;
        return {
          status: 200,
          body: null,
          // Held by hand: a caller that leaves gives its place up, so no note goes to nobody.
          open: (res, headers) => {
            // A request whose session is gone waits again first, so this take gets it.
            requests.sweep();
            const waiting = deps.inbox.wait(requests.hasWaiting() ? 0 : seconds * 1_000);
            let left = false;
            res.once('close', () => {
              left = true;
              waiting.cancel();
            });
            requests.began();
            waiting.items.then((items) => {
              // Requests go only to a take that ended for its caller: never to one that was
              // replaced or left, so none is marked taken for nobody.
              let handed: InboxRequest[] = [];
              try {
                handed = requests.ended(waiting.given() && !left);
              } catch {
                // They stay waiting for the next take.
              }
              send(res, jsonReply(200, { items, requests: handed }), headers);
            });
          },
        };
      },
    }),
  ];
}
