// The Kit lens route (redesign spec goal 9, plan 19 task 2): what the canvas shows over the
// latest version in the Kit lens. As in `structure-routes.ts`, the handler calls the edit module.

import { type EditCompiler, readKitLens } from '../../../edit/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import { type ApiRoute, apiRoute } from '../../http/router.ts';
import { SlugParams } from '../schemas.ts';
import type { EditRouteDeps } from './edit-routes.ts';
import { KitLensSchema } from './kit-lens-schemas.ts';

export function kitLensRoutes(deps: EditRouteDeps): ApiRoute[] {
  const compiler = (): EditCompiler => {
    if (deps.edit) return deps.edit.compiler;
    throw new KitvasError('INTERNAL', { detail: deps.t('studio.edit.noEditor') });
  };

  return [
    apiRoute({
      id: 'getKitLens',
      summary:
        'What the Kit lens shows on the latest version: spacing tokens, off-kit values, "could be" suggestions.',
      method: 'GET',
      path: '/api/v1/drafts/{slug}/kit-lens',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: KitLensSchema },
      handle: async ({ params }) => {
        const lens = await readKitLens(
          { drafts: deps.drafts, kits: deps.kits, compiler: compiler() },
          params.slug,
        );
        return { status: 200, body: lens };
      },
    }),
  ];
}
