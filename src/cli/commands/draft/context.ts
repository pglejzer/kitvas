// `kitvas context <slug> --section <id>`: what an agent needs to write one section. A craft draft
// has no sections: `kitvas context <slug>` answers what the sketcher needs for its sketches.

import {
  type CraftContext,
  craftContext,
  loadDraft,
  type SectionContext,
  saveCraftContext,
  saveSectionContext,
  sectionContext,
  type TailwindFiles,
} from '../../../drafts/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import { type Command, defineCommand } from '../../registry.ts';
import { type DraftDeps, openDrafts, slugAt } from './draft.ts';

/** A context also reads the project: the kit's catalog build and the installed Tailwind. */
export type ContextDeps = DraftDeps & { projectFiles(cwd: string): TailwindFiles };

/** `section` is absent for the context of a craft draft. */
type Saved = { section?: string; path: string };
type ContextData = SectionContext | CraftContext | Saved;

// A context has no top-level `path`, so the key tells the two answers apart.
const isSaved = (data: ContextData): data is Saved => 'path' in data;

export function createContextCommand(deps: ContextDeps): Command {
  return defineCommand<ContextData>({
    name: 'context',
    summary: 'command.context.summary',
    run(ctx) {
      const drafts = openDrafts(deps, ctx);
      const slug = slugAt(ctx, 0);
      const files = deps.projectFiles(ctx.cwd);
      const section = ctx.flags.section;
      if (section) {
        if (ctx.flags.save) return saveSectionContext(drafts, deps.kits, slug, section, files);
        return sectionContext(drafts, deps.kits, slug, section, files);
      }
      if (loadDraft(drafts, slug).kind !== 'craft') {
        throw new KitvasError('USAGE', { detail: ctx.t('drafts.usage.section') });
      }
      if (ctx.flags.save) return saveCraftContext(drafts, deps.kits, slug, files);
      return craftContext(drafts, deps.kits, slug, files);
    },
    // The context is data for an agent: without --json it is printed as readable JSON.
    render(data, t) {
      if (!isSaved(data)) return JSON.stringify(data, null, 2);
      return data.section === undefined
        ? t('context.savedCraft', { path: data.path })
        : t('context.saved', { section: data.section, path: data.path });
    },
  });
}
