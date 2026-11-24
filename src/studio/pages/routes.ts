// The studio's pages: the gallery of drafts, and one draft.

import { type DraftStore, listDeleted } from '../../drafts/index.ts';
import type { KitStore } from '../../kit/index.ts';
import type { Translate } from '../../shared/index.ts';
import { KitParams, NoParams, SlugParams } from '../api/schemas.ts';
import { type PageRoute, pageRoute } from '../http/router.ts';
import { draftPage } from './draft/draft-page.ts';
import type { FrameOrigin } from './draft/frame-src.ts';
import { galleryPage } from './gallery.ts';
import { kitListPage, kitPage } from './kit/kit-page.ts';
import type { Skin } from './skin.ts';
import { deletedPage } from './trash/trash-list.ts';

export type PageDeps = {
  drafts: DraftStore;
  /** For the name of the kit a draft was built from. */
  kits: KitStore;
  /** The project folder: where the built examples of the kits are. */
  project?: string | undefined;
  t: Translate;
  /** The studio's style sheet, from `studioSkin`. */
  skin: Skin;
  frame: FrameOrigin;
};

export function pageRoutes(deps: PageDeps): PageRoute[] {
  return [
    pageRoute({
      id: 'home',
      path: '/',
      params: NoParams,
      handle: ({ query, host, nonce }) => galleryPage(deps, { query, host, nonce }),
    }),
    pageRoute({
      id: 'draft',
      path: '/drafts/{slug}',
      params: SlugParams,
      handle: ({ params, query, host, nonce }) => {
        // A draft in the trash gets a page that says so, with Restore (ADR 0064), not a bare error.
        const gone = deps.drafts.exists(params.slug, 'draft.json')
          ? undefined
          : listDeleted(deps.drafts).find((item) => item.slug === params.slug);
        if (gone) {
          const { t, skin } = deps;
          const body = deletedPage({ t, nonce, skin, slug: gone.slug, title: gone.title });
          return { status: 410, body };
        }
        return draftPage(deps, params.slug, { query, host, nonce });
      },
    }),
    pageRoute({
      id: 'kits',
      path: '/kit',
      params: NoParams,
      handle: ({ nonce }) => kitListPage(deps, { nonce }),
    }),
    pageRoute({
      id: 'kit',
      path: '/kit/{id}',
      params: KitParams,
      handle: ({ params, host, nonce }) => kitPage(deps, params.id, { host, nonce }),
    }),
  ];
}
