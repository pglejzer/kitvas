// Use case: start a draft with its first version.

import { KitvasError } from '../../shared/index.ts';
import {
  type CraftSubject,
  type Draft,
  type DraftKind,
  DraftSchema,
  SKETCHES,
  serializeJson,
} from '../domain/draft.ts';
import { isSlug, versionFolder } from '../domain/names.ts';
import { DEFAULT_STATES } from '../domain/states.ts';
import {
  briefTemplate,
  craftBriefTemplate,
  layoutTemplate,
  sketchTemplate,
} from '../domain/templates.ts';
import type { DraftStore } from '../ports/draft-store.ts';

export type NewDraftInput = {
  slug: string;
  title: string;
  kit: Draft['kit'];
  now: Date;
  /** Default `screen`. */
  kind?: DraftKind;
  rework?: { source: NonNullable<Draft['rework']>['source'] };
  craft?: { subject: CraftSubject; name: string; description: string };
};

const EMPTY_FOLDERS = ['src/tsx/sections', 'src/scss/sections', 'src/img'];

export function createDraft(store: DraftStore, input: NewDraftInput): Draft {
  const { slug, title, kit } = input;
  if (!isSlug(slug)) throw new KitvasError('DRAFT_INVALID', { slug, detail: 'slug' });
  if (store.exists(slug)) throw new KitvasError('DRAFT_EXISTS', { slug });

  const kind = input.kind ?? 'screen';
  const createdAt = input.now.toISOString();
  const candidate = {
    schemaVersion: 1,
    slug,
    title,
    kind,
    kit,
    createdAt,
    versions: [{ number: 1, createdAt }],
    ...(input.rework ? { rework: input.rework } : {}),
    ...(input.craft ? { craft: { ...input.craft, picked: null } } : {}),
  };
  const parsed = DraftSchema.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.join('.') || 'draft.json';
    throw new KitvasError('DRAFT_INVALID', { slug, detail: `${where}: ${first?.message ?? ''}` });
  }
  const draft = parsed.data;

  const base = versionFolder(1);
  store.writeText(slug, 'draft.json', serializeJson(draft));
  const brief = draft.craft ? craftBriefTemplate(title, draft.craft.subject) : briefTemplate(title);
  store.writeText(slug, `${base}/md/brief.md`, brief);
  if (draft.craft) {
    for (const sketch of SKETCHES) {
      store.writeText(
        slug,
        `${base}/src/tsx/sketches/${sketch}.tsx`,
        sketchTemplate(draft.craft.name, sketch, draft.craft.subject),
      );
    }
  } else {
    store.writeText(slug, `${base}/md/layout.md`, layoutTemplate(title));
  }
  store.writeText(slug, `${base}/src/json/states.json`, serializeJson(DEFAULT_STATES));
  for (const folder of EMPTY_FOLDERS) store.makeDir(slug, `${base}/${folder}`);
  return draft;
}
