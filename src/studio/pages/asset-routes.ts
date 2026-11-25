// `/assets/draft.js`, `gallery.js`, `kit.js` and `page.js`: the studio's browser scripts, bundled on first
// use. `/assets/fonts/<file>`: the studio's typeface, from the font package (`fonts.ts`).

import { z } from '../../shared/index.ts';
import { type PageRoute, pageRoute } from '../http/router.ts';
import { FONT_FILES, FONT_TYPE, type FontFile } from './fonts.ts';

export const SCRIPT_NAMES = ['draft', 'gallery', 'kit', 'page'] as const;
export type ScriptName = (typeof SCRIPT_NAMES)[number];

export type StudioAssets = {
  /** The bundled script of a studio page. */
  script(name: ScriptName): Promise<string>;
  /** The bytes of one file of the studio's typeface. */
  font(name: FontFile): Promise<Buffer>;
};

export const SCRIPT_TYPE = 'text/javascript; charset=utf-8';

/**
 * A font file never changes under its name while the studio runs, and it is the same for every
 * page: the browser may keep it for a month, for this person only. Without this every page would
 * show the system's font first and then change.
 */
export const FONT_CACHE = 'private, max-age=2592000';

const AssetParams = z.strictObject({ name: z.string().regex(/^(draft|gallery|kit|page)\.js$/) });

const isFontFile = (name: string): name is FontFile => FONT_FILES.some((file) => file === name);

const FontParams = z.strictObject({ name: z.string().refine(isFontFile) });

/** The scripts and fonts are page routes: like the pages that load them, they need the page cookie. */
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
    pageRoute({
      id: 'font',
      path: '/assets/fonts/{name}',
      params: FontParams,
      handle: async ({ params }) => ({
        status: 200,
        // The check above narrowed the name; the schema's type does not carry that.
        body: await assets.font(params.name as FontFile),
        type: FONT_TYPE,
        headers: { 'cache-control': FONT_CACHE },
      }),
    }),
  ];
}
