// One-time links into the studio's pages, for `kitvas studio` to print.

import { type ApiRoute, apiRoute } from '../http/router.ts';
import { fallbackStudioUrl, studioUrl } from '../security/host-names.ts';
import type { OpenLinks } from '../security/open-links.ts';
import { LinkRequestSchema, LinkSchema, NoParams } from './schemas.ts';

export function linkRoutes(deps: { links: OpenLinks; port: number }): ApiRoute[] {
  return [
    apiRoute({
      id: 'createLink',
      summary: 'A one-time link that opens a studio page in a browser. It works once, for 60 s.',
      method: 'POST',
      path: '/api/v1/links',
      policy: 'write',
      params: NoParams,
      request: LinkRequestSchema,
      response: { status: 200, schema: LinkSchema },
      // Built on the studio's port, not the request's Host: the CLI calls 127.0.0.1, while a
      // person opens the studio's own name.
      handle: ({ body }) => {
        const { code, expiresAt } = deps.links.issue();
        const target = `/open?${new URLSearchParams({ code, to: body.path })}`;
        return {
          status: 200,
          body: {
            url: `${studioUrl(deps.port)}${target}`,
            fallbackUrl: `${fallbackStudioUrl(deps.port)}${target}`,
            expiresAt,
          },
        };
      },
    }),
  ];
}
