// The person's own settings of the studio (ADR 0057): the view, which is the theme, the panels
// and the accent. They belong to the person, not to a draft or a project, so they are kept in
// `~/.kitvas/config.json` (`src/shared/settings/config.ts`) and every studio of this person
// shows the same view. The draft's locked and hidden elements are another thing (`../view/`).

import { ViewSettingsSchema } from '../../../shared/index.ts';
import { type ApiRoute, apiRoute } from '../../http/router.ts';
import type { ApiDeps } from '../routes.ts';
import { NoParams } from '../schemas.ts';

export function settingsRoutes(deps: ApiDeps): ApiRoute[] {
  return [
    apiRoute({
      id: 'getViewSettings',
      summary: 'The view the person chose: theme, panels and accent.',
      method: 'GET',
      path: '/api/v1/settings/view',
      policy: 'read',
      params: NoParams,
      request: null,
      response: { status: 200, schema: ViewSettingsSchema },
      handle: () => ({ status: 200, body: deps.view.read() }),
    }),
    apiRoute({
      id: 'setViewSettings',
      summary: 'Saves the view for this person; every page shows it from its next load.',
      method: 'POST',
      path: '/api/v1/settings/view',
      policy: 'write',
      params: NoParams,
      request: ViewSettingsSchema,
      response: { status: 200, schema: ViewSettingsSchema },
      handle: ({ body }) => {
        // A settings file that cannot be read is `CONFIG_INVALID`: it is never written over.
        deps.view.write(body);
        return { status: 200, body };
      },
    }),
  ];
}
