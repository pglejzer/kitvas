// Deleting a draft, with a way back (ADR 0064): the delete moves the draft to the trash, restore
// brings the newest copy back, and removing one for good is its own route. The rules are in the
// drafts module (`app/trash.ts`); a handler stops the draft's own work, calls them and tells the
// open pages through the `drafts` event.

import {
  type DeletedDraft,
  deleteDraft,
  listDeleted,
  purgeDeleted,
  restoreDraft,
} from '../../../drafts/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import { type ApiRoute, apiRoute } from '../../http/router.ts';
import type { ApiDeps } from '../routes.ts';
import { EmptyBody, NoParams, SlugParams } from '../schemas.ts';
import {
  type DeletedItem,
  DraftDeletedSchema,
  DraftPurgedSchema,
  DraftRestoredSchema,
  type DraftsEvent,
  TrashListSchema,
} from './trash-schemas.ts';

/** What the API says of a deleted draft: never the folder's name in the trash. */
const itemOf = ({ slug, title, deletedAt }: DeletedDraft): DeletedItem => ({
  slug,
  title,
  deletedAt,
});

export function trashRoutes(deps: ApiDeps): ApiRoute[] {
  const tell = (event: DraftsEvent): void => deps.events.publish('drafts', event);

  return [
    apiRoute({
      id: 'deleteDraft',
      summary:
        'Moves a draft to the trash. Its running build and check stop first. Restore brings it back.',
      method: 'DELETE',
      path: '/api/v1/drafts/{slug}',
      policy: 'write',
      params: SlugParams,
      request: EmptyBody,
      response: { status: 200, schema: DraftDeletedSchema },
      handle: async ({ params }) => {
        // No program of kitvas may hold the folder when it moves. A draft that cannot be read can
        // be deleted too, so this checks that it is there, not that it reads.
        if (!deps.drafts.exists(params.slug, 'draft.json')) {
          throw new KitvasError('DRAFT_NOT_FOUND', { slug: params.slug });
        }
        await deps.jobs.stopFor(params.slug);
        await deps.live?.settle(params.slug);
        const deleted = deleteDraft(deps.drafts, params.slug, deps.now());
        tell({ slug: params.slug, change: 'deleted' });
        return { status: 200, body: { deleted: itemOf(deleted) } };
      },
    }),
    apiRoute({
      id: 'listTrash',
      summary: 'The deleted drafts, newest first.',
      method: 'GET',
      path: '/api/v1/trash',
      policy: 'read',
      params: NoParams,
      request: null,
      response: { status: 200, schema: TrashListSchema },
      handle: () => ({ status: 200, body: { items: listDeleted(deps.drafts).map(itemOf) } }),
    }),
    apiRoute({
      id: 'restoreDraft',
      summary:
        'Brings back the newest deleted copy of a draft. 409 when a draft of that name exists now.',
      method: 'POST',
      path: '/api/v1/trash/{slug}/restore',
      policy: 'write',
      params: SlugParams,
      request: EmptyBody,
      response: { status: 200, schema: DraftRestoredSchema },
      handle: ({ params }) => {
        const restored = restoreDraft(deps.drafts, params.slug);
        tell({ slug: params.slug, change: 'restored' });
        return { status: 200, body: { restored: itemOf(restored) } };
      },
    }),
    apiRoute({
      id: 'purgeDraft',
      summary: 'Removes every deleted copy of a draft for good. A live draft is never touched.',
      method: 'DELETE',
      path: '/api/v1/trash/{slug}',
      policy: 'write',
      params: SlugParams,
      request: EmptyBody,
      response: { status: 200, schema: DraftPurgedSchema },
      handle: ({ params }) => {
        const purged = purgeDeleted(deps.drafts, params.slug);
        tell({ slug: params.slug, change: 'purged' });
        return { status: 200, body: { purged: purged.map(itemOf) } };
      },
    }),
  ];
}
