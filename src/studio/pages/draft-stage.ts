// The canvas of a draft page (plan 15): the framed version in a card, or two cards side by side
// when comparing, and the dock under them with the width, the state and the zoom.
//
// The cards sit in one "world" inside a scroller. The page script scales the world for the zoom
// and sizes the frames in place; a frame is never moved in the DOM, which would reload it.

import type { States } from '../../drafts/index.ts';
import type { Translate } from '../../shared/index.ts';
import { newChannel } from '../security/token.ts';
import { type DraftChoice, MAX_VIEW, MIN_VIEW, WIDTHS, type Width } from '../views/draft-query.ts';
import type { ChoiceLink } from './draft-links.ts';
import { withChannel } from './frame-channel.ts';
import { type Html, html } from './html.ts';

type FrameInput = {
  t: Translate;
  /** The frame address without the channel. */
  src: string;
  host: string;
  /** The width shown: a preset, or any other width from 320 to 2560. */
  width: number;
  title: string;
  role: 'current' | 'before';
};

/** The drag handle on the card's right edge; the page script works it. */
function handle(t: Translate, width: number): Html {
  return html`<div class="card-handle" data-canvas="handle" role="slider" tabindex="0" aria-orientation="horizontal" aria-label="${t('studio.edit.canvas.handle')}" aria-valuemin="${MIN_VIEW}" aria-valuemax="${MAX_VIEW}" aria-valuenow="${width}"></div>`;
}

/** Fresh channel ids on every render: they only tell the frames of one page apart. */
function frameBox(input: FrameInput): Html {
  const channel = newChannel();
  const src = withChannel(input.src, channel, input.host);
  const grip = input.role === 'current' ? handle(input.t, input.width) : '';
  return html`<div class="frame-box"><iframe src="${src}" width="${input.width}" sandbox="allow-scripts" referrerpolicy="no-referrer" title="${input.title}" data-frame="${input.role}" data-channel="${channel}"></iframe>${grip}</div>`;
}

export type StageInput = {
  t: Translate;
  host: string;
  width: Width;
  /** A width that is not a preset (`DraftChoice.view`); the cards show it instead of `width`. */
  view?: number | null;
  /** The page's title: the draft's name. */
  name: string;
  version: number;
  built: boolean;
  src: string;
  slug: string;
  /** The compared version, its frame address and whether it is built; null without compare. */
  compare: { version: number; built: boolean; src: string } | null;
  /** The pane of a rework's original (version 0), shown instead of a compared version. */
  original?: Html | null;
};

function summary(t: Translate): Html {
  return html`<p class="compare-summary" role="status" aria-live="polite" data-changed="${t('studio.compare.changed')}" data-added="${t('studio.compare.added')}" data-removed="${t('studio.compare.removed')}" data-same="${t('studio.compare.same')}"></p>`;
}

/**
 * One card: the caption above (the version on the left, the size on the right) and the frame.
 * The page script writes "W × H" into `[data-card-size]`; without it the width stays readable.
 */
function card(
  t: Translate,
  role: 'current' | 'before',
  version: number,
  width: number,
  box: Html,
): Html {
  const name = t('studio.draft.versionCaption', { version });
  const size = t('studio.draft.wide', { width });
  return html`<figure class="canvas-card pane" data-card="${role}"><figcaption class="card-caption"><span class="card-name">${name}</span><span class="card-size" data-card-size>${size}</span></figcaption>${box}</figure>`;
}

/** The scroller, the sizer the script gives the zoomed size, the world and the pan shield. */
function canvas(cards: Html | Html[]): Html {
  return html`<div class="canvas-scroll" data-canvas="scroll"><div class="canvas-sizer" data-canvas="sizer"><div class="canvas-world" data-canvas="world">${cards}</div><div class="canvas-shield" data-canvas="shield" hidden></div></div></div>`;
}

export function stage(input: StageInput): Html {
  const { t, compare } = input;
  if (!input.built) {
    return html`<p class="canvas-empty">${t('studio.page.notBuilt', { version: input.version, slug: input.slug })}</p>`;
  }
  const width = input.view ?? input.width;
  const base = { t, host: input.host, width };
  const named = t('studio.page.frame', { title: input.name });
  const titleOf = (version: number): string =>
    `${named}, ${t('studio.draft.versionCaption', { version })}`;
  if (input.original) {
    const title = titleOf(input.version);
    const box = frameBox({ ...base, src: input.src, title, role: 'current' });
    return canvas([input.original, card(t, 'current', input.version, width, box)]);
  }
  if (!compare) {
    const box = frameBox({ ...base, src: input.src, title: named, role: 'current' });
    return canvas(card(t, 'current', input.version, width, box));
  }
  const before = compare.built
    ? frameBox({ ...base, src: compare.src, title: titleOf(compare.version), role: 'before' })
    : html`<p class="canvas-empty">${t('studio.page.notBuilt', { version: compare.version, slug: input.slug })}</p>`;
  const current = frameBox({
    ...base,
    src: input.src,
    title: titleOf(input.version),
    role: 'current',
  });
  const cards = [
    card(t, 'before', compare.version, width, before),
    card(t, 'current', input.version, width, current),
  ];
  return html`${canvas(cards)}${compare.built ? summary(t) : ''}`;
}

/** What the canvas dock shows (plan 15, C3): the width, the state and the zoom of the view. */
export type DockInput = {
  t: Translate;
  choice: DraftChoice;
  states: States;
  /** Links to this view with one choice changed (`draft-links.ts`). */
  link: ChoiceLink;
};

/** A link built by `ChoiceLink` names no custom width; the state links keep the one shown. */
const withView = (href: string, view: number | undefined): string =>
  view === undefined ? href : `${href}&view=${view}`;

/** The presets as links; a click sets the frame's width in place when the script runs. */
function widthLinks({ t, choice, link }: DockInput): Html {
  const links = WIDTHS.map((width) => {
    const current = choice.view === undefined && width === choice.width;
    const mark = current ? html` aria-current="true"` : '';
    const name = t(`studio.width.${width}`);
    return html`<a class="opt" data-dock-width="${width}" href="${link({ width })}" title="${name}"${mark}>${width}</a>`;
  });
  return html`<nav class="dock-links" data-dock="widths" aria-label="${t('studio.draft.width')}">${links}</nav>`;
}

/**
 * Any width: a plain GET form, so it works without the script (Enter loads the view). With the
 * script the field sets the width in place.
 */
function widthField({ t, choice }: DockInput): Html {
  const compare =
    choice.compare === undefined
      ? ''
      : html`<input type="hidden" name="compare" value="${choice.compare}">`;
  const label = t('studio.edit.canvas.width');
  return html`<form class="dock-field" data-dock="view" method="get" action=""><input type="hidden" name="version" value="${choice.version}"><input type="hidden" name="state" value="${choice.state}"><input type="hidden" name="width" value="${choice.width}">${compare}<input type="number" name="view" data-dock-view min="${MIN_VIEW}" max="${MAX_VIEW}" step="1" inputmode="numeric" value="${choice.view ?? choice.width}" aria-label="${label}"><span aria-hidden="true">${t('studio.edit.canvas.px')}</span></form>`;
}

function stateLinks({ t, choice, states, link }: DockInput): Html {
  const links = states.states.map((state) => {
    const mark = state.id === choice.state ? html` aria-current="true"` : '';
    const href = withView(link({ state: state.id }), choice.view);
    return html`<a class="opt" data-state="${state.id}" href="${href}"${mark}>${state.label}</a>`;
  });
  return html`<nav class="dock-part dock-links" data-dock="states" aria-label="${t('studio.draft.state')}">${links}</nav>`;
}

/**
 * The dock at the bottom centre of the canvas: the width presets, any width, the state, and the
 * zoom strip (`div[data-dock="zoom"]`, filled by the page script). The note says that the checks'
 * marks are hidden at a width that is not a preset.
 */
export function dock(input: DockInput): Html | '' {
  const { t, choice } = input;
  const hidden = choice.view === undefined ? html` hidden` : '';
  const note = html`<p class="dock-note" data-dock-note role="status"${hidden}>${t('studio.edit.canvas.marksHidden')}</p>`;
  return html`<div class="editor-dock" data-shell="dock" role="group" aria-label="${t('studio.draft.controls')}"><div class="dock-part" data-dock="width">${widthLinks(input)}${widthField(input)}</div>${stateLinks(input)}<div class="dock-part" data-dock="zoom"></div>${note}</div>`;
}
