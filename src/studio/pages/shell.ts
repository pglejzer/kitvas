// The frame of every studio page: language, title, the view the person chose, the skin on the
// response's nonce, the icons, the bar with the logo, the studio's links and Claude's status, and
// the View popover.

import type { Translate, ViewSettings } from '../../shared/index.ts';
import { logo } from './brand/logo.ts';
import { type Html, html, trusted } from './html.ts';
import { iconSprite } from './icons/icon.ts';
import { pausedView } from './paused.ts';
import { type Skin, skinCss, skinView } from './skin.ts';
import { viewButton, viewPopover } from './view-settings.ts';

export type PageFrame = {
  title: string;
  nonce: string;
  /** The studio's style sheet, and the view the person chose (`skin.ts`). */
  skin: Skin;
  body: Html;
  /** The studio's links and paused view; `null` on a page shown before the cookie is set. */
  nav: { t: Translate; current: NavCurrent } | null;
  /**
   * `screen`: a full-window page with a bar of its own (the editor screen, plan 15). It drops the
   * studio's bar, and `body.screen` keeps the window from scrolling. Its own bar holds the View
   * button (`viewButton`); the popover and the paused view stay.
   */
  chrome?: 'page' | 'screen';
};

export type NavCurrent = 'drafts' | 'kit' | null;

/**
 * The logo of a bar, a link home: the full logo in a page's bar, the mark alone in the editor's.
 * Its pointer shows that Claude works (`data-claude`, `skin/logo.ts`).
 */
export function homeLink(t: Translate, kind: 'full' | 'mark'): Html {
  return html`<a class="k-logo-link" href="/">${logo(kind, { label: t('studio.nav.home'), working: true })}</a>`;
}

/**
 * Claude's status in a bar: empty until the page's script paints the dot and the words it finds
 * here (`client/studio/shell/bar-status.ts`). The page bar and the editor bar both use it.
 */
export function barStatusSlot(t: Translate): Html {
  return html`<span class="k-bar-status" data-bar-listening role="status" data-text-listening="${t('studio.edit.ai.bar.listening')}" data-text-working="${t('studio.edit.ai.bar.working')}"></span>`;
}

function navBar(nav: { t: Translate; current: NavCurrent }): Html {
  const here = trusted(' aria-current="page"');
  const drafts = nav.current === 'drafts' ? here : '';
  const kit = nav.current === 'kit' ? here : '';
  return html`<header class="k-bar"><div class="k-bar-start">${homeLink(nav.t, 'full')}<nav class="k-nav" aria-label="${nav.t('studio.nav.label')}"><a class="k-btn" href="/"${drafts}>${nav.t('studio.nav.drafts')}</a><a class="k-btn" href="/kit"${kit}>${nav.t('studio.nav.kit')}</a></nav></div><div class="k-bar-mid"></div><div class="k-bar-end">${barStatusSlot(nav.t)}${viewButton(nav.t)}</div></header>`;
}

/**
 * The view as attributes of `<html>`, which the theme's rules read (`theme/theme-css.ts`). No
 * `data-theme` means the system's choice. The values are the settings' own words, never text a
 * person typed.
 */
export function viewAttributes(view: ViewSettings): Html {
  const theme = view.theme === 'system' ? '' : ` data-theme="${view.theme}"`;
  return trusted(`${theme} data-panels="${view.panels}" data-accent="${view.accent}"`);
}

export function page(input: PageFrame): string {
  const screen = input.chrome === 'screen';
  const view = skinView(input.skin);
  const links = input.nav && !screen ? navBar(input.nav) : '';
  return html`<!doctype html>
<html lang="en"${viewAttributes(view)}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${input.title} - kitvas</title>
<link rel="icon" href="data:,">
<style nonce="${input.nonce}">${trusted(skinCss(input.skin))}</style>
</head>
<body${screen ? trusted(' class="screen"') : ''}>
${iconSprite()}
${links}
${input.body}
${input.nav ? viewPopover(input.nav.t, view) : ''}
${input.nav ? pausedView(input.nav.t) : ''}
</body>
</html>
`.text;
}
