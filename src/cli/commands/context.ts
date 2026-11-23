// `kitvas context <slug> --section <id>`: what an agent needs to write one section.

import { type SectionContext, sectionContext } from '../../drafts/index.ts';
import { KitvasError } from '../../shared/index.ts';
import { type Command, defineCommand } from '../registry.ts';
import { type DraftDeps, openDrafts, slugAt } from './draft.ts';

export function createContextCommand(deps: DraftDeps): Command {
  return defineCommand<SectionContext>({
    name: 'context',
    summary: 'command.context.summary',
    run(ctx) {
      const drafts = openDrafts(deps, ctx);
      const slug = slugAt(ctx, 0);
      const section = ctx.flags.section;
      if (!section) throw new KitvasError('USAGE', { detail: ctx.t('drafts.usage.section') });
      return sectionContext(drafts, deps.kits, slug, section);
    },
    // The context is data for an agent: without --json it is printed as readable JSON.
    render: (data) => JSON.stringify(data, null, 2),
  });
}
