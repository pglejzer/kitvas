// The stage of a recording, from Node: it moves the real pointer together with the drawn one, and
// says where on the page an element is, also one inside the prototype's scaled frame.

import { chance, handAim, handPath, handTime, type Point } from './hand.ts';
import { install, type StageSetup } from './stage-page.ts';

type Page = import('playwright-core').Page;
type Locator = import('playwright-core').Locator;

export type { Point };
/** A place on the page: a point, an element, or an element of the prototype inside its scaled frame. */
export type Target = Point | Locator | { frame: Locator; inner: string };

export type Stage = {
  point(target: Target): Promise<Point>;
  move(target: Target, ms?: number): Promise<void>;
  click(target: Target): Promise<void>;
  wheel(delta: number, ms: number): Promise<void>;
  say(text: string, code?: string): Promise<void>;
  /** The opening card with the logo, `label` and a line to type into; `null` fades it out. */
  card(label: string | null): Promise<void>;
  write(text: string, perLetter?: number): Promise<void>;
  rest(ms: number): Promise<void>;
};

const rest = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** `pace` scales the waits, the default glides and the typing: under 1 is quicker. */
export async function createStage(page: Page, setup: StageSetup, pace = 1): Promise<Stage> {
  await page.addInitScript(install, setup);
  const at: Point = { x: -80, y: -80 };
  // Every move and press takes its own numbers from here, the same ones in every take.
  let turn = 0;
  const next = (): number => {
    turn += 7;
    return turn;
  };

  const point = async (target: Target): Promise<Point> => {
    if ('x' in target) return target;
    const outer = 'inner' in target ? target.frame : target;
    const box = await outer.boundingBox();
    if (!box) throw new Error('The recording points at an element that is not on the page.');
    if (!('inner' in target)) {
      const off = handAim(box.width, box.height, next());
      return { x: box.x + box.width / 2 + off.x, y: box.y + box.height / 2 + off.y };
    }
    const handle = await target.frame.elementHandle();
    const frame = await handle?.contentFrame();
    if (!handle || !frame)
      throw new Error('The recording points into a frame that is not on the page.');
    const zoom = box.width / (await handle.evaluate((el) => (el as HTMLElement).offsetWidth));
    const inner = await frame
      .locator(target.inner)
      .first()
      .evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          w: rect.width,
          h: rect.height,
        };
      });
    const off = handAim(inner.w * zoom, inner.h * zoom, next());
    return { x: box.x + inner.x * zoom + off.x, y: box.y + inner.y * zoom + off.y };
  };

  const stage: Stage = {
    point,
    async move(target, ms) {
      const to = await point(target);
      const time = ms ?? pace * handTime(Math.hypot(to.x - at.x, to.y - at.y));
      const path = handPath(at, to, time, next());
      await page.evaluate(install, setup);
      const glide = page.evaluate(({ flat, t }) => window.kitvasStage?.glide(flat, t), {
        flat: path.flatMap((each) => [each.x, each.y]),
        t: time,
      });
      // The real pointer follows on the same way, so what it passes shows its hover.
      const start = Date.now();
      for (let index = 1; index < path.length; index += 2) {
        const each = path[index] ?? to;
        await page.mouse.move(each.x, each.y);
        await rest(Math.max(0, start + ((index + 1) * time) / path.length - Date.now()));
      }
      await page.mouse.move(to.x, to.y);
      await glide;
      at.x = to.x;
      at.y = to.y;
    },
    async click(target) {
      await stage.move(target);
      // A hand rests on what it found before it presses.
      await rest(110 + 90 * chance(next()));
      await page.evaluate(() => window.kitvasStage?.press());
      await page.mouse.down();
      await rest(60 + 40 * chance(next()));
      await page.mouse.up();
    },
    async wheel(delta, ms) {
      const steps = Math.max(1, Math.round(ms / 16));
      for (let step = 0; step < steps; step += 1) {
        const t = (step + 0.5) / steps;
        // More in the middle, less at both ends: the page starts and stops softly.
        await page.mouse.wheel(0, (delta / steps) * (1 - Math.cos(2 * Math.PI * t)));
        await rest(16);
      }
    },
    async say(text, code = '') {
      await page.evaluate(install, setup);
      await page.evaluate(({ value, under }) => window.kitvasStage?.say(value, under), {
        value: text,
        under: code,
      });
    },
    async card(label) {
      await page.evaluate(install, setup);
      await page.evaluate((value) => window.kitvasStage?.card(value), label);
    },
    async write(text, perLetter = 34) {
      await page.evaluate(({ value, each }) => window.kitvasStage?.write(value, each), {
        value: text,
        each: perLetter * pace,
      });
    },
    rest: (ms) => rest(ms * pace),
  };
  return stage;
}
