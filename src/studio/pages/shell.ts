// The frame of every studio page: language, title, the skin on the response's nonce, the links.

import type { Translate } from '../../shared/index.ts';
import { type Html, html, trusted } from './html.ts';
import { pausedView } from './paused.ts';

export type PageFrame = {
  title: string;
  nonce: string;
  /** The studio's style sheet, from `studioSkin`. */
  skin: string;
  body: Html;
  /** The studio's links and paused view; `null` on a page shown before the cookie is set. */
  nav: { t: Translate; current: NavCurrent } | null;
  /**
   * `screen`: a full-window page with a bar of its own (the editor screen, plan 15). It drops the
   * studio's links, and `body.screen` keeps the window from scrolling. The paused view stays.
   */
  chrome?: 'page' | 'screen';
};

export type NavCurrent = 'drafts' | 'kit' | null;

function navBar(nav: { t: Translate; current: NavCurrent }): Html {
  const here = trusted(' aria-current="page"');
  const drafts = nav.current === 'drafts' ? here : '';
  const kit = nav.current === 'kit' ? here : '';
  return html`<header class="top"><a class="mark" href="/">kitvas</a><nav aria-label="${nav.t('studio.nav.label')}"><a class="opt" href="/"${drafts}>${nav.t('studio.nav.drafts')}</a><a class="opt" href="/kit"${kit}>${nav.t('studio.nav.kit')}</a></nav></header>`;
}

export function page(input: PageFrame): string {
  const screen = input.chrome === 'screen';
  const links = input.nav && !screen ? navBar(input.nav) : '';
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${input.title} - kitvas</title>
<link rel="icon" href="data:,">
<style nonce="${input.nonce}">${trusted(input.skin)}</style>
</head>
<body${screen ? trusted(' class="screen"') : ''}>
${links}
${input.body}
${input.nav ? pausedView(input.nav.t) : ''}
</body>
</html>
`.text;
}
