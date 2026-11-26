// `kitvas handoff …`: a finished draft to Figma (plan 21: `figma`, `sent`, `list`) and into the
// project's code (plan 22: `target`, `brief`, `changes`, `compare`, `sent`). The router of the
// subcommands; each lives in its own file. `sent` keeps both kinds of send in the draft's record.

import { KitvasError } from '../../shared/index.ts';
import { type Command, defineCommand } from '../registry.ts';
import {
  type CodeCommandDeps,
  type CodeView,
  renderCode,
  runBrief,
  runChanges,
  runCompare,
  runTarget,
} from './handoff-code.ts';
import {
  type FigmaCommandDeps,
  type FigmaView,
  renderFigma,
  runFigma,
  runList,
  runSent,
} from './handoff-figma.ts';

/** Every subcommand, in the order the skill uses them. */
export const HANDOFF_SUBCOMMANDS = [
  'figma',
  'sent',
  'list',
  'target',
  'brief',
  'changes',
  'compare',
] as const;
export type HandoffSubcommand = (typeof HANDOFF_SUBCOMMANDS)[number];

export type HandoffDeps = FigmaCommandDeps & CodeCommandDeps;
export type HandoffView = FigmaView | CodeView;

const isSubcommand = (text: string): text is HandoffSubcommand =>
  (HANDOFF_SUBCOMMANDS as readonly string[]).includes(text);

const isFigmaView = (data: HandoffView): data is FigmaView =>
  data.view === 'figma' || data.view === 'sent' || data.view === 'list';

export function createHandoffCommand(deps: HandoffDeps): Command {
  return defineCommand<HandoffView>({
    name: 'handoff',
    summary: 'command.handoff.summary',
    run(ctx) {
      const sub = ctx.positionals[0] ?? '';
      if (!isSubcommand(sub)) {
        const names = HANDOFF_SUBCOMMANDS.join(', ');
        throw new KitvasError('USAGE', {
          detail: ctx.t('handoff.usage.unknown', { name: sub, names }),
        });
      }
      switch (sub) {
        case 'figma':
          return runFigma(deps, ctx);
        case 'sent':
          return runSent(deps, ctx);
        case 'list':
          return runList(deps, ctx);
        case 'target':
          return runTarget(deps, ctx);
        case 'brief':
          return runBrief(deps, ctx);
        case 'changes':
          return runChanges(deps, ctx);
        case 'compare':
          return runCompare(deps, ctx);
      }
    },
    render: (data, t) => (isFigmaView(data) ? renderFigma(data, t) : renderCode(data, t)),
  });
}
