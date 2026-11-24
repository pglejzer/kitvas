// The studio's look: its own tokens (`../theme/`), then the rules that read them (`skin/`). No
// kit has a part in it: a kit styles prototypes, the studio looks the same whichever kit a draft
// uses (ADR 0057).

import { DEFAULT_VIEW, type ViewSettings } from '../../shared/index.ts';
import { themeCss } from '../theme/theme-css.ts';
import { EDITOR_RULES } from './skin/editor/index.ts';
import { SHARED_RULES } from './skin/index.ts';
import { PAGE_RULES } from './skin/pages/index.ts';

/** The sheet, and the view the person chose (read for every page, so a change shows at once). */
export type StudioSkin = { css: string; view(): ViewSettings };

/** A page's skin. A sheet alone has the default view: what tests and a locked page need. */
export type Skin = string | StudioSkin;

export const skinCss = (skin: Skin): string => (typeof skin === 'string' ? skin : skin.css);

export const skinView = (skin: Skin): ViewSettings =>
  typeof skin === 'string' ? DEFAULT_VIEW : skin.view();

/**
 * The style sheet of every studio page: the studio's tokens (light and dark, the accents, Cards and
 * Flush), the shared rules, then the rules of each page and of each part of the editor (ADR 0057).
 */
export function studioSkin(): string {
  return `${themeCss()}${SHARED_RULES}${PAGE_RULES}${EDITOR_RULES}`;
}
