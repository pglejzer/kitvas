// Element stamps (spec 4d, goal 9: "a request keeps a hash of each element's source"): what a
// variant changes of an element, hashed. A request keeps one stamp per element when it is made;
// a stamp that differs later, or an element that is gone, makes the request out of date, so its
// variants are never applied to an element the person changed since.
//
// The stamp covers what the panel reads and a variant changes: the tag, the props, the text, the
// class list and every style value (base, widths and states). It leaves the element's children and
// its whitespace out, so moving the element, or its parent, does not make the request stale.

import { createHash } from 'node:crypto';
import type { DraftStore } from '../../drafts/index.ts';
import { type InspectView, inspectElement } from '../../edit/index.ts';
import type { KitStore } from '../../kit/index.ts';
import { KitvasError } from '../../shared/index.ts';
import type { EditDeps } from '../api/edit/edit-routes.ts';
import { etagOf } from '../http/etag.ts';

/** The part of an inspect answer a stamp covers. */
export type Stamped = Pick<
  InspectView,
  'tag' | 'props' | 'text' | 'className' | 'styles' | 'overrides'
>;

export function stampOf(view: Stamped): string {
  const parts = [view.tag, view.props, view.text, view.className, view.styles, view.overrides];
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export type InspectHost = {
  drafts: DraftStore;
  kits: KitStore;
  edit?: EditDeps | undefined;
};

/** An element of the latest version as the editor reads it; `null` when it is gone. */
export type Inspector = (id: string) => Promise<InspectView | null>;

/**
 * Inspects elements of one draft's latest version, each id once per inspector. `undefined` when
 * the studio has no editor (no compiler): then nothing can be read, and nothing counts as stale.
 */
export function inspectorFor(host: InspectHost, slug: string): Inspector | undefined {
  const edit = host.edit;
  if (!edit) return undefined;
  const seen = new Map<string, Promise<InspectView | null>>();
  const read = async (id: string): Promise<InspectView | null> => {
    try {
      return await inspectElement(
        {
          drafts: host.drafts,
          kits: host.kits,
          compiler: edit.compiler,
          etag: etagOf,
          images: edit.images,
        },
        slug,
        id,
      );
    } catch (error) {
      // A gone element, or a file that does not compile now: there is nothing to read.
      if (error instanceof KitvasError) return null;
      throw error;
    }
  };
  return (id) => {
    const known = seen.get(id);
    if (known) return known;
    const next = read(id);
    seen.set(id, next);
    return next;
  };
}

/** The stamps of `ids` now; `null` for each without an editor or gone. */
export async function stampsNow(
  inspect: Inspector | undefined,
  ids: readonly string[],
): Promise<(string | null)[]> {
  if (!inspect) return ids.map(() => null);
  return Promise.all(
    ids.map(async (id) => {
      const view = await inspect(id);
      return view === null ? null : stampOf(view);
    }),
  );
}

/**
 * Whether an element changed since the request was made: a stamp that differs, or an element
 * that is gone now. Without an editor nothing can be told, so nothing is stale.
 */
export function isStale(
  inspect: Inspector | undefined,
  kept: readonly (string | null)[],
  now: readonly (string | null)[],
): boolean {
  if (!inspect) return false;
  return now.some((stamp, index) => stamp === null || stamp !== kept[index]);
}
