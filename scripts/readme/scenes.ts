// The takes of the README's media, played on a real studio. They are written for one draft: a revenue
// dashboard named `saas-analytics`, built from the Base kit, with the states `empty` and `loading`,
// the option `layout` (split, stacked) and at least two earlier versions. Another draft needs scenes
// of its own. Every number a caption shows is read from the page or from the draft's files.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Film, startTake, type Take } from './capture.ts';
import type { Stage, Target } from './stage.ts';

type Page = import('playwright-core').Page;
type Locator = import('playwright-core').Locator;

export type Ctx = {
  page: Page;
  stage: Stage;
  /** The studio's address, with no slash at its end. */
  studio: string;
  slug: string;
  /** The draft's folder in the copy of the project, which a take may change. */
  draftDir: string;
  outDir: string;
  /** Where this take keeps its pictures. */
  filmDir: string;
};

export type Spec = {
  view: { width: number; height: number; scale: number };
  /** The size of the pointer, the words and the cards: 1 suits a page 1600 px wide. */
  unit: number;
  /** Under 1 for a quicker take: it scales the waits, the glides and the typing. */
  pace: number;
  run(ctx: Ctx): Promise<Film | null>;
  film?: { file: string; width: number; height: number };
  gif?: { file: string; width: number; fps: number };
};

// The request in short. The draft on the screen is a later version of it, and the film says which.
const REQUEST = '/kitvas:compose a SaaS analytics dashboard with revenue, plans and accounts';
const TAGLINE = 'Build with your design system. Validate automatically. Edit visually.';
const INSTALL = [
  'claude plugin marketplace add pglejzer/kitvas',
  'claude plugin install kitvas@kitvas',
];

const draftUrl = (ctx: Ctx, query = 'width=1280'): string =>
  `${ctx.studio}/drafts/${ctx.slug}?${query}`;
const prototype = (ctx: Ctx): Locator => ctx.page.locator('iframe[data-frame="current"]');
const inside = (ctx: Ctx, inner: string): Target => ({ frame: prototype(ctx), inner });
const prop = (ctx: Ctx, control: string): Locator =>
  ctx.page.locator(`[data-edit="props"] [data-control="${control}"]`);

function versions(draftDir: string): string[] {
  return readdirSync(draftDir)
    .filter((name) => /^v\d+$/.test(name))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    .map((name) => join(draftDir, name));
}

function lines(file: string): string[] {
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.trim());
  } catch {
    return [];
  }
}

/** A long line cut to what it adds after the start it shares with a line of the earlier file. */
function short(line: string, old: string[]): string {
  if (line.length <= 46) return line;
  let shared = 0;
  for (const other of old) {
    let at = 0;
    while (at < line.length && line[at] === other[at]) at += 1;
    shared = Math.max(shared, at);
  }
  const head = line.split(' ')[0] ?? '';
  return shared > head.length ? `${head} … ${line.slice(shared).trim()}` : line;
}

/** A line the last edits added to the draft's own files, after its file's name: a kit token first. */
function written(draftDir: string): string {
  const [before, after] = versions(draftDir).slice(-2);
  if (!before || !after) return '';
  const added: string[] = [];
  for (const folder of [join('src', 'scss', 'sections'), join('src', 'tsx', 'sections')]) {
    for (const file of readdirSync(join(after, folder))) {
      const old = lines(join(before, folder, file));
      for (const line of lines(join(after, folder, file))) {
        if (line && !old.includes(line)) added.push(`${file}   ${short(line, old)}`);
      }
    }
  }
  const pick = added.find((line) => line.includes('--kit-')) ?? added[0] ?? '';
  return pick.length > 62 ? `${pick.slice(0, 61)}…` : pick;
}

async function ready(ctx: Ctx, withPrototype: boolean): Promise<void> {
  await ctx.page.waitForLoadState('load');
  if (withPrototype) await prototype(ctx).waitFor({ state: 'visible' });
  await new Promise((done) => setTimeout(done, 1500));
}

async function open(ctx: Ctx, url: string, withPrototype = true): Promise<void> {
  await ctx.page.goto(url);
  await ready(ctx, withPrototype);
}

/** Leaves a page load out of the film and draws the stage again on the new page. */
async function through(ctx: Ctx, take: Take, go: () => Promise<unknown>): Promise<void> {
  take.cut();
  await go();
  await ready(ctx, true);
  await ctx.stage.restore();
  await ctx.stage.rest(250);
  take.resume();
}

async function intro(ctx: Ctx): Promise<Take> {
  const { stage } = ctx;
  const label = 'You ask in Claude Code';
  await stage.card({ logo: true, title: '', label, lines: ['> '], typing: true, foot: '' });
  const take = await startTake(ctx.page, ctx.filmDir);
  await stage.rest(700);
  await stage.write(REQUEST);
  await stage.rest(1100);
  return take;
}

/** `later` says that the wait for the build was left out, where nothing before has said it. */
async function built(ctx: Ctx, later: boolean): Promise<void> {
  const name = (await ctx.page.locator('[data-version-name]').first().textContent())?.trim();
  const version = name ?? 'The latest version';
  const start = later ? `Later: ${version.charAt(0).toLowerCase()}${version.slice(1)}` : version;
  await ctx.stage.say(`${start} of the draft, built from the Base kit`);
}

async function look(ctx: Ctx): Promise<void> {
  const { stage } = ctx;
  await stage.move(inside(ctx, 'text=MRR over 12 weeks'));
  await stage.wheel(620, 1200);
  await stage.rest(900);
  await stage.wheel(-620, 1000);
  await stage.rest(300);
}

async function options(ctx: Ctx): Promise<void> {
  const { page, stage } = ctx;
  const value = (name: string): Locator =>
    page.locator(`[data-options-row] a[data-value="${name}"]`);
  if (!(await value('stacked').isVisible()))
    await stage.click(page.locator('[data-options-toggle]'));
  await stage.say('One version holds its alternatives');
  await stage.click(value('stacked'));
  await stage.rest(1800);
  await stage.click(value('split'));
  await stage.rest(900);
}

async function checks(ctx: Ctx): Promise<void> {
  const { page, stage } = ctx;
  await stage.click(page.locator('[data-bar-findings]'));
  await stage.rest(400);
  const passed = page.locator('[data-checks-passed]').first();
  const count = (await passed.textContent())?.match(/\d+/)?.[0] ?? '';
  await stage.say(`Checked in a real browser: ${count} checks passed, nothing to fix`);
  await stage.move(passed);
  await stage.rest(2400);
}

async function compare(ctx: Ctx, take: Take): Promise<void> {
  const { page, stage } = ctx;
  await stage.say('Any two versions, side by side');
  await stage.click(page.locator('[data-shell="compare"] summary'));
  await stage.rest(450);
  await stage.click(page.locator('[data-shell="compare"] a[href*="compare=1"]'));
  await through(ctx, take, () => page.waitForURL(/compare=1/));
  const summary = await page.locator('[data-compare-summary]').first().textContent();
  await stage.say(`Version 1 beside the latest: ${summary?.trim() ?? ''}`);
  await stage.rest(3000);
  await through(ctx, take, () => page.goto(draftUrl(ctx)));
}

async function phone(ctx: Ctx): Promise<void> {
  const { page, stage } = ctx;
  await stage.say('At phone width too');
  await stage.click(page.locator('a[data-dock-width="390"]'));
  await stage.rest(1500);
}

async function states(ctx: Ctx): Promise<void> {
  const { page, stage } = ctx;
  await stage.say('And in every state: no data yet, loading');
  for (const state of ['empty', 'loading', 'filled']) {
    await stage.click(page.locator('[data-dock="states"] summary'));
    await stage.rest(350);
    await stage.click(page.locator(`[data-dock="states"] a[data-state="${state}"]`));
    await stage.rest(state === 'filled' ? 500 : 1500);
  }
}

/** In the phone's card an edit applies to all widths, so a kit component's props can be set. */
async function edit(ctx: Ctx, alsoToken: boolean): Promise<void> {
  const { page, stage } = ctx;
  await stage.say("Edit on the canvas: the kit's own props and tokens");
  await stage.click(page.locator('[data-shell-mode="edit"]'));
  await stage.rest(1000);
  await stage.click(inside(ctx, 'button:has-text("Export CSV")'));
  await stage.rest(900);
  const outline = '[data-edit="props"] [data-row="prop:variant"] [data-control="opt-outline"]';
  await stage.click(page.locator(outline));
  await stage.rest(1700);
  if (!alsoToken) return;
  const full = prop(ctx, 'stop---kit-radius-full');
  await stage.move(page.locator('[data-edit="props"] h4[data-row="group:text"]'));
  const box = await full.boundingBox();
  const view = page.viewportSize();
  if (box && view && box.y > view.height - 190) {
    await stage.wheel(box.y - (view.height - 330), 800);
    await stage.rest(300);
  }
  await stage.click(full);
  await stage.rest(1700);
}

async function changes(ctx: Ctx): Promise<void> {
  const { page, stage } = ctx;
  await stage.click(page.locator('[data-tab="changes"]'));
  await stage.say("Written into the draft's own files", written(ctx.draftDir));
  await stage.rest(3200);
}

async function outro(ctx: Ctx): Promise<void> {
  const { page, stage } = ctx;
  const view = page.viewportSize() ?? { width: 1600, height: 900 };
  await stage.say('');
  await stage.move({ x: view.width + 60, y: view.height * 0.62 }, 520);
  const foot = 'github.com/pglejzer/kitvas';
  await stage.card(
    { logo: true, title: TAGLINE, label: '', lines: INSTALL, typing: false, foot },
    true,
  );
  await stage.rest(3600);
}

const showcase: Spec = {
  view: { width: 1600, height: 900, scale: 1.2 },
  unit: 1,
  pace: 0.85,
  film: { file: 'showcase.mp4', width: 1920, height: 1080 },
  async run(ctx) {
    const { page, stage } = ctx;
    await open(ctx, draftUrl(ctx));
    await stage.play('Watch the walk-through');
    await page.screenshot({ path: join(ctx.outDir, 'showcase-poster.png') });
    await stage.play('');
    await open(ctx, `${ctx.studio}/`, false);
    const take = await intro(ctx);
    await stage.card(null);
    await stage.say('Later (the wait for the build is cut), in the local studio');
    await stage.rest(2000);
    await stage.click(page.locator(`a[href*="/drafts/${ctx.slug}"]`).first());
    await through(ctx, take, () =>
      page.waitForURL(/\/drafts\//).then(() => page.goto(draftUrl(ctx))),
    );
    await built(ctx, false);
    await look(ctx);
    await options(ctx);
    await checks(ctx);
    await compare(ctx, take);
    await phone(ctx);
    await states(ctx);
    await edit(ctx, true);
    await changes(ctx);
    await outro(ctx);
    return take.stop();
  },
};

const demo: Spec = {
  view: { width: 1280, height: 800, scale: 1 },
  unit: 0.9,
  pace: 0.8,
  gif: { file: 'demo.gif', width: 1000, fps: 20 },
  async run(ctx) {
    await open(ctx, draftUrl(ctx));
    const take = await intro(ctx);
    await ctx.stage.card(null);
    await built(ctx, true);
    await look(ctx);
    await checks(ctx);
    await phone(ctx);
    await edit(ctx, false);
    await changes(ctx);
    return take.stop();
  },
};

const shots: Spec = {
  view: { width: 1440, height: 900, scale: 1 },
  unit: 1,
  pace: 1,
  async run(ctx) {
    const { page, stage } = ctx;
    const shot = (file: string): Promise<Buffer> =>
      page.screenshot({ path: join(ctx.outDir, file) });
    await open(ctx, `${ctx.studio}/`, false);
    await shot('start.png');
    // The first version still has its notes: the Checks tab with something in it, marked on the page.
    await open(ctx, draftUrl(ctx, 'version=1&width=1280'));
    await page.locator('[data-bar-findings]').click();
    await page.locator('[data-lens-set="checks"]').click();
    await stage.rest(900);
    await shot('checks.png');
    await open(ctx, draftUrl(ctx, 'width=1280&compare=1'));
    await shot('versions.png');
    await open(ctx, draftUrl(ctx));
    await page.locator('[data-shell-mode="edit"]').click();
    await stage.rest(1000);
    const button = await stage.point(inside(ctx, 'button:has-text("Export CSV")'));
    await page.mouse.click(button.x, button.y);
    await stage.rest(900);
    await shot('editor.png');
    // The prototype alone, as the page it is.
    const latest = versions(ctx.draftDir).at(-1) ?? ctx.draftDir;
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(pathToFileURL(join(latest, 'build', 'html', 'index.html')).href);
    await stage.rest(900);
    await page.screenshot({ path: join(ctx.outDir, 'draft.png'), fullPage: true });
    return null;
  },
};

export const TAKES: Record<string, Spec> = { demo, showcase, shots };
