// Locked and hidden elements, and Restore (spec 4d, goal 4; plan 17, task C). The editor reads
// both lists at start, writes them whole when Layers changes them, and asks for the edit that puts
// a changed lock's text back. The rules are in the drafts module (`app/view.ts`), the comparison
// in `../../live/locks.ts`; a handler checks the input and calls them. Nothing here writes a
// source file: Restore answers the edit, and the editor sends it as any other.

import {
  type Lock,
  latestVersion,
  loadDraft,
  MAX_LOCK_TEXT,
  newLock,
  type Stamp,
  saveView,
  versionFolder,
} from '../../../drafts/index.ts';
import { lockRestore, offsetOf } from '../../../edit/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import { type ApiRoute, apiRoute } from '../../http/router.ts';
import { elementsNow, type LockDeps, lockReport, viewNow } from '../../live/locks.ts';
import { RestorePreviewSchema } from '../history/history-schemas.ts';
import type { ApiDeps } from '../routes.ts';
import { SlugParams } from '../schemas.ts';
import { LockRestoreRequestSchema, ViewSchema, ViewUpdateSchema } from './view-schemas.ts';

/** `sections/Hero:section/Button` is written in `src/tsx/sections/Hero.tsx`. */
const fileOf = (id: string): string => `src/tsx/${id.slice(0, Math.max(0, id.indexOf(':')))}.tsx`;

export function viewRoutes(deps: ApiDeps): ApiRoute[] {
  // Without the editor's compiler the elements come from the last build (`ids.json`).
  const lockDeps = (): LockDeps => ({ drafts: deps.drafts, compiler: deps.edit?.compiler });

  /**
   * The locks to write for the posted ids. A lock already kept keeps its text under its id now
   * (a lost one too, while the editor still lists it); a new one takes its element's source now.
   * An id with no element, or one longer than a lock keeps, is left out.
   */
  async function locksFor(slug: string, ids: readonly string[], stamp: Stamp): Promise<Lock[]> {
    const report = await lockReport(lockDeps(), slug);
    const kept = new Map<string, string>();
    for (const { lock, element } of report.entries) {
      kept.set(element?.id ?? lock.id, lock.text);
      if (!kept.has(lock.id)) kept.set(lock.id, lock.text);
    }
    const fresh = ids.filter((id) => !kept.has(id));
    const files = fresh.map(fileOf);
    const { elements } = await elementsNow(lockDeps(), slug, stamp.version, files);
    const sources = new Map(
      elements.map((element): [string, string] => [element.id, element.source]),
    );
    return ids.flatMap((id): Lock[] => {
      const text = kept.get(id) ?? sources.get(id);
      return text === undefined || text.length > MAX_LOCK_TEXT ? [] : [newLock(id, text, stamp)];
    });
  }

  return [
    apiRoute({
      id: 'getView',
      summary: 'Locked and hidden elements, and the locks another writer changed or took away.',
      method: 'GET',
      path: '/api/v1/drafts/{slug}/view',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: ViewSchema },
      handle: async ({ params }) => ({
        status: 200,
        body: await viewNow(lockDeps(), params.slug),
      }),
    }),
    apiRoute({
      id: 'setView',
      summary: 'Writes both lists whole; a new lock keeps the source its element has now.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/view',
      policy: 'write',
      params: SlugParams,
      request: ViewUpdateSchema,
      response: { status: 200, schema: ViewSchema },
      handle: async ({ params, body }) => {
        // A draft that is not there is a 404 here.
        const version = latestVersion(loadDraft(deps.drafts, params.slug));
        const stamp: Stamp = { version, at: deps.now().toISOString() };
        const locked = await locksFor(params.slug, body.locked, stamp);
        saveView(deps.drafts, params.slug, { latest: version, locked, hidden: body.hidden });
        return { status: 200, body: await viewNow(lockDeps(), params.slug) };
      },
    }),
    apiRoute({
      id: 'restoreLock',
      summary: "The edit that puts a locked element's kept source back, with the diff to show.",
      method: 'POST',
      path: '/api/v1/drafts/{slug}/view/restore',
      policy: 'write',
      params: SlugParams,
      request: LockRestoreRequestSchema,
      response: { status: 200, schema: RestorePreviewSchema },
      handle: async ({ params, body }) => {
        const report = await lockReport(lockDeps(), params.slug);
        const gone = (): KitvasError =>
          new KitvasError('EDIT_ELEMENT_NOT_FOUND', {
            slug: params.slug,
            version: report.version,
            id: body.id,
          });
        const entry = report.entries.find((one) => one.element?.id === body.id);
        if (entry === undefined || entry.element === null) throw gone();
        const { element } = entry;
        const path = `${versionFolder(report.version)}/${element.file}`;
        const text = deps.drafts.readText(params.slug, path);
        if (text === undefined) throw gone();
        const preview = lockRestore(deps.kits, {
          id: element.id,
          file: element.file,
          kept: entry.lock.text,
          text,
          // The element's `<` in the text now: the line and column the report read it at.
          at: offsetOf(text, element.line, element.column),
          kitId: loadDraft(deps.drafts, params.slug).kit.id,
        });
        if (preview === null) throw gone();
        return { status: 200, body: preview };
      },
    }),
  ];
}
