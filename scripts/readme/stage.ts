// The stage of a recording, from Node: it moves the real pointer together with the drawn one, and
// says where on the page an element is, also one inside the prototype's scaled frame.

import { install, type StageSetup } from './stage-page.ts';

type Page = import('playwright-core').Page;
type Locator = import('playwright-core').Locator;

export type Point = { x: number; y: number };
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

  const point = async (target: Target): Promise<Point> => {
    if ('x' in target) return target;
    const outer = 'inner' in target ? target.frame : target;
    const box = await outer.boundingBox();
    if (!box) throw new Error('The recording points at an element that is not on the page.');
    if (!('inner' in target)) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
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
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
    return { x: box.x + inner.x * zoom, y: box.y + inner.y * zoom };
  };

  const stage: Stage = {
    point,
    async move(target, ms) {
      const to = await point(target);
      const time =
        ms ??
        pace * Math.min(Math.max(260 + Math.hypot(to.x - at.x, to.y - at.y) * 0.75, 380), 1050);
      await page.evaluate(install, setup);
      const glide = page.evaluate(({ x, y, t }) => window.kitvasStage?.glide(x, y, t), {
        ...to,
        t: time,
      });
      // The real pointer follows, so what it passes shows its hover.
      const steps = Math.max(2, Math.round(time / 45));
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        await page.mouse.move(at.x + (to.x - at.x) * eased, at.y + (to.y - at.y) * eased);
        await rest(time / steps);
      }
      await glide;
      at.x = to.x;
      at.y = to.y;
    },
    async click(target) {
      await stage.move(target);
      await rest(140);
      await page.evaluate(() => window.kitvasStage?.press());
      await page.mouse.down();
      await rest(70);
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
