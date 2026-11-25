// The studio's pages: the gallery of drafts, one draft, the kits, and the Guide, Shortcuts and
// Doctor pages.

import type { CheckResult } from '../../doctor/index.ts';
import { type DraftStore, listDeleted } from '../../drafts/index.ts';
import type { KitStore } from '../../kit/index.ts';
import { httpStatusOf, KitvasError, type Translate } from '../../shared/index.ts';
import { KitParams, NoParams, SlugParams } from '../api/schemas.ts';
import { type PageRoute, pageRoute } from '../http/router.ts';
import { draftPage } from './draft/draft-page.ts';
import type { FrameOrigin } from './draft/frame-src.ts';
import { galleryPage } from './gallery.ts';
import { doctorPage } from './info/doctor.ts';
import { guidePage } from './info/guide.ts';
import { shortcutsPage } from './info/shortcuts.ts';
import { kitListPage, kitPage } from './kit/kit-page.ts';
import { kitUnreadablePage } from './kit/kit-unreadable.ts';
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
  /** The running kitvas version. */
  version: string;
  /** The id of the kit the project uses (`kit use`); `base` when it chose none. */
  projectKit(): string;
  /** The doctor's checks and its report with nothing private; left out where the studio has no doctor. */
  doctor?: (() => Promise<{ checks: CheckResult[]; report: string }>) | undefined;
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
      handle: ({ host, nonce }) => kitListPage(deps, { host, nonce }),
    }),
    pageRoute({
      id: 'kit',
      path: '/kit/{id}',
      params: KitParams,
      handle: ({ params, host, nonce }) => {
        try {
          return kitPage(deps, params.id, { host, nonce });
        } catch (error) {
          // A kit that cannot be read or is not there gets a page that says why, not a bare error.
          if (!(error instanceof KitvasError)) throw error;
          if (error.code !== 'KIT_INVALID' && error.code !== 'KIT_NOT_FOUND') throw error;
          const body = kitUnreadablePage(deps, params.id, { host, nonce }, error);
          return { status: httpStatusOf(error.code), body };
        }
      },
    }),
    pageRoute({
      id: 'guide',
      path: '/guide',
      params: NoParams,
      handle: ({ host, nonce }) => guidePage(deps, { host, nonce }),
    }),
    pageRoute({
      id: 'shortcuts',
      path: '/shortcuts',
      params: NoParams,
      handle: ({ host, nonce }) => shortcutsPage(deps, { host, nonce }),
    }),
    pageRoute({
      id: 'doctor',
      path: '/doctor',
      params: NoParams,
      handle: ({ host, nonce }) => doctorPage(deps, { host, nonce }),
    }),
  ];
}
