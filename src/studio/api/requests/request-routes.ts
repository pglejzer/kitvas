// The request routes (spec 4d, goals 1 and 2; plan 17, task A): the editor keeps, lists and drops
// a draft's requests to Claude; Claude reads one (`kitvas request show`) and answers it
// (`answer`, `done`, `fail`). The rules are in `src/studio/requests/`; a handler checks the input
// and calls them. Every change tells the draft's pages with a `requests` event.

import { SLUG } from '../../../drafts/index.ts';
import { z } from '../../../shared/index.ts';
import { RequestError } from '../../http/problem.ts';
import { type ApiRoute, apiRoute } from '../../http/router.ts';
import { newRequestProblems, refuseProblems } from '../../requests/request-checks.ts';
import { requestsOf } from '../../requests/requests.ts';
import type { ApiDeps } from '../routes.ts';
import { EmptyBody, SlugParams } from '../schemas.ts';
import {
  DoneSchema,
  FailSchema,
  MAX_ANSWER_BYTES,
  NewRequestSchema,
  RequestContextSchema,
  RequestsSchema,
  RequestViewSchema,
  VariantsAnswerSchema,
} from './request-schemas.ts';

const DraftRequestParams = z.strictObject({ slug: z.string().regex(SLUG), id: z.uuid() });
const RequestParams = z.strictObject({ id: z.uuid() });

export function requestRoutes(deps: ApiDeps): ApiRoute[] {
  // Made with the route table, so the session's first state is the one the studio started with.
  const requests = requestsOf(deps);
  return [
    apiRoute({
      id: 'listRequests',
      summary: "A draft's requests to Claude, newest first, and whether a Claude session listens.",
      method: 'GET',
      path: '/api/v1/drafts/{slug}/requests',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: RequestsSchema },
      handle: async ({ params }) => ({ status: 200, body: await requests.list(params.slug) }),
    }),
    apiRoute({
      id: 'addRequest',
      summary: 'Asks Claude about the selected elements. It waits until `kitvas inbox` takes it.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/requests',
      policy: 'write',
      params: SlugParams,
      request: NewRequestSchema,
      response: { status: 201, schema: RequestViewSchema },
      handle: async ({ params, body }) => {
        refuseProblems(newRequestProblems(body, deps.t));
        const made = await requests.create(params.slug, body);
        return {
          status: 201,
          body: made,
          headers: { location: `/api/v1/requests/${made.id}` },
        };
      },
    }),
    apiRoute({
      id: 'dropRequest',
      summary: 'Takes a request back; an answer that comes later is refused.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/requests/{id}/drop',
      policy: 'write',
      params: DraftRequestParams,
      request: EmptyBody,
      response: { status: 200, schema: RequestViewSchema },
      handle: async ({ params }) => ({
        status: 200,
        body: await requests.drop(params.slug, params.id),
      }),
    }),
    apiRoute({
      id: 'showRequest',
      summary: 'One request with its elements as the editor reads them now and the locked ids.',
      method: 'GET',
      path: '/api/v1/requests/{id}',
      policy: 'read',
      params: RequestParams,
      request: null,
      response: { status: 200, schema: RequestContextSchema },
      handle: async ({ params }) => ({ status: 200, body: await requests.show(params.id) }),
    }),
    apiRoute({
      id: 'answerRequest',
      summary: 'Answers a taken request with one to three variants of panel edits.',
      method: 'POST',
      path: '/api/v1/requests/{id}/answer',
      policy: 'write',
      params: RequestParams,
      request: VariantsAnswerSchema,
      response: { status: 200, schema: RequestViewSchema },
      handle: async ({ params, body }) => {
        // The body limit counts the bytes sent; this counts the answer as it is kept.
        if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_ANSWER_BYTES) {
          throw new RequestError('BODY_TOO_LARGE', { limit: MAX_ANSWER_BYTES });
        }
        const answer = { kind: 'variants' as const, variants: body.variants };
        return { status: 200, body: await requests.settle(params.id, answer) };
      },
    }),
    apiRoute({
      id: 'closeRequest',
      summary: 'Closes a taken request that needed no variants: Claude changed the code itself.',
      method: 'POST',
      path: '/api/v1/requests/{id}/done',
      policy: 'write',
      params: RequestParams,
      request: DoneSchema,
      response: { status: 200, schema: RequestViewSchema },
      handle: async ({ params, body }) => ({
        status: 200,
        body: await requests.settle(params.id, { kind: 'done', message: body.message }),
      }),
    }),
    apiRoute({
      id: 'failRequest',
      summary: 'Says why Claude could not do a taken request.',
      method: 'POST',
      path: '/api/v1/requests/{id}/fail',
      policy: 'write',
      params: RequestParams,
      request: FailSchema,
      response: { status: 200, schema: RequestViewSchema },
      handle: async ({ params, body }) => ({
        status: 200,
        body: await requests.settle(params.id, { kind: 'failed', reason: body.reason }),
      }),
    }),
  ];
}
