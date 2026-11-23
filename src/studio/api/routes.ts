// The API's route table. Handlers check input, call a use case and answer; rules live in the modules.

import {
  addVersion,
  DraftSchema,
  type DraftStore,
  listDrafts,
  loadDraft,
  versionInfo,
} from '../../drafts/index.ts';
import type { KitStore } from '../../kit/index.ts';
import { KitvasError, type Translate } from '../../shared/index.ts';
import type { EventHub } from '../events/event-hub.ts';
import { etagOf, requireIfMatch } from '../http/etag.ts';
import { type ApiRoute, apiRoute } from '../http/router.ts';
import type { Inbox } from '../inbox/inbox.ts';
import type { Jobs } from '../jobs/jobs.ts';
import type { OpenLinks } from '../security/open-links.ts';
import { type EditDeps, editRoutes } from './edit-routes.ts';
import { eventRoutes } from './event-routes.ts';
import { inboxRoutes } from './inbox-routes.ts';
import { jobRoutes } from './job-routes.ts';
import { linkRoutes } from './link-routes.ts';
import { openApi } from './openapi.ts';
import {
  DraftListSchema,
  EmptyBody,
  NoParams,
  OpenApiSchema,
  SlugParams,
  StatusSchema,
  StoppingSchema,
  VersionCreatedSchema,
  VersionParams,
  VersionSchema,
} from './schemas.ts';

export type ApiDeps = {
  drafts: DraftStore;
  /** The kits: a catalog job needs one that exists. */
  kits: KitStore;
  /** The plugin's version; the CLI restarts a studio that runs an older one. */
  version: string;
  startedAt: string;
  /** The studio's own port: links are built on it, and the page cookie's name carries it. */
  port: number;
  framePort: number;
  now(): Date;
  jobs: Jobs;
  events: EventHub;
  inbox: Inbox;
  t: Translate;
  links: OpenLinks;
  /** Stops the studio; the shutdown route calls it once its answer is sent. */
  shutdown?: () => void;
  /** The editor's compiler and write hooks; without them inspect and edits answer 500. */
  edit?: EditDeps;
};

const draftPath = (slug: string): string => `/api/v1/drafts/${slug}`;

/** The stored text of draft.json; its hash is the draft's ETag. */
function draftText(drafts: DraftStore, slug: string): string {
  const text = drafts.readText(slug, 'draft.json');
  if (text === undefined) throw new KitvasError('DRAFT_NOT_FOUND', { slug });
  return text;
}

export function apiRoutes(deps: ApiDeps): ApiRoute[] {
  const routes: ApiRoute[] = [
    apiRoute({
      id: 'getStatus',
      summary: 'The running studio: plugin version, start time and the prototype port.',
      method: 'GET',
      path: '/api/v1/status',
      policy: 'read',
      params: NoParams,
      request: null,
      response: { status: 200, schema: StatusSchema },
      handle: () => ({
        status: 200,
        body: {
          name: 'kitvas',
          version: deps.version,
          startedAt: deps.startedAt,
          framePort: deps.framePort,
        },
      }),
    }),
    apiRoute({
      id: 'listDrafts',
      summary: 'Drafts of the project, with their latest version.',
      method: 'GET',
      path: '/api/v1/drafts',
      policy: 'read',
      params: NoParams,
      request: null,
      response: { status: 200, schema: DraftListSchema },
      handle: () => ({ status: 200, body: { items: listDrafts(deps.drafts), nextCursor: null } }),
    }),
    apiRoute({
      id: 'getDraft',
      summary: 'One draft. Its ETag goes into If-Match of a change.',
      method: 'GET',
      path: '/api/v1/drafts/{slug}',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: DraftSchema },
      handle: ({ params }) => ({
        status: 200,
        body: loadDraft(deps.drafts, params.slug),
        headers: { etag: etagOf(draftText(deps.drafts, params.slug)) },
      }),
    }),
    apiRoute({
      id: 'createVersion',
      summary: 'Starts the next version from the latest one. Needs If-Match with the draft ETag.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/versions',
      policy: 'write',
      params: SlugParams,
      request: EmptyBody,
      response: { status: 201, schema: VersionCreatedSchema },
      handle: ({ params, headers }) => {
        const path = draftPath(params.slug);
        requireIfMatch(headers['if-match'], etagOf(draftText(deps.drafts, params.slug)), path);
        const created = addVersion(deps.drafts, params.slug, deps.now());
        return {
          status: 201,
          body: created,
          headers: { location: `${path}/versions/${created.version}` },
        };
      },
    }),
    apiRoute({
      id: 'getVersion',
      summary: 'One version of a draft: its date, whether it is built, its states.',
      method: 'GET',
      path: '/api/v1/drafts/{slug}/versions/{number}',
      policy: 'read',
      params: VersionParams,
      request: null,
      response: { status: 200, schema: VersionSchema },
      handle: ({ params }) => ({
        status: 200,
        body: versionInfo(deps.drafts, params.slug, Number(params.number)),
      }),
    }),
    apiRoute({
      id: 'shutdown',
      summary: 'Stops the studio after this answer. The CLI calls it.',
      method: 'POST',
      path: '/api/v1/shutdown',
      policy: 'write',
      params: NoParams,
      request: EmptyBody,
      response: { status: 202, schema: StoppingSchema },
      handle: () => {
        setImmediate(() => deps.shutdown?.());
        return { status: 202, body: { stopping: true } };
      },
    }),
    ...jobRoutes(deps),
    ...eventRoutes(deps),
    ...inboxRoutes(deps),
    ...linkRoutes(deps),
    ...editRoutes(deps),
  ];
  routes.push(
    apiRoute({
      id: 'getOpenApi',
      summary: 'This API as OpenAPI 3.1, generated from the route table.',
      method: 'GET',
      path: '/api/v1/openapi.json',
      policy: 'read',
      params: NoParams,
      request: null,
      response: { status: 200, schema: OpenApiSchema },
      handle: () => ({ status: 200, body: openApi(routes, deps.version, deps.port) }),
    }),
  );
  return routes;
}
