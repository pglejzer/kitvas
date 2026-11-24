// The thinness part of the `craft` pass (`playwright-craft.ts`): the svgs `readSvgs` left in the
// page are drawn again at one size in clones over the page, shot on white and on black, and the
// thinnest painted line of each is read from the pixels.
//
// The functions passed to `page.evaluate` use nothing from this module.

import type { Pixels } from '../../domain/kit/look-score.ts';
import { decodeIn } from '../images/playwright-images.ts';
import { type CraftWindow, PAINT_PROPS } from './playwright-craft-svg.ts';

type Page = import('playwright-core').Page;

/** How much of each pixel of a box is painted, 0 to 1, row by row. */
export type Grid = { width: number; height: number; cover: Float32Array };

/** x, y, width, height in image pixels. */
export type Box = [number, number, number, number];

/** The thinnest line, in device pixels, by the index of the svg in the page's list. */
export type Thin = Map<number, number | null>;

type Cell = { at: number; x: number; y: number };

/** The box the clones are drawn in, over the page, while the pass runs. */
export const CLONES_ID = 'kitvas-craft-clones';
/** CSS px of ground around each clone, so no two touch. */
const GAP = 8;
/** A pixel painted less than this is ground: anti-aliasing noise. */
const PAINT_MIN = 0.05;
/**
 * Rows (or columns) on each side whose crossings of the same stroke are compared: the end of a
 * line and the soft edge of a bar's end cross it short, and are not its width.
 */
const REACH = 2;

/** Runs in the page: two frames, so the page has painted what changed. */
function settle(): Promise<null> {
  return new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done(null))),
  );
}

/**
 * Runs in the page: the listed svgs drawn again at `size` px, each in its cell of a box fixed over
 * the page. Each element of a clone takes the paint it had on the board, whatever selectors gave
 * it. The box goes on the root element, so a transformed body cannot move it.
 */
function placeClones(input: {
  id: string;
  size: number;
  width: number;
  height: number;
  cells: Cell[];
  props: readonly string[];
}): number {
  const listed = (window as unknown as CraftWindow).__KITVAS_CRAFT__ ?? [];
  document.getElementById(input.id)?.remove();
  const holder = document.createElement('div');
  holder.id = input.id;
  holder.setAttribute('aria-hidden', 'true');
  const set = (element: HTMLElement | SVGElement, styles: Record<string, string>): void => {
    for (const [name, value] of Object.entries(styles)) {
      element.style.setProperty(name, value, 'important');
    }
  };
  set(holder, {
    position: 'fixed',
    left: '0',
    top: '0',
    margin: '0',
    padding: '0',
    border: '0',
    width: `${input.width}px`,
    height: `${input.height}px`,
    background: '#ffffff',
    'z-index': '2147483647',
    overflow: 'hidden',
    'pointer-events': 'none',
    isolation: 'isolate',
    transform: 'none',
    filter: 'none',
    opacity: '1',
  });
  let placed = 0;
  for (const cell of input.cells) {
    const original = listed[cell.at];
    if (original === undefined || !original.isConnected) continue;
    const clone = original.cloneNode(true);
    if (!(clone instanceof SVGSVGElement)) continue;
    const from = [original, ...Array.from(original.querySelectorAll('*'))];
    const to = [clone, ...Array.from(clone.querySelectorAll('*'))];
    from.forEach((element, index) => {
      const copy = to[index];
      if (!(copy instanceof SVGElement)) return;
      const style = getComputedStyle(element);
      for (const name of input.props) copy.style.setProperty(name, style.getPropertyValue(name));
    });
    set(clone, {
      position: 'absolute',
      left: `${cell.x}px`,
      top: `${cell.y}px`,
      width: `${input.size}px`,
      height: `${input.size}px`,
      display: 'block',
      margin: '0',
      padding: '0',
      border: '0',
      overflow: 'hidden',
      transform: 'none',
      'max-width': 'none',
      'max-height': 'none',
    });
    clone.setAttribute('width', String(input.size));
    clone.setAttribute('height', String(input.size));
    holder.append(clone);
    placed += 1;
  }
  document.documentElement.append(holder);
  return placed;
}

/** Runs in the page. */
function groundClones(input: { id: string; ground: string }): void {
  document.getElementById(input.id)?.style.setProperty('background', input.ground, 'important');
}

/** Runs in the page. */
function removeClones(id: string): void {
  document.getElementById(id)?.remove();
}

/** Runs in the page: the room the clones have, without the scroll bars. */
function roomOf(): { width: number; height: number } {
  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  };
}

/**
 * Coverage of each pixel of a box, from the same drawing on white and on black: a pixel that is
 * the same on both is fully painted, one that is white and black is ground. Null when the images
 * differ in size or the box is not inside them.
 */
export function coverage(white: Pixels, black: Pixels, box: Box): Grid | null {
  if (white.width !== black.width || white.height !== black.height) return null;
  const [x, y, width, height] = box;
  if (width < 1 || height < 1 || x < 0 || y < 0) return null;
  if (x + width > white.width || y + height > white.height) return null;
  const cover = new Float32Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const at = ((y + row) * white.width + x + column) * 4;
      let gap = 0;
      for (let channel = 0; channel < 3; channel += 1) {
        gap += (white.data[at + channel] ?? 0) - (black.data[at + channel] ?? 0);
      }
      cover[row * width + column] = Math.min(1, Math.max(0, 1 - gap / (3 * 255)));
    }
  }
  return { width, height, cover };
}

type Run = { from: number; to: number; sum: number };

/** The painted runs of each row, or of each column, with their summed coverage. */
function runsOf(grid: Grid, rows: boolean): Run[][] {
  const lines = rows ? grid.height : grid.width;
  const length = rows ? grid.width : grid.height;
  const all: Run[][] = [];
  for (let line = 0; line < lines; line += 1) {
    const runs: Run[] = [];
    let run: Run | null = null;
    for (let step = 0; step <= length; step += 1) {
      const index = rows ? line * grid.width + step : step * grid.width + line;
      const value = step < length ? (grid.cover[index] ?? 0) : 0;
      if (value >= PAINT_MIN) {
        run = run ?? { from: step, to: step, sum: 0 };
        run.to = step;
        run.sum += value;
      } else if (run !== null) {
        runs.push(run);
        run = null;
      }
    }
    all.push(runs);
  }
  return all;
}

/**
 * The thinnest painted line, in pixels. Each run of painted pixels across a row or a column is a
 * crossing of a stroke, as wide as its summed coverage. A crossing counts as the widest crossing
 * of the same stroke up to REACH lines away, so the end of a line or the soft edge of a bar is not
 * taken for its width. Two decimals; null when nothing is painted or the grid is malformed.
 */
export function thinnestLine(grid: Grid): number | null {
  if (grid.width < 1 || grid.height < 1 || grid.cover.length !== grid.width * grid.height) {
    return null;
  }
  let thinnest = Number.POSITIVE_INFINITY;
  for (const rows of [true, false]) {
    const lines = runsOf(grid, rows);
    for (let line = 0; line < lines.length; line += 1) {
      for (const run of lines[line] ?? []) {
        let widest = run.sum;
        for (let near = line - REACH; near <= line + REACH; near += 1) {
          for (const other of lines[near] ?? []) {
            if (other.from <= run.to && other.to >= run.from) widest = Math.max(widest, other.sum);
          }
        }
        thinnest = Math.min(thinnest, widest);
      }
    }
  }
  return Number.isFinite(thinnest) ? Math.round(thinnest * 100) / 100 : null;
}

/**
 * Each listed svg (by its index in the page's list) drawn at `size` px, shot on white and on
 * black: its thinnest line in device pixels. As many as fit the window are drawn; the rest, and
 * any whose shots cannot be read, have no entry. The clones are taken away; the list stays.
 */
export async function thinAt(page: Page, ats: readonly number[], size: number): Promise<Thin> {
  const found: Thin = new Map();
  if (ats.length === 0) return found;
  const room = await page.evaluate(roomOf);
  const cell = size + GAP;
  const columns = Math.max(1, Math.floor((room.width - GAP) / cell));
  const rows = Math.max(1, Math.floor((room.height - GAP) / cell));
  const shown = ats.slice(0, columns * rows);
  const cells: Cell[] = shown.map((at, index) => ({
    at,
    x: GAP + (index % columns) * cell,
    y: GAP + Math.floor(index / columns) * cell,
  }));
  const width = GAP + Math.min(shown.length, columns) * cell;
  const height = GAP + Math.ceil(shown.length / columns) * cell;
  try {
    const props = PAINT_PROPS;
    await page.evaluate(placeClones, { id: CLONES_ID, size, width, height, cells, props });
    const shoot = async (ground: string): Promise<Uint8Array> => {
      await page.evaluate(groundClones, { id: CLONES_ID, ground });
      await page.evaluate(settle);
      return page.screenshot({ clip: { x: 0, y: 0, width, height }, animations: 'disabled' });
    };
    const onWhite = await shoot('#ffffff');
    const onBlack = await shoot('#000000');
    const errors: string[] = [];
    const white = await decodeIn(page, onWhite, 'the clones on white', errors);
    const black = await decodeIn(page, onBlack, 'the clones on black', errors);
    if (white === undefined || black === undefined) return found;
    // Device pixels per CSS pixel.
    const scale = white.width / width;
    const device = (value: number): number => Math.round(value * scale);
    for (const { at, x, y } of cells) {
      const grid = coverage(white, black, [device(x), device(y), device(size), device(size)]);
      found.set(at, grid === null ? null : thinnestLine(grid));
    }
    return found;
  } finally {
    await page.evaluate(removeClones, CLONES_ID).catch(() => undefined);
  }
}
