// `kitvas kit images <id> --from <folder>`: screenshots from a project folder into a written kit's
// `source/images/`. `kit.ts` routes here.

import { addImages } from '../../../kit/index.ts';
import { KitvasError, type Translate } from '../../../shared/index.ts';
import type { CommandContext } from '../../registry.ts';
import type { KitDeps } from './kit.ts';

export type KitImagesView = {
  view: 'images';
  id: string;
  copied: number;
  /** Files of the folder that were not copied, with the message key of the reason. */
  skipped: { file: string; reason: string }[];
};

export function imagesView(deps: KitDeps, ctx: CommandContext, id: string): KitImagesView {
  const folder = ctx.flags.from;
  if (!folder) throw new KitvasError('USAGE', { detail: ctx.t('kits.usage.images') });
  const added = addImages(
    { kits: deps.kits, kitWriter: deps.kitWriter, files: deps.projectFiles(ctx.cwd) },
    id,
    folder
      .replaceAll('\\', '/')
      .replace(/^(?:\.\/)+/, '')
      .replace(/\/+$/, ''),
  );
  return { view: 'images', ...added };
}

export function renderImages(data: KitImagesView, t: Translate): string {
  return [
    t('kits.images.ok', { count: data.copied, id: data.id }),
    ...data.skipped.map((item) =>
      t('kits.new.skipped', { file: item.file, reason: t(item.reason) }),
    ),
  ].join('\n');
}
