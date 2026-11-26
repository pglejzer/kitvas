// The route of "Make default" (plan 25): it writes the `default` of each option of the latest
// version in `options.json`. It is an edit of the version, so it follows the edit session's rules:
// only the latest version (`EDIT_STALE_VERSION` otherwise), and the first edit of a session starts
// a version. It answers as an applied edit does, with the exact inverse (a `file` op), so the
// editor's history undoes it through `POST …/edits`. The rules are in the drafts module.

import {
  editSession,
  latestVersion,
  loadDraft,
  readOptions,
  setOptionDefaults,
  startEditSession,
  versionFolder,
} from '../../../drafts/index.ts';
import { hashOf } from '../../../edit/index.ts';
import { KitvasError, pickChoice } from '../../../shared/index.ts';
import { etagOf } from '../../http/etag.ts';
import { type ApiRoute, apiRoute } from '../../http/router.ts';
import { SlugParams } from '../schemas.ts';
import type { EditRouteDeps } from './edit-routes.ts';
import { EditOutcomeSchema } from './edit-schemas.ts';
import { OptionsDefaultRequestSchema } from './options-schemas.ts';

/** The options file, inside a version. */
export const OPTIONS_FILE = 'src/json/options.json';

export function optionsRoutes(deps: EditRouteDeps): ApiRoute[] {
  return [
    apiRoute({
      id: 'makeOptionsDefault',
      summary:
        '"Make default": the given values become the defaults of the latest version\'s options. One undo step.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/options/default',
      policy: 'write',
      params: SlugParams,
      request: OptionsDefaultRequestSchema,
      response: { status: 200, schema: EditOutcomeSchema },
      handle: ({ params, body }) => {
        const { slug } = params;
        const draft = loadDraft(deps.drafts, slug);
        const latest = latestVersion(draft);
        if (body.version !== latest) {
          throw new KitvasError('EDIT_STALE_VERSION', { slug, version: body.version, latest });
        }
        const options = readOptions(deps.drafts, slug, versionFolder(latest));
        if (options.length === 0) {
          throw new KitvasError('DRAFT_INVALID', {
            slug,
            detail: `${versionFolder(latest)}/${OPTIONS_FILE}`,
          });
        }
        const next = pickChoice(options, body.choice);
        const nothing = {
          outcome: 'applied' as const,
          version: latest,
          started: false,
          etags: {},
          merged: false,
          inverse: [],
          renames: {},
          created: [],
          dropped: [],
        };
        // The values are the defaults already: no version is started for nothing.
        if (options.every((option) => next[option.id] === option.default)) {
          return { status: 200, body: nothing };
        }
        const started = editSession(draft) === null;
        const version = started ? startEditSession(deps.drafts, slug, deps.now()) : latest;
        const { before, after } = setOptionDefaults(deps.drafts, slug, version, next);
        return {
          status: 200,
          body: {
            ...nothing,
            version,
            started,
            etags: { [OPTIONS_FILE]: etagOf(after) },
            inverse: [
              { op: 'file' as const, file: OPTIONS_FILE, text: before, before: hashOf(after) },
            ],
          },
        };
      },
    }),
  ];
}
