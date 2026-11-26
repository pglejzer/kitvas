// `kitvas kit merge <id>`: the learners' fragments in `<kit>/parts/` into kit.json (ADR 0081).
// `kit.ts` routes here.

import { mergeKit } from '../../../kit/index.ts';
import type { Translate } from '../../../shared/index.ts';
import type { CommandContext } from '../../registry.ts';
import type { KitDeps } from './kit.ts';

type IssueLine = { fragment: string; path: string; message: string };

/**
 * `kit merge` as the CLI answers it, each issue with its sentence. Merged: `added`, `replaced`,
 * `components` and `gaps`; no fragments: `components`; refused: only the issues.
 */
export type KitMergeView = {
  view: 'merge';
  id: string;
  merged: boolean;
  added?: string[];
  replaced?: string[];
  components?: number;
  gaps?: number;
  issues: IssueLine[];
};

export function mergeView(deps: KitDeps, ctx: CommandContext, id: string): KitMergeView {
  const result = mergeKit({ kits: deps.kits, kitWriter: deps.kitWriter }, id);
  const issues = result.issues.map((issue) => ({
    fragment: issue.fragment,
    path: issue.path,
    message: ctx.t(issue.key, issue.params),
  }));
  return { view: 'merge', ...result, issues };
}

const issueLine = (issue: IssueLine): string => {
  if (issue.fragment === '') return `  ${issue.message}`;
  if (issue.path === '') return `  ${issue.fragment}: ${issue.message}`;
  return `  ${issue.fragment}  ${issue.path}: ${issue.message}`;
};

export function renderMerge(data: KitMergeView, t: Translate): string {
  const components = data.components ?? 0;
  if (data.merged) {
    return t('kits.merge.ok', {
      id: data.id,
      added: data.added?.length ?? 0,
      replaced: data.replaced?.length ?? 0,
      components,
      gaps: data.gaps ?? 0,
    });
  }
  if (data.issues.length === 0) return t('kits.merge.none', { id: data.id, components });
  return [
    t('kits.merge.failed', { id: data.id, count: data.issues.length }),
    ...data.issues.map(issueLine),
  ].join('\n');
}
