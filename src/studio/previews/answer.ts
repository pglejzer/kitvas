// The palette answer's `previews` (ADR 0075): the keeper's view of a kit, each file as an address on
// the prototype origin that the studio page can use as `<img src>` (its CSP allows that origin's
// images). A new set of previews lives in a new folder, so its addresses are new as well.

import { PREVIEWS_DIR } from '../../checks/index.ts';
import type { Previews } from '../api/edit/structure-schemas.ts';
import { catalogPreviewSrc, type FrameOrigin } from '../pages/draft/frame-src.ts';
import type { KitPreviews, PreviewsKeeper } from './keeper.ts';

/** What the palette route needs for previews: the keeper and the prototype origin. */
export type PalettePreviews = { keeper: PreviewsKeeper; frame: FrameOrigin };

export const NO_PREVIEWS: Previews = { state: 'none', backdrop: null, components: {}, icons: null };

/** The answer for one view; `src` makes an address of a path below the kit's catalog folder. */
export function previewsAnswer(view: KitPreviews, src: (path: string) => string): Previews {
  const stamp = view.state === 'none' ? undefined : view.stamp;
  // `making` with no earlier set has nothing to show yet.
  if (view.state === 'none' || stamp === undefined) {
    return { ...NO_PREVIEWS, state: view.state };
  }
  const at = (file: string): string => src(`${PREVIEWS_DIR}/${stamp.folder}/${file}`);
  const components: Record<string, string> = {};
  for (const [name, file] of Object.entries(stamp.components)) components[name] = at(file);
  const { icons } = stamp;
  return {
    state: view.state,
    backdrop: stamp.backdrop,
    components,
    icons:
      icons === null
        ? null
        : { src: at(icons.file), cell: icons.cell, columns: icons.columns, names: icons.names },
  };
}

/** The palette's `previews` for a draft's kit, as the studio page at `host` loads them. */
export function palettePreviews(
  source: PalettePreviews | undefined,
  kitId: string,
  host: string,
): Previews {
  if (source === undefined) return NO_PREVIEWS;
  const src = (path: string): string => catalogPreviewSrc(source.frame, host, { kitId, path });
  return previewsAnswer(source.keeper.view(kitId), src);
}
