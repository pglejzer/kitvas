// Use case: start a draft with its first version.

import { KitvasError } from '../../shared/index.ts';
import { type Draft, serializeJson } from '../domain/draft.ts';
import { isSlug, versionFolder } from '../domain/names.ts';
import { DEFAULT_STATES } from '../domain/states.ts';
import { briefTemplate, layoutTemplate } from '../domain/templates.ts';
import type { DraftStore } from '../ports/draft-store.ts';

export type NewDraftInput = { slug: string; title: string; kit: Draft['kit']; now: Date };

const EMPTY_FOLDERS = ['src/tsx/sections', 'src/scss/sections', 'src/img'];

export function createDraft(store: DraftStore, input: NewDraftInput): Draft {
  const { slug, title, kit } = input;
  if (!isSlug(slug)) throw new KitvasError('DRAFT_INVALID', { slug, detail: 'slug' });
  if (store.exists(slug)) throw new KitvasError('DRAFT_EXISTS', { slug });

  const createdAt = input.now.toISOString();
  const draft: Draft = {
    schemaVersion: 1,
    slug,
    title,
    kind: 'screen',
    kit,
    createdAt,
    versions: [{ number: 1, createdAt }],
  };
  const base = versionFolder(1);
  store.writeText(slug, 'draft.json', serializeJson(draft));
  store.writeText(slug, `${base}/md/brief.md`, briefTemplate(title));
  store.writeText(slug, `${base}/md/layout.md`, layoutTemplate(title));
  store.writeText(slug, `${base}/src/json/states.json`, serializeJson(DEFAULT_STATES));
  for (const folder of EMPTY_FOLDERS) store.makeDir(slug, `${base}/${folder}`);
  return draft;
}
