// `kitvas layout <slug>`: check layout.md against the kit and write the entry files.

import { checkLayout, type LayoutReport } from '../../drafts/index.ts';
import { columns } from '../output/columns.ts';
import { type Command, defineCommand } from '../registry.ts';
import { type DraftDeps, openDrafts, slugAt } from './draft.ts';

export type LayoutView = Omit<LayoutReport, 'issues'> & {
  issues: { path: string; message: string }[];
};

export function createLayoutCommand(deps: DraftDeps): Command {
  return defineCommand<LayoutView>({
    name: 'layout',
    summary: 'command.layout.summary',
    run(ctx) {
      const drafts = openDrafts(deps, ctx);
      const report = checkLayout(drafts, deps.kits, slugAt(ctx, 0));
      return {
        ...report,
        issues: report.issues.map((issue) => ({
          path: issue.path,
          message: ctx.t(issue.key, issue.params),
        })),
      };
    },
    render(data, t) {
      if (!data.valid) {
        return [
          t('drafts.layout.failed', { slug: data.slug, count: data.issues.length }),
          ...data.issues.map((issue) => `  ${issue.path}: ${issue.message}`),
        ].join('\n');
      }
      return [
        t('drafts.layout.ok', { slug: data.slug, count: data.sections.length }),
        ...columns(
          data.sections.map((section) => [
            `  ${section.id}`,
            t(section.written ? 'drafts.layout.written' : 'drafts.layout.missing'),
          ]),
        ),
      ].join('\n');
    },
  });
}
