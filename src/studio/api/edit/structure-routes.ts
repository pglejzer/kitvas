// The editor's structure routes (plan 14, task B6): every element of the latest version with
// what a move may do to it, what the insert palette offers, and one element's whole source for
// copy and cut. As in `edit-routes.ts`, a handler checks the input and calls the edit module.

import { loadDraft } from '../../../drafts/index.ts';
import {
  type EditCompiler,
  fileOfId,
  readPalette,
  readStructure,
  readSubtree,
} from '../../../edit/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import { etagOf } from '../../http/etag.ts';
import { issueEntries, RequestError } from '../../http/problem.ts';
import { type ApiRoute, apiRoute } from '../../http/router.ts';
import { type PalettePreviews, palettePreviews } from '../../previews/answer.ts';
import { SlugParams } from '../schemas.ts';
import type { EditRouteDeps } from './edit-routes.ts';
import { InspectQuerySchema, SOURCE_PATH } from './edit-schemas.ts';
import { PaletteSchema, StructureSchema, SubtreeSchema } from './structure-schemas.ts';

/** An id names a source file of the version; one whose path would leave `src/tsx/` is refused. */
const namesSourceFile = (id: string): boolean => SOURCE_PATH.test(fileOfId(id));

export type StructureRouteDeps = EditRouteDeps & {
  /** The kit previews of the Insert pane (ADR 0075); without them the palette says `none`. */
  previews?: PalettePreviews | undefined;
};

export function structureRoutes(deps: StructureRouteDeps): ApiRoute[] {
  /** The structure and a subtree read the TSX through the editor's compiler. */
  const compiler = (): EditCompiler => {
    if (deps.edit) return deps.edit.compiler;
    throw new KitvasError('INTERNAL', { detail: deps.t('studio.edit.noEditor') });
  };

  return [
    apiRoute({
      id: 'getStructure',
      summary: 'Every element of the latest version: where it is, whether it can move, and why.',
      method: 'GET',
      path: '/api/v1/drafts/{slug}/structure',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: StructureSchema },
      handle: async ({ params }) => {
        const structure = await readStructure(
          { drafts: deps.drafts, kits: deps.kits, compiler: compiler(), etag: etagOf },
          params.slug,
        );
        return { status: 200, body: structure };
      },
    }),
    apiRoute({
      id: 'getPalette',
      summary:
        'What the palette inserts: kit components and their previews, icons, same-kit sections.',
      method: 'GET',
      path: '/api/v1/drafts/{slug}/palette',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: PaletteSchema },
      handle: ({ params, host }) => {
        const palette = readPalette({ drafts: deps.drafts, kits: deps.kits }, params.slug);
        // Answered from disk at once; previews that are missing or stale start one job per kit.
        const kitId = loadDraft(deps.drafts, params.slug).kit.id;
        const previews = palettePreviews(deps.previews, kitId, host);
        return { status: 200, body: { ...palette, previews } };
      },
    }),
    apiRoute({
      id: 'getSubtree',
      summary: "One element's whole source, for copy and cut. Query: `id`.",
      method: 'GET',
      path: '/api/v1/drafts/{slug}/subtree',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: SubtreeSchema },
      handle: async ({ params, query }) => {
        // The same `?id=` as inspect, checked the same way.
        const parsed = InspectQuerySchema.safeParse({ id: query.get('id') });
        if (!parsed.success || !namesSourceFile(parsed.data.id)) {
          throw new RequestError(
            'REQUEST_INVALID',
            { detail: deps.t('studio.edit.badId') },
            parsed.success ? {} : { errors: issueEntries(parsed.error.issues) },
          );
        }
        const subtree = await readSubtree(
          { drafts: deps.drafts, compiler: compiler() },
          params.slug,
          parsed.data.id,
        );
        return { status: 200, body: subtree };
      },
    }),
  ];
}
