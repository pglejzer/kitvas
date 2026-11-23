// Use cases of a craft draft's picked sketch: pick one, and read the picked final.

import { KitvasError } from '../../shared/index.ts';
import {
  type CraftSubject,
  type Draft,
  latestVersion,
  SKETCHES,
  type Sketch,
  serializeJson,
} from '../domain/draft.ts';
import { versionFolder } from '../domain/names.ts';
import type { DraftStore } from '../ports/draft-store.ts';
import { loadDraft } from './load-draft.ts';
import { addVersion } from './new-version.ts';

/** Path of a sketch inside the draft, in the given version. */
export const sketchFile = (version: number, sketch: Sketch): string =>
  `${versionFolder(version)}/src/tsx/sketches/${sketch}.tsx`;

const isSketch = (text: string): text is Sketch => (SKETCHES as readonly string[]).includes(text);

const unknownSketch = (slug: string, sketch: string): KitvasError =>
  new KitvasError('SKETCH_UNKNOWN', { slug, sketch });

/** The craft block of a draft; any other kind is `DRAFT_KIND`. */
export function requireCraft(draft: Draft): NonNullable<Draft['craft']> {
  if (!draft.craft) {
    throw new KitvasError('DRAFT_KIND', { slug: draft.slug, kind: draft.kind, needed: 'craft' });
  }
  return draft.craft;
}

/**
 * Sets `picked` and starts the next version, which keeps that sketch only. A name that is not A, B or C,
 * or a sketch the latest version no longer holds, is `SKETCH_UNKNOWN`.
 */
export function pickSketch(
  store: DraftStore,
  slug: string,
  sketch: string,
  now: Date = new Date(),
): { slug: string; picked: Sketch; version: number } {
  const draft = loadDraft(store, slug);
  const craft = requireCraft(draft);
  if (!isSketch(sketch)) throw unknownSketch(slug, sketch);
  if (store.readText(slug, sketchFile(latestVersion(draft), sketch)) === undefined) {
    throw unknownSketch(slug, sketch);
  }
  store.writeText(
    slug,
    'draft.json',
    serializeJson({ ...draft, craft: { ...craft, picked: sketch } }),
  );
  const next = addVersion(store, slug, now);
  return { slug, picked: sketch, version: next.version };
}

/** What `craft add` and `craft export` take from a draft: the picked sketch's file and its subject. */
export type PickedFinal = {
  /** The id of the kit the draft was started from. */
  kit: string;
  subject: CraftSubject;
  name: string;
  description: string;
  sketch: Sketch;
  /** Text of the picked sketch's file in the latest version. */
  text: string;
};

/** The picked sketch of the latest version. Not craft is `DRAFT_KIND`; nothing picked is `SKETCH_UNKNOWN`. */
export function pickedFinal(store: DraftStore, slug: string): PickedFinal {
  const draft = loadDraft(store, slug);
  const craft = requireCraft(draft);
  if (craft.picked === null) throw unknownSketch(slug, '');
  const text = store.readText(slug, sketchFile(latestVersion(draft), craft.picked));
  if (text === undefined) throw unknownSketch(slug, craft.picked);
  return {
    kit: draft.kit.id,
    subject: craft.subject,
    name: craft.name,
    description: craft.description,
    sketch: craft.picked,
    text,
  };
}
