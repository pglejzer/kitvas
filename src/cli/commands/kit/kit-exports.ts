// `kitvas kit exports [id]`: the component names the package or folder of a project kit exports,
// and which of them the kit has (ADR 0081). `kit.ts` routes here.

import { type KitExports, kitExports } from '../../../checks/index.ts';
import type { Translate } from '../../../shared/index.ts';
import { disposeRenderTools } from '../draft/build.ts';
import type { KitDeps } from './kit.ts';

export type KitExportsView = { view: 'exports' } & KitExports;

/** Lists the exports with the bundler of a fresh set of render tools, stopped afterwards. */
export async function exportsView(deps: KitDeps, id: string): Promise<KitExportsView> {
  const tools = deps.render();
  try {
    const found = await kitExports(
      { kits: deps.kits, bundler: tools.bundler, projectFiles: deps.projectFiles },
      id,
    );
    return { view: 'exports', ...found };
  } finally {
    await disposeRenderTools(tools);
  }
}

export function renderExports(data: KitExportsView, t: Translate): string {
  const { source } = data;
  const from = source.type === 'npm' ? `${source.package} ${source.version}` : source.path;
  const counts = { covered: data.covered.length, open: data.open.length, total: data.total };
  const lines = [t('kits.exports.ok', { id: data.id, source: from, ...counts })];
  if (data.open.length > 0) lines.push(t('kits.exports.open', { names: data.open.join(', ') }));
  return lines.join('\n');
}
