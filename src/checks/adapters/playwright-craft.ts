// The `craft` pass of a visit to a craft board (ADR 0045). Every svg of a sketch block
// (`[data-craft-sketch]`) and of a kit icon (`[data-kit-icon]`) is measured in the page
// (`playwright-craft-svg.ts`): viewBox, stroke in viewBox units, fill, caps and fixed colours.
// Each sketch is drawn again at 16 px, a logo also at 32 px, and its thinnest painted line is read
// from the pixels (`playwright-craft-thin.ts`). A logo's lowest contrast on the board's light and
// dark grounds comes from the colours it paints. The page is left as it was found.
//
// The functions passed to `page.evaluate` use nothing from this module.

import type { CraftFacts, SvgFacts } from '../domain/craft-facts.ts';
import { contrast } from '../domain/rules/colour.ts';
import { type CraftWindow, READ_INPUT, readSvgs, type SvgRead } from './playwright-craft-svg.ts';
import { CLONES_ID, type Thin, thinAt } from './playwright-craft-thin.ts';

type Page = import('playwright-core').Page;

/** The sizes of SvgFacts' thinnestPx16 and thinnestPx32. */
const ICON_PX = 16;
const LOGO_PX = 32;
const WHITE = '#ffffffff';
const BLACK = '#000000ff';

/** Runs in the page: the clones and the list of svgs are gone. */
function forget(id: string): void {
  document.getElementById(id)?.remove();
  (window as unknown as CraftWindow).__KITVAS_CRAFT__ = undefined;
}

/** Runs in the page: the board's subject (`data-craft-subject`), else what its marks show. */
function readSubject(): string {
  const marked = document.querySelector('[data-craft-subject]')?.getAttribute('data-craft-subject');
  if (marked) return marked;
  if (document.querySelector('[data-kit-icon]') !== null) return 'icon';
  if (document.querySelector('[data-craft-tone]') !== null) return 'logo';
  return 'component';
}

/** The subject of the board on the page; `''` when the page cannot tell. */
export function boardSubject(page: Page): Promise<string> {
  return page.evaluate(readSubject).catch(() => '');
}

/** One group per sketch or kit icon and look: the same drawing at other sizes and grounds is one. */
export function groupReads(reads: readonly SvgRead[]): SvgRead[][] {
  const groups = new Map<string, SvgRead[]>();
  for (const read of reads) {
    const key = JSON.stringify([
      read.sketch,
      read.icon,
      read.mono,
      read.viewBox,
      read.stroke,
      read.filled,
      read.caps,
      read.fixedColours,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), read]);
  }
  return [...groups.values()];
}

/** The member drawn nearest to `size`: a sketch may draw less detail when it is small. */
export function nearest(group: readonly SvgRead[], size: number): SvgRead | undefined {
  let best: SvgRead | undefined;
  for (const read of group) {
    if (best === undefined || Math.abs(read.size - size) < Math.abs(best.size - size)) best = read;
  }
  return best;
}

/** A group's facts, with the thinness measured for it; none for an empty group. */
export function factsOf(
  group: readonly SvgRead[],
  thin16: number | null,
  thin32: number | null,
): SvgFacts[] {
  const first = group[0];
  if (first === undefined) return [];
  return [
    {
      sketch: first.sketch,
      node: first.node,
      viewBox: first.viewBox,
      stroke: first.stroke,
      filled: first.filled,
      caps: first.caps,
      fixedColours: first.fixedColours,
      thinnestPx16: thin16,
      thinnestPx32: thin32,
    },
  ];
}

/** A ground darker ink reads better on than white ink does. */
const isLight = (ground: string): boolean => contrast(ground, BLACK) >= contrast(ground, WHITE);
/** WCAG ratios are not rounded up. */
const floored = (ratio: number): number => Math.floor(ratio * 100) / 100;

/**
 * Per sketch, its lowest contrast on a light and on a dark ground. A rendering counts by its
 * lowest colour against its own ground, 1 when it paints nothing. On each kind of ground the best
 * rendering counts, so a logo passes by itself or through its tones. A sketch never drawn on one
 * kind of ground is held to the board's ground of that kind, or to white or black.
 */
export function logoContrast(reads: readonly SvgRead[]): CraftFacts['logoContrast'] {
  const sketches = reads.filter((read) => read.icon === null && read.sketch !== null);
  const boardGround = (light: boolean): string =>
    sketches.find((read) => isLight(read.ground) === light)?.ground ?? (light ? WHITE : BLACK);
  const lowest = (read: SvgRead, ground: string): number =>
    read.painted.length === 0 ? 1 : Math.min(...read.painted.map((ink) => contrast(ink, ground)));
  const letters = new Set(sketches.flatMap((read) => (read.sketch === null ? [] : [read.sketch])));
  return [...letters].map((sketch) => {
    const own = sketches.filter((read) => read.sketch === sketch);
    const best = (light: boolean): number => {
      const on = own.filter((read) => isLight(read.ground) === light);
      const ratios =
        on.length > 0
          ? on.map((read) => lowest(read, read.ground))
          : own.map((read) => lowest(read, boardGround(light)));
      return floored(Math.max(...ratios));
    };
    return { sketch, light: best(true), dark: best(false) };
  });
}

/**
 * The sketches with a mono variant, in letter order: an svg marked `data-craft-tone="mono"`, and
 * every such svg of the sketch painting one colour (its opacities aside).
 */
export function monoSketches(reads: readonly SvgRead[]): string[] {
  const marked = reads.filter((read) => read.mono && read.icon === null);
  const letters = new Set(marked.flatMap((read) => (read.sketch === null ? [] : [read.sketch])));
  return [...letters]
    .filter((sketch) =>
      marked
        .filter((read) => read.sketch === sketch)
        .every((read) => new Set(read.painted.map((ink) => ink.slice(0, 7))).size <= 1),
    )
    .sort();
}

/**
 * The craft pass: what the rules of `rules/craft.ts` read. Thinness is measured for icons and
 * logos, at 32 px for logos only, and contrast for logos only; a part that fails stays null. The
 * same sketch drawn at several sizes and on both grounds is one SvgFacts, and so is a kit icon.
 */
export async function craftPass(page: Page, input: { subject: string }): Promise<CraftFacts> {
  const { subject } = input;
  try {
    const reads = await page.evaluate(readSvgs, READ_INPUT);
    const sketchGroups = groupReads(reads.filter((read) => read.icon === null));
    const kitGroups = groupReads(reads.filter((read) => read.icon !== null));
    const pick = (size: number): number[] =>
      sketchGroups.flatMap((group) => {
        const read = nearest(group, size);
        return read === undefined ? [] : [read.at];
      });
    const drawn = subject === 'icon' || subject === 'logo';
    const thin16 = drawn ? await thinAt(page, pick(ICON_PX), ICON_PX).catch(() => null) : null;
    const thin32 =
      subject === 'logo' ? await thinAt(page, pick(LOGO_PX), LOGO_PX).catch(() => null) : null;
    const thinOf = (found: Thin | null, group: SvgRead[], size: number): number | null => {
      const read = nearest(group, size);
      return found === null || read === undefined ? null : (found.get(read.at) ?? null);
    };
    return {
      subject,
      sketches: sketchGroups.flatMap((group) =>
        factsOf(group, thinOf(thin16, group, ICON_PX), thinOf(thin32, group, LOGO_PX)),
      ),
      kit: kitGroups.flatMap((group) => factsOf(group, null, null)),
      logoContrast: subject === 'logo' ? logoContrast(reads) : [],
      mono: monoSketches(reads),
    };
  } finally {
    await page.evaluate(forget, CLONES_ID).catch(() => undefined);
  }
}
