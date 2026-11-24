// The waiver routes (spec 4c, goal 6; plan 16, task E): the draft's accepted findings, accepting
// one with a reason, and taking it back. The rules are in the drafts module (`app/waivers.ts`);
// a handler checks the input and calls them. Writes use the `write` policy.

import {
  acceptWaiver,
  type DraftStore,
  latestVersion,
  loadDraft,
  waiversFor,
  withdrawWaiver,
} from '../../../drafts/index.ts';
import { type ApiRoute, apiRoute } from '../../http/router.ts';
import { SlugParams } from '../schemas.ts';
import { WaiverRequestSchema, WaiversSchema, WaiverWithdrawSchema } from './waiver-schemas.ts';

export type WaiverRouteDeps = { drafts: DraftStore; now(): Date };

export function waiverRoutes(deps: WaiverRouteDeps): ApiRoute[] {
  return [
    apiRoute({
      id: 'getWaivers',
      summary: 'The accepted findings of a draft, as the latest version names their elements.',
      method: 'GET',
      path: '/api/v1/drafts/{slug}/waivers',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: WaiversSchema },
      handle: ({ params }) => {
        // A draft that is not there is a 404 here.
        const version = latestVersion(loadDraft(deps.drafts, params.slug));
        return {
          status: 200,
          body: { waivers: waiversFor(deps.drafts, params.slug, version) },
        };
      },
    }),
    apiRoute({
      id: 'acceptWaiver',
      summary: 'Accepts a finding on purpose, with a reason of up to 300 characters.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/waivers',
      policy: 'write',
      params: SlugParams,
      request: WaiverRequestSchema,
      response: { status: 200, schema: WaiversSchema },
      handle: ({ params, body }) => ({
        status: 200,
        body: { waivers: acceptWaiver(deps.drafts, params.slug, body, deps.now()) },
      }),
    }),
    apiRoute({
      id: 'withdrawWaiver',
      summary: 'Takes an accepted finding back: the rule on this element counts again.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/waivers/withdraw',
      policy: 'write',
      params: SlugParams,
      request: WaiverWithdrawSchema,
      response: { status: 200, schema: WaiversSchema },
      handle: ({ params, body }) => ({
        status: 200,
        body: { waivers: withdrawWaiver(deps.drafts, params.slug, body) },
      }),
    }),
  ];
}
