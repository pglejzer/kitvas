// The canvas of a draft page (plan 15; plan 18, task A): the framed version in a card with its
// label above, or two cards side by side when comparing, and the pills that float over the canvas:
// width, cards and state at the top right, zoom at the bottom right.
// Stage 4c (spec goal 4): beside the card of the width shown, more cards of the same version at
// other preset widths, each its own frame on its own channel.
//
// The cards sit in one "world" inside a scroller. The page script scales the world for the zoom
// and sizes the frames in place; a frame is never moved in the DOM, which would reload it.

import type { States } from '../../../drafts/index.ts';
import type { Translate } from '../../../shared/index.ts';
import { newChannel } from '../../security/token.ts';
import {
  CARD_COUNTS,
  type CardCount,
  type DraftChoice,
  extraWidths,
  MAX_VIEW,
  MIN_VIEW,
  WIDTHS,
  type Width,
} from '../../views/draft-query.ts';
import { type Html, html } from '../html.ts';
import { icon } from '../icons/icon.ts';
import { commandBox } from '../states/command.ts';
import type { ChoiceLink } from './draft-links.ts';
import { withChannel } from './frame-channel.ts';

/**
 * The width a card's label names: "Desktop 1280" at a preset, "1000 px" at any other width. The
 * page script writes the same words (`cardSize` in `client/studio/canvas/caption.ts`).
 */
export function cardSize(t: Translate, width: number): string {
  const preset = WIDTHS.find((one) => one === width);
  if (preset === undefined) return t('studio.edit.canvas.size.custom', { width });
  return t('studio.edit.canvas.size.preset', { name: t(`studio.width.${preset}`), width });
}

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
  return html`<div class="card-frame"><iframe src="${src}" width="${input.width}" sandbox="allow-scripts" referrerpolicy="no-referrer" title="${input.title}" data-frame="${input.role}" data-channel="${channel}"></iframe>${grip}</div>`;
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
  /** The card of a rework's original (version 0), shown instead of a compared version. */
  original?: Html | null;
  /** Cards shown side by side (`DraftChoice.cards`); one without it, and always one to compare. */
  cards?: CardCount;
};

/** The compare sentence at the canvas's bottom centre; the page script writes it. */
function summary(t: Translate): Html {
  return html`<p class="k-pop cmp-summary" data-compare-summary role="status" aria-live="polite" data-changed="${t('studio.compare.changed')}" data-added="${t('studio.compare.added')}" data-removed="${t('studio.compare.removed')}" data-same="${t('studio.compare.same')}"></p>`;
}

/**
 * One card: its label above (the name, then the width it shows) and the frame. The name is the
 * draft's alone; beside another card, the version's, so the two are told apart.
 */
function card(
  t: Translate,
  role: 'current' | 'before',
  name: string,
  width: number,
  box: Html,
): Html {
  return html`<figure class="card-box" data-card="${role}"><figcaption class="card-caption"><span class="card-name">${name}</span><span class="card-size" data-card-size>${cardSize(t, width)}</span></figcaption>${box}</figure>`;
}

/**
 * A card at one more preset width (spec 4c, goal 4): a frame of the same version on a channel of
 * its own, without the width handle. The page script sizes it, marks the card edits go to, and
 * adds or removes such cards in place (`client/studio/canvas/cards.ts` writes the same markup).
 */
function widthCard(input: StageInput, width: Width): Html {
  const { t } = input;
  const channel = newChannel();
  const src = withChannel(input.src, channel, input.host);
  const title = `${t('studio.page.frame', { title: input.name })}, ${t('studio.draft.wide', { width })}`;
  const frame = html`<div class="card-frame"><iframe src="${src}" width="${width}" sandbox="allow-scripts" referrerpolicy="no-referrer" title="${title}" data-frame="width" data-channel="${channel}"></iframe></div>`;
  return html`<figure class="card-box" data-card="width" data-card-width="${width}"><figcaption class="card-caption"><span class="card-name">${input.name}</span><span class="card-size" data-card-size>${cardSize(t, width)}</span></figcaption>${frame}</figure>`;
}

/** The scroller, the sizer the script gives the zoomed size, the world and the pan shield. */
function canvas(cards: Html | Html[]): Html {
  return html`<div class="stage-scroll" data-canvas="scroll"><div class="stage-sizer" data-canvas="sizer"><div class="stage-world" data-canvas="world">${cards}</div><div class="stage-shield" data-canvas="shield" hidden></div></div></div>`;
}

/** A version that is not built: one sentence, and the command that builds it (spec goal 6). */
function notBuilt(t: Translate, version: number, slug: string, place: 'stage' | 'cmp'): Html {
  return html`<div class="k-empty ${place}-empty"><p>${t('studio.draft.notBuilt', { version })}</p>${commandBox(t, `kitvas build ${slug}`, { copy: true })}</div>`;
}

export function stage(input: StageInput): Html {
  const { t, compare } = input;
  if (!input.built) return notBuilt(t, input.version, input.slug, 'stage');
  const width = input.view ?? input.width;
  const base = { t, host: input.host, width };
  const named = t('studio.page.frame', { title: input.name });
  const caption = (version: number): string => t('studio.draft.versionCaption', { version });
  const titleOf = (version: number): string => `${named}, ${caption(version)}`;
  if (input.original) {
    const title = titleOf(input.version);
    const box = frameBox({ ...base, src: input.src, title, role: 'current' });
    return canvas([input.original, card(t, 'current', caption(input.version), width, box)]);
  }
  if (!compare) {
    const box = frameBox({ ...base, src: input.src, title: named, role: 'current' });
    const extra = extraWidths(input.cards ?? 1, width).map((one) => widthCard(input, one));
    return canvas([card(t, 'current', input.name, width, box), ...extra]);
  }
  const before = compare.built
    ? frameBox({ ...base, src: compare.src, title: titleOf(compare.version), role: 'before' })
    : html`<div class="card-frame">${notBuilt(t, compare.version, input.slug, 'cmp')}</div>`;
  const current = frameBox({
    ...base,
    src: input.src,
    title: titleOf(input.version),
    role: 'current',
  });
  const cards = [
    card(t, 'before', caption(compare.version), width, before),
    card(t, 'current', caption(input.version), width, current),
  ];
  return html`${canvas(cards)}${compare.built ? summary(t) : ''}`;
}

/** What the canvas's pills show (plan 15, C3): the width, the cards, the state and the zoom. */
export type PillsInput = {
  t: Translate;
  choice: DraftChoice;
  states: States;
  /** Links to this view with one choice changed (`draft-links.ts`). */
  link: ChoiceLink;
};

/** A link built by `ChoiceLink` names no custom width; the state links keep the one shown. */
const withView = (href: string, view: number | undefined): string =>
  view === undefined ? href : `${href}&view=${view}`;

/** Nor the cards: the pills' links keep more than one; compare has its own two. */
const withCards = (href: string, choice: DraftChoice, cards = choice.cards): string =>
  cards === undefined || cards === 1 || choice.compare !== undefined
    ? href
    : `${href}&cards=${cards}`;

/** The presets as links; a click sets the frame's width in place when the script runs. */
function widthLinks({ t, choice, link }: PillsInput): Html {
  const links = WIDTHS.map((width) => {
    const current = choice.view === undefined && width === choice.width;
    const mark = current ? html` aria-current="true"` : '';
    const name = t(`studio.width.${width}`);
    const href = withCards(link({ width }), choice);
    return html`<a class="k-btn pill-opt" data-dock-width="${width}" href="${href}" title="${name}"${mark}>${width}</a>`;
  });
  return html`<nav class="pill-group" data-dock="widths" aria-label="${t('studio.draft.width')}">${links}</nav>`;
}

/**
 * How many cards (spec 4c, goal 4): links that work without the script, and "Every width", which
 * needs it (the script shows it). Off while comparing: compare has a card per version.
 */
function cardsPill({ t, choice, link }: PillsInput): Html {
  const label = t('studio.edit.canvas.cards');
  const cap = html`<span class="pill-cap" aria-hidden="true">${label}</span>`;
  if (choice.compare !== undefined) {
    const off = t('studio.edit.canvas.cardsOff');
    const items = CARD_COUNTS.map(
      (count) => html`<span class="k-btn pill-opt" aria-disabled="true">${count}</span>`,
    );
    return html`<div class="k-pop k-pill" data-dock="cards" role="group" aria-label="${label}" title="${off}" data-off>${cap}${items}</div>`;
  }
  const shown = choice.cards ?? 1;
  const links = CARD_COUNTS.map((count) => {
    const mark = count === shown ? html` aria-current="true"` : '';
    const href = withCards(withView(link({}), choice.view), choice, count);
    const name = t(`studio.edit.canvas.cards.${count}`);
    return html`<a class="k-btn pill-opt" data-dock-cards="${count}" href="${href}" title="${name}"${mark}>${count}</a>`;
  });
  const every = html`<button type="button" class="k-btn pill-opt" data-dock-every title="${t('studio.edit.canvas.everyTitle')}" hidden>${t('studio.edit.canvas.every')}</button>`;
  return html`<div class="k-pop k-pill" data-dock="cards" role="group" aria-label="${label}">${cap}${links}${every}</div>`;
}

/**
 * Any width: a plain GET form, so it works without the script (Enter loads the view). With the
 * script the field sets the width in place.
 */
function widthField({ t, choice }: PillsInput): Html {
  const compare =
    choice.compare === undefined
      ? ''
      : html`<input type="hidden" name="compare" value="${choice.compare}">`;
  const cards =
    choice.cards === undefined || choice.cards === 1 || choice.compare !== undefined
      ? ''
      : html`<input type="hidden" name="cards" value="${choice.cards}">`;
  const label = t('studio.edit.canvas.width');
  return html`<form class="pill-field" data-dock="view" method="get" action=""><input type="hidden" name="version" value="${choice.version}"><input type="hidden" name="state" value="${choice.state}"><input type="hidden" name="width" value="${choice.width}">${compare}${cards}<input class="k-field pill-number" type="number" name="view" data-dock-view min="${MIN_VIEW}" max="${MAX_VIEW}" step="1" inputmode="numeric" value="${choice.view ?? choice.width}" aria-label="${label}"><span aria-hidden="true">${t('studio.edit.canvas.px')}</span></form>`;
}

function statesPill({ t, choice, states, link }: PillsInput): Html {
  const links = states.states.map((state) => {
    const mark = state.id === choice.state ? html` aria-current="true"` : '';
    const href = withCards(withView(link({ state: state.id }), choice.view), choice);
    return html`<a class="k-btn pill-opt" data-state="${state.id}" href="${href}"${mark}>${state.label}</a>`;
  });
  return html`<nav class="k-pop k-pill" data-dock="states" aria-label="${t('studio.draft.state')}">${links}</nav>`;
}

/**
 * The pills over the canvas: at the top right the width (presets and any width), the cards and
 * the state; at the end of the width pill a mark while the checks' marks are hidden, at a width
 * that is not a preset (its words on hover, as a toast on a press, and as a status); at
 * the bottom right the zoom (`div[data-dock="zoom"]`, filled by the page script). The top left and
 * the bottom centre stay free.
 */
export function pills(input: PillsInput): Html {
  const { t, choice } = input;
  const hidden = choice.view === undefined ? html` hidden` : '';
  const said = t('studio.edit.canvas.marksHidden');
  const note = html`<button type="button" class="k-icon-btn pill-mark" data-dock-note aria-label="${said}" title="${said}"${hidden}>${icon('eye-off')}</button><span class="k-sr" role="status" data-dock-said>${choice.view === undefined ? '' : said}</span>`;
  const width = html`<div class="k-pop k-pill" data-dock="width">${widthLinks(input)}<span class="k-sep" aria-hidden="true"></span>${widthField(input)}${note}</div>`;
  const row = html`<div class="pill-row" data-shell="dock" role="group" aria-label="${t('studio.edit.canvas.controls')}">${width}${cardsPill(input)}${statesPill(input)}</div>`;
  const zoom = html`<div class="k-pop k-pill pill-zoom" data-dock="zoom" role="group" aria-label="${t('studio.edit.zoom.label')}"></div>`;
  return html`${row}${zoom}`;
}
