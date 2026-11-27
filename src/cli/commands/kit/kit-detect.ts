// `kitvas kit detect`: what in the project points at a design system, and which kits are stale or
// have out-of-date components. `kit.ts` routes here.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readVerifyFile, VERIFY_FILE } from '../../../checks/index.ts';
import { type Detected, detectKits, outdatedComponents } from '../../../kit/index.ts';
import { catalogDir, KitvasError, type Translate } from '../../../shared/index.ts';
import type { CommandContext } from '../../registry.ts';
import type { KitDeps } from './kit.ts';
import { projectKitId } from './project-kit.ts';

export type KitDetectView = { view: 'detect' } & Detected;

export function detectView(deps: KitDeps, ctx: CommandContext): KitDetectView {
  const files = deps.projectFiles(ctx.cwd);
  const verifiedHash = (id: string): string | undefined => {
    try {
      return readVerifyFile(readFileSync(join(catalogDir(ctx.cwd, id), VERIFY_FILE), 'utf8'))?.hash;
    } catch {
      return undefined;
    }
  };
  const outdated = (id: string): string[] => {
    try {
      const origins = { kits: deps.kits, kitWriter: deps.kitWriter, files };
      return outdatedComponents(origins, id).map((item) => item.name);
    } catch (error) {
      if (!(error instanceof KitvasError)) throw error;
      return [];
    }
  };
  return {
    view: 'detect',
    ...detectKits({
      kits: deps.kits,
      files,
      verifiedHash,
      activeKit: projectKitId(deps.kits, ctx),
      outdated,
    }),
  };
}

export function renderDetect(data: KitDetectView, t: Translate): string {
  const { signs } = data;
  const lines = data.kits.flatMap((kit) => [
    t(kit.stale ? 'kits.detect.kitStale' : 'kits.detect.kit', { id: kit.id, source: kit.source }),
    ...(kit.outdated.length > 0
      ? [t('kits.detect.outdated', { id: kit.id, names: kit.outdated.join(', ') })]
      : []),
  ]);
  if (data.kits.length === 0) lines.push(t('kits.detect.noKits'));
  lines.push(
    data.active === null ? t('kits.detect.noActive') : t('kits.detect.active', { id: data.active }),
  );
  if (signs.components.length > 0) {
    lines.push(t('kits.detect.components', { folders: signs.components.join(', ') }));
  }
  if (signs.packages.length > 0) {
    lines.push(t('kits.detect.packages', { names: signs.packages.join(', ') }));
  }
  if (signs.figma.length > 0) lines.push(t('kits.detect.figma', { urls: signs.figma.join(' ') }));
  if (signs.components.length + signs.packages.length + signs.figma.length === 0) {
    lines.push(t('kits.detect.noSigns'));
  }
  return lines.join('\n');
}
