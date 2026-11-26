// The canvas of a draft page (plan 15; plan 18, task A): the framed version in a card with its
// label above, or two cards side by side when comparing, and the pills that float over the canvas:
// the state and the width (with More: sizes, custom width, cards) in one row at the top right, zoom
// at the bottom right.
// Stage 4c (spec goal 4): beside the card of the width shown, more cards of the same version at
// other preset widths, each its own frame on its own channel.
//
// The cards sit in one "world" inside a scroller. The page script scales the world for the zoom
// and sizes the frames in place; a frame is never moved in the DOM, which would reload it.

import type { States } from '../../../drafts/index.ts';
import {
  type DraftOption,
  OPTION_PARAM,
  type OptionChoice,
  type Translate,
} from '../../../shared/index.ts';
import { newChannel } from '../../security/token.ts';
import {
  CARD_COUNTS,
  type CardCount,
  type DraftChoice,
  extraWidths,
  MAX_VIEW,
  MIN_VIEW,
  SIZES,
  type SizeGroup,
  WIDTHS,
  type Width,
} from '../../views/draft-query.ts';
import { type Html, html } from '../html.ts';
import { icon } from '../icons/icon.ts';
import type { IconName } from '../icons/paths.ts';
import { commandBox } from '../states/command.ts';
import type { ChoiceLink } from './draft-links.ts';
import { withChannel } from './frame-channel.ts';
import { optionsPill, optionsRow } from './options-row.ts';

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
  /** The draft's kit's breakpoints (`kitBreakpoints`): the sizes menu ticks these widths. */
  breakpoints: readonly number[];
  /** The version's options (`readOptions`); left out or empty: no Options pill and no row. */
  options?: readonly DraftOption[];
};

/** A link built by `ChoiceLink` names no custom width; the state links keep the one shown. */
const withView = (href: string, view: number | undefined): string =>
  view === undefined ? href : `${href}&view=${view}`;

/** Nor the cards: the pills' links keep more than one; compare has its own two. */
const withCards = (href: string, choice: DraftChoice, cards = choice.cards): string =>
  cards === undefined || cards === 1 || choice.compare !== undefined
    ? href
    : `${href}&cards=${cards}`;

const PRESET_ICONS = { 390: 'phone', 768: 'tablet', 1280: 'laptop' } as const satisfies Record<
  Width,
  IconName
>;
const SIZE_GROUPS: readonly SizeGroup[] = ['phone', 'tablet', 'desktop'];

/**
 * One row of the sizes in More: its name, then the width, with a tick after it where the kit has a
 * breakpoint. A row links a view; the script sets it in place (`data-dock-size`). The three presets
 * are buttons of the pill itself too: their rows show only while the pill is narrowed to the width
 * in use (`data-fit` 2 and 3 on the canvas; the skin).
 */
function sizeRow({ t, choice, link, breakpoints }: PillsInput, size: (typeof SIZES)[number]): Html {
  const preset = WIDTHS.find((width) => width === size.width);
  const current = (choice.view ?? choice.width) === size.width;
  const mark = current ? html` aria-current="true"` : '';
  const base = preset === undefined ? withView(link({}), size.width) : link({ width: preset });
  const href = withCards(base, choice);
  const kit = breakpoints.includes(size.width);
  const tick = kit ? html`<span class="pill-tick" aria-hidden="true"></span>` : '';
  const why = kit ? html` title="${t('studio.width.breakpoint')}"` : '';
  const name = t(`studio.width.size.${size.group}.${size.name}`);
  const kind = preset === undefined ? 'pill-size' : 'pill-size pill-preset';
  return html`<a class="k-menu-item ${kind}" data-dock-size="${size.width}" href="${href}"${why}${mark}><span>${name}</span><span class="k-meta pill-width">${size.width}${tick}</span></a>`;
}

/** A section's label in More, above its rows; the group's name is the label for a screen reader. */
const head = (label: string): Html =>
  html`<p class="k-meta pill-head" aria-hidden="true">${label}</p>`;

/** The sizes More lists, grouped by device. */
function sizeGroups(input: PillsInput): Html {
  const { t } = input;
  const groups = SIZE_GROUPS.map((group) => {
    const label = t(`studio.width.group.${group}`);
    const sizes = SIZES.filter((size) => size.group === group);
    const rows = sizes.map((size) => sizeRow(input, size));
    return html`<div class="pill-block" role="group" aria-label="${label}">${head(label)}${rows}</div>`;
  });
  return html`<div class="pill-set" data-dock="sizes">${groups}</div>`;
}

/**
 * How many cards (spec 4c, goal 4): links that work without the script, and "Every width", which
 * needs it (the script shows it). Off while comparing: compare has a card per version.
 */
function cardsBlock({ t, choice, link }: PillsInput): Html {
  const label = t('studio.edit.canvas.cards');
  if (choice.compare !== undefined) {
    const off = t('studio.edit.canvas.cardsOff');
    const items = CARD_COUNTS.map(
      (count) => html`<span class="k-btn pill-opt" aria-disabled="true">${count}</span>`,
    );
    return html`<div class="pill-block" data-dock="cards" role="group" aria-label="${label}" title="${off}" data-off>${head(label)}<div class="pill-count">${items}</div></div>`;
  }
  const shown = choice.cards ?? 1;
  const links = CARD_COUNTS.map((count) => {
    const mark = count === shown ? html` aria-current="true"` : '';
    const href = withCards(withView(link({}), choice.view), choice, count);
    const name = t(`studio.edit.canvas.cards.${count}`);
    return html`<a class="k-btn pill-opt" data-dock-cards="${count}" href="${href}" title="${name}"${mark}>${count}</a>`;
  });
  const every = html`<button type="button" class="k-menu-item" data-dock-every title="${t('studio.edit.canvas.everyTitle')}" hidden>${t('studio.edit.canvas.every')}</button>`;
  return html`<div class="pill-block" data-dock="cards" role="group" aria-label="${label}">${head(label)}<div class="pill-count">${links}</div>${every}</div>`;
}

/** The custom width: a field, in its own section of More. */
function customBlock(input: PillsInput): Html {
  const label = input.t('studio.edit.canvas.custom');
  return html`<div class="pill-block" role="group" aria-label="${label}">${head(label)}${widthField(input)}</div>`;
}

/**
 * "More": a menu of the other sizes, the custom width and the cards, in sections, so that it works
 * without the script (a `<details>`; `pill-menus.ts` gives it the keyboard).
 */
function moreMenu(input: PillsInput): Html {
  const { t } = input;
  return html`<details class="pill-menu pill-more" data-dock="more" data-pill-menu><summary class="k-btn" title="${t('studio.width.more')}"><span class="pill-word">${t('studio.edit.canvas.more')}</span>${icon('chevron-down')}</summary><div class="k-pop k-menu pill-sizes">${sizeGroups(input)}${customBlock(input)}${cardsBlock(input)}</div></details>`;
}

/**
 * The presets as links with a device icon and their number; a click sets the frame's width in place
 * when the script runs. A width that is not a preset is one more button, its number, pressed (the
 * script keeps it; hidden at a preset so the pill's markup is final on load).
 */
function widthLinks(input: PillsInput): Html {
  const { t, choice, link } = input;
  const links = WIDTHS.map((width) => {
    const current = choice.view === undefined && width === choice.width;
    const mark = current ? html` aria-current="true"` : '';
    const name = t(`studio.width.${width}`);
    const href = withCards(link({ width }), choice);
    return html`<a class="k-btn pill-opt" data-dock-width="${width}" href="${href}" title="${name}"${mark}>${icon(PRESET_ICONS[width])}<span>${width}</span></a>`;
  });
  const href = withCards(withView(link({}), choice.view), choice);
  const custom =
    choice.view === undefined
      ? html`<a class="k-btn pill-opt" data-dock-custom href="${href}" hidden></a>`
      : html`<a class="k-btn pill-opt" data-dock-custom href="${href}" aria-current="true">${choice.view}</a>`;
  return html`<nav class="pill-group" data-dock="widths" aria-label="${t('studio.draft.width')}">${links}${custom}</nav>`;
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
  const options = Object.entries(choice.options ?? {}).map(
    ([id, value]) =>
      html`<input type="hidden" name="${OPTION_PARAM}${id}" value="${value}" data-dock-option>`,
  );
  const label = t('studio.edit.canvas.width');
  return html`<form class="pill-field" data-dock="view" method="get" action=""><input type="hidden" name="version" value="${choice.version}"><input type="hidden" name="state" value="${choice.state}"><input type="hidden" name="width" value="${choice.width}">${compare}${cards}${options}<input class="k-field pill-number" type="number" name="view" data-dock-view min="${MIN_VIEW}" max="${MAX_VIEW}" step="1" inputmode="numeric" value="${choice.view ?? choice.width}" aria-label="${label}"><span aria-hidden="true">${t('studio.edit.canvas.px')}</span></form>`;
}

/**
 * The state pill: the name of the state shown with a chevron, and a menu of the draft's states
 * (links, so it works without the script). A draft with one state has nothing to choose: no pill.
 */
function statesPill({ t, choice, states, link }: PillsInput): Html {
  if (states.states.length < 2) return html``;
  const shown = states.states.find((state) => state.id === choice.state)?.label ?? choice.state;
  const label = t('studio.draft.state');
  const links = states.states.map((state) => {
    const current = state.id === choice.state;
    const mark = current ? html` aria-current="true"` : '';
    const tick = current ? icon('check') : '';
    const href = withCards(withView(link({ state: state.id }), choice.view), choice);
    return html`<a class="k-menu-item" data-state="${state.id}" href="${href}"${mark}><span>${state.label}</span>${tick}</a>`;
  });
  return html`<div class="k-pop k-pill"><details class="pill-menu pill-state" data-dock="states" data-pill-menu><summary class="k-btn" title="${label}"><span class="pill-state-name">${shown}</span>${icon('chevron-down')}</summary><div class="k-pop k-menu pill-sizes pill-states" role="group" aria-label="${label}">${links}</div></details></div>`;
}

/**
 * The pills over the canvas: one row at the top right, the state pill (when the draft has more than
 * one state), the Options pill (when the version has options; its row follows the pills,
 * `options-row.ts`), then the width pill, `390 | 768 | 1280 | More`; More holds the other sizes, the custom
 * width and the cards. At the end of the width pill a mark while the checks' marks are hidden, at a
 * width that is not a preset (its words on hover, as a toast on a press, and as a status). The top
 * left is the lens pill's (`canvasTools`); the row narrows itself when the room is short (the fit,
 * `client/studio/canvas/fit/`).
 */
export function pills(input: PillsInput): Html {
  const { t, choice, link } = input;
  // Options are the version's own: a compare of two versions shows none.
  const options = choice.compare === undefined ? (input.options ?? []) : [];
  const own = {
    t,
    options,
    differ: choice.options ?? {},
    hrefFor: (differ: OptionChoice): string =>
      withCards(withView(link({ options: differ }), choice.view), choice),
  };
  const hidden = choice.view === undefined ? html` hidden` : '';
  const said = t('studio.edit.canvas.marksHidden');
  const note = html`<button type="button" class="k-icon-btn pill-mark" data-dock-note aria-label="${said}" title="${said}"${hidden}>${icon('eye-off')}</button><span class="k-sr" role="status" data-dock-said>${choice.view === undefined ? '' : said}</span>`;
  const width = html`<div class="k-pop k-pill" data-dock="width">${widthLinks(input)}${moreMenu(input)}${note}</div>`;
  return html`<div class="pill-row" data-shell="dock" role="group" aria-label="${t('studio.edit.canvas.controls')}">${statesPill(input)}${optionsPill(own)}${width}</div>${optionsRow(own)}`;
}

/**
 * The hosts of the tools on the canvas (plan 19), empty: the page script fills them. The lens pill
 * at the top left, in Preview and in Edit; the bottom row, a grid of two (the ask bar, hidden until
 * Edit shows it, then the zoom pill, `div[data-dock="zoom"]`), so the ask bar narrows and never
 * goes under the zoom; and the place of the action bar and the variant pill, which follows the
 * selection.
 */
export function canvasTools(t: Translate): Html {
  const lens = html`<div class="k-pop k-pill pill-lens" data-lens-pill role="toolbar" aria-label="${t('studio.edit.lens.label')}"></div>`;
  const ask = html`<form class="k-pop ask-bar" data-ask-bar aria-label="${t('studio.edit.ask.label')}" hidden></form>`;
  const zoom = html`<div class="k-pop k-pill pill-zoom" data-dock="zoom" role="group" aria-label="${t('studio.edit.zoom.label')}"></div>`;
  const tools = html`<div class="sel-tools" data-sel-tools role="group" aria-label="${t('studio.edit.seltools.label')}"></div>`;
  return html`${lens}<div class="stage-foot">${ask}${zoom}</div>${tools}`;
}
