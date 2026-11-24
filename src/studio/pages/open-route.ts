// `/open?code=&to=`: trades a one-time code for the page cookie, then goes to the page.

import type { Translate } from '../../shared/index.ts';
import { NoParams } from '../api/schemas.ts';
import { openPageRoute, type PageRoute } from '../http/router.ts';
import { type OpenLinks, pagePathAllowed } from '../security/open-links.ts';
import { pageCookieHeader } from '../security/page-cookie.ts';
import { lockedPage } from './locked.ts';
import type { Skin } from './skin.ts';

export type OpenRouteDeps = {
  links: OpenLinks;
  t: Translate;
  /** The studio's port: the cookie's name carries it. */
  port: number;
  pageSecret: string;
  /** The studio's style sheet, for the page a used link gets. */
  skin: Skin;
};

export function openRoute(deps: OpenRouteDeps): PageRoute {
  return openPageRoute({
    id: 'open',
    path: '/open',
    params: NoParams,
    handle: ({ query, nonce }) => {
      if (!deps.links.redeem(query.get('code'))) {
        const body = lockedPage({ t: deps.t, nonce, skin: deps.skin, reason: 'used' });
        return { status: 401, body };
      }
      const to = query.get('to') ?? '/';
      return {
        status: 303,
        body: '',
        headers: {
          location: pagePathAllowed(to) ? to : '/',
          'set-cookie': pageCookieHeader(deps.port, deps.pageSecret),
        },
      };
    },
  });
}
