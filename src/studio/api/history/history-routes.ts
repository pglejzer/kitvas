// The timeline's routes (spec 4d, goal 5; plan 17, task D): where one element was in each version
// of a draft, and what bringing it back from an older one would do. Both only read; the person
// accepts a restore by sending its `ops` to POST `…/edits`, as any other edit.

import {
  type EditCompiler,
  elementHistory,
  fileOfId,
  restorePreview,
} from '../../../edit/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import { issueEntries, RequestError } from '../../http/problem.ts';
import { type ApiRoute, apiRoute } from '../../http/router.ts';
import { InspectQuerySchema, SOURCE_PATH } from '../edit/edit-schemas.ts';
import type { ApiDeps } from '../routes.ts';
import { SlugParams } from '../schemas.ts';
import {
  ElementHistorySchema,
  RestorePreviewSchema,
  RestoreRequestSchema,
} from './history-schemas.ts';

/** An id names a source file of the version; one whose path would leave `src/tsx/` is refused. */
const namesSourceFile = (id: string): boolean => SOURCE_PATH.test(fileOfId(id));

export function historyRoutes(deps: ApiDeps): ApiRoute[] {
  /** Old versions are read through the editor's compiler when they have no build. */
  const compiler = (): EditCompiler => {
    if (deps.edit) return deps.edit.compiler;
    throw new KitvasError('INTERNAL', { detail: deps.t('studio.edit.noEditor') });
  };
  const badId = (errors?: ReturnType<typeof issueEntries>): RequestError =>
    new RequestError(
      'REQUEST_INVALID',
      { detail: deps.t('studio.edit.badId') },
      errors === undefined ? {} : { errors },
    );

  return [
    apiRoute({
      id: 'getElementHistory',
      summary: 'One element of the latest version in every version of the draft. Query: `id`.',
      method: 'GET',
      path: '/api/v1/drafts/{slug}/history',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: ElementHistorySchema },
      handle: async ({ params, query }) => {
        // The same `?id=` as inspect, checked the same way.
        const parsed = InspectQuerySchema.safeParse({ id: query.get('id') });
        if (!parsed.success) throw badId(issueEntries(parsed.error.issues));
        if (!namesSourceFile(parsed.data.id)) throw badId();
        const history = await elementHistory(
          { drafts: deps.drafts, compiler: compiler() },
          params.slug,
          parsed.data.id,
        );
        return { status: 200, body: history };
      },
    }),
    apiRoute({
      id: 'previewRestore',
      summary: 'What bringing an element back from an older version would do. Writes nothing.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/restore',
      policy: 'write',
      params: SlugParams,
      request: RestoreRequestSchema,
      response: { status: 200, schema: RestorePreviewSchema },
      handle: async ({ params, body }) => {
        if (!namesSourceFile(body.id)) throw badId();
        const preview = await restorePreview(
          { drafts: deps.drafts, kits: deps.kits, compiler: compiler() },
          params.slug,
          body,
        );
        return { status: 200, body: preview };
      },
    }),
  ];
}
