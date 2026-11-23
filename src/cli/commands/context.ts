// `kitvas context <slug> --section <id>`: what an agent needs to write one section.

import { type SectionContext, saveSectionContext, sectionContext } from '../../drafts/index.ts';
import { KitvasError } from '../../shared/index.ts';
import { type Command, defineCommand } from '../registry.ts';
import { type DraftDeps, openDrafts, slugAt } from './draft.ts';

type Saved = { section: string; path: string };

// A context has no top-level `path`, so the key tells the two answers apart.
const isSaved = (data: SectionContext | Saved): data is Saved => 'path' in data;

export function createContextCommand(deps: DraftDeps): Command {
  return defineCommand<SectionContext | Saved>({
    name: 'context',
    summary: 'command.context.summary',
    run(ctx) {
      const drafts = openDrafts(deps, ctx);
      const slug = slugAt(ctx, 0);
      const section = ctx.flags.section;
      if (!section) throw new KitvasError('USAGE', { detail: ctx.t('drafts.usage.section') });
      if (ctx.flags.save) return saveSectionContext(drafts, deps.kits, slug, section);
      return sectionContext(drafts, deps.kits, slug, section);
    },
    // The context is data for an agent: without --json it is printed as readable JSON.
    render: (data, t) => (isSaved(data) ? t('context.saved', data) : JSON.stringify(data, null, 2)),
  });
}
