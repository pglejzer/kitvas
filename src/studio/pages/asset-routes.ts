// `/assets/draft.js`, `gallery.js` and `kit.js`: the studio's browser scripts, bundled on first use.

import { z } from '../../shared/index.ts';
import { type PageRoute, pageRoute } from '../http/router.ts';

export const SCRIPT_NAMES = ['draft', 'gallery', 'kit'] as const;
export type ScriptName = (typeof SCRIPT_NAMES)[number];

export type StudioAssets = {
  /** The bundled script of a studio page. */
  script(name: ScriptName): Promise<string>;
};

export const SCRIPT_TYPE = 'text/javascript; charset=utf-8';

const AssetParams = z.strictObject({ name: z.string().regex(/^(draft|gallery|kit)\.js$/) });

/** The scripts are page routes: like the pages that load them, they need the page cookie. */
export function assetRoutes(assets: StudioAssets): PageRoute[] {
  return [
    pageRoute({
      id: 'asset',
      path: '/assets/{name}',
      params: AssetParams,
      handle: async ({ params }) => ({
        status: 200,
        body: await assets.script(params.name.slice(0, -'.js'.length) as ScriptName),
        type: SCRIPT_TYPE,
      }),
    }),
  ];
}
