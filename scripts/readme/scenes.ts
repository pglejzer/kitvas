// The takes of the README's media, played on a real studio. They are written for one draft: a revenue
// overview named `revenue-overview`, built from the kitvas UI kit, with the controls "Group by" and
// "Range", an "Export CSV" button and an option `theme` whose values are `dark` and `dark-teal`.
// Another draft needs scenes of its own. Every number a caption shows is read from the page or from
// the draft's files.

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
  /** Runs a kitvas command in the copy of the project. */
  kitvas(args: string[]): Record<string, unknown>;
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
  gif?: { file: string; width: number; fps: number };
};

// The request in short. The GIF says that the wait for the build was left out.
const REQUEST = '/kitvas:compose a revenue overview with plans, accounts and a dark theme';

const draftUrl = (ctx: Ctx, query = 'width=1280'): string =>
  `${ctx.studio}/drafts/${ctx.slug}?${query}`;
const prototype = (ctx: Ctx): Locator => ctx.page.locator('iframe[data-frame="current"]');
const inside = (ctx: Ctx, inner: string): Target => ({ frame: prototype(ctx), inner });

function versions(draftDir: string): string[] {
  return readdirSync(draftDir)
    .filter((name) => /^v\d+$/.test(name))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    .map((name) => join(draftDir, name));
}

const SOURCES = [join('src', 'scss', 'sections'), join('src', 'tsx', 'sections')];

/** The lines of the latest version's own files, by file name. */
function sources(draftDir: string): Map<string, string[]> {
  const latest = versions(draftDir).at(-1) ?? draftDir;
  const found = new Map<string, string[]>();
  for (const folder of SOURCES) {
    for (const file of readdirSync(join(latest, folder))) {
      const text = readFileSync(join(latest, folder, file), 'utf8');
      found.set(
        file,
        text.split('\n').map((line) => line.trim()),
      );
    }
  }
  return found;
}

/**
 * A long line cut to what it adds after the start it shares with a line of the earlier file, from
 * the start of the word the change is in.
 */
function short(line: string, old: string[]): string {
  if (line.length <= 46) return line;
  let shared = 0;
  for (const other of old) {
    let at = 0;
    while (at < line.length && line[at] === other[at]) at += 1;
    shared = Math.max(shared, at);
  }
  const head = line.split(' ')[0] ?? '';
  const from = line.lastIndexOf(' ', shared) + 1;
  return from > head.length + 1 ? `${head} … ${line.slice(from)}` : line;
}

/** A line the take's edit added to the draft's own files since `before`, after its file's name. */
function written(draftDir: string, before: Map<string, string[]>): string {
  const added: string[] = [];
  for (const [file, now] of sources(draftDir)) {
    const old = before.get(file) ?? [];
    for (const line of now) {
      if (line && !old.includes(line)) added.push(`${file}   ${short(line, old)}`);
    }
  }
  const pick = added.find((line) => line.includes('--kit-')) ?? added[0] ?? '';
  return pick.length > 62 ? `${pick.slice(0, 61)}…` : pick;
}

async function open(ctx: Ctx, url: string, withPrototype = true): Promise<void> {
  await ctx.page.goto(url);
  await ctx.page.waitForLoadState('load');
  if (withPrototype) await prototype(ctx).waitFor({ state: 'visible' });
  await new Promise((done) => setTimeout(done, 1500));
}

async function intro(ctx: Ctx): Promise<Take> {
  const { stage } = ctx;
  await stage.card('You ask in Claude Code');
  const take = await startTake(ctx.page, ctx.filmDir);
  await stage.rest(700);
  await stage.write(REQUEST);
  await stage.rest(1100);
  return take;
}

/** "Later" says that the wait for the build was left out. */
async function built(ctx: Ctx): Promise<void> {
  const name = (await ctx.page.locator('[data-version-name]').first().textContent())?.trim();
  const version = name ?? 'The latest version';
  const start = `Later: ${version.charAt(0).toLowerCase()}${version.slice(1)}`;
  await ctx.stage.say(`${start} of the draft, built from the kitvas UI kit`);
}

const segment = (label: string): string => `.kit-segmented__face:has-text("${label}")`;

/** The prototype's own controls: the chart is drawn again, then the numbers change. */
async function live(ctx: Ctx): Promise<void> {
  const { stage } = ctx;
  await stage.move(inside(ctx, 'text=MRR over 12 weeks'));
  await stage.rest(900);
  await stage.say('A prototype that works: every control answers');
  await stage.click(inside(ctx, segment('Monthly')));
  await stage.rest(1100);
  await stage.click(inside(ctx, segment('90 days')));
  await stage.rest(1100);
}

/** The values of the option `theme`, one after the other, and back to the default one. */
async function themes(ctx: Ctx): Promise<void> {
  const { page, stage } = ctx;
  const value = (id: string): Locator =>
    page.locator(`[data-options-row] [data-option="theme"] [data-value="${id}"]`);
  const count = await page.locator('[data-option="theme"] [data-value]').count();
  await stage.say(`One version, ${count} themes of the kit`);
  for (const id of ['dark', 'dark-teal']) {
    await stage.click(value(id));
    await prototype(ctx).waitFor({ state: 'visible' });
    await stage.rest(1300);
  }
  const first = await page.locator('[data-option="theme"]').getAttribute('data-default');
  await stage.click(value(first ?? 'light'));
  await stage.rest(500);
}

/**
 * The page close up, set before the film starts: the right panel folds, and the zoom is the one at
 * which the card fills the canvas's width (Fit shows the whole card, and a wide page is small then).
 */
async function closeUp(ctx: Ctx): Promise<void> {
  const { page } = ctx;
  await page.locator('[data-fold="right"]').click();
  await page.waitForTimeout(600);
  const percent = await page.evaluate(() => {
    const room = document.querySelector('[data-canvas="scroll"]')?.clientWidth ?? 0;
    const card = document.querySelector('iframe[data-frame="current"]')?.clientWidth ?? 0;
    return card > 0 ? Math.min(100, Math.floor(((room - 64) / card) * 100)) : 100;
  });
  const level = page.locator('[data-dock="zoom"] input');
  await level.fill(String(percent));
  await level.press('Enter');
  await level.blur();
}

/** The right panel when it is folded: a press on its rail opens it. */
async function openPanel(ctx: Ctx): Promise<void> {
  const rail = ctx.page.locator('[data-rail="right"]');
  if (await rail.isVisible()) await ctx.stage.click(rail);
}

async function checks(ctx: Ctx): Promise<void> {
  const { page, stage } = ctx;
  await stage.click(page.locator('[data-bar-findings]'));
  await stage.rest(400);
  await openPanel(ctx);
  // The panel took room: Shift+1 fits the card to the canvas again. Nothing holds the focus
  // meanwhile, so the key draws no focus ring on the control pressed last.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press('Shift+Digit1');
  const passed = page.locator('[data-checks-passed]').first();
  const count = (await passed.textContent())?.match(/\d+/)?.[0] ?? '';
  const fix = await page.locator('[data-checks-filter="fix"]').getAttribute('data-count');
  const left = fix === '0' ? 'nothing to fix' : `${fix} to fix`;
  await stage.say(`Checked in a real browser: ${count} checks passed, ${left}`);
  await stage.move(passed);
  await stage.rest(2400);
}

async function phone(ctx: Ctx): Promise<void> {
  const { page, stage } = ctx;
  await stage.say('At phone width too');
  await stage.click(page.locator('a[data-dock-width="390"]'));
  await stage.rest(1500);
}

/** The value `solid` of a selected kit component's prop `variant`, in the Properties panel. */
const SOLID = '[data-edit="props"] [data-row="prop:variant"] [data-control="opt-solid"]';

/** A plain press on an element of the prototype, with no pointer drawn: for a screenshot. */
async function press(ctx: Ctx, inner: string): Promise<void> {
  const at = await ctx.stage.point(inside(ctx, inner));
  await ctx.page.mouse.click(at.x, at.y);
  await ctx.stage.rest(900);
}

/** In the phone's card an edit applies to all widths, so a kit component's props can be set. */
async function edit(ctx: Ctx): Promise<void> {
  const { page, stage } = ctx;
  await stage.say("Edit on the canvas: the kit's own props and tokens");
  await stage.click(page.locator('[data-shell-mode="edit"]'));
  await stage.rest(1000);
  await stage.click(inside(ctx, 'button:has-text("Export CSV")'));
  await stage.rest(900);
  await openPanel(ctx);
  await stage.click(page.locator(SOLID));
  await stage.rest(1500);
}

async function changes(ctx: Ctx, before: Map<string, string[]>): Promise<void> {
  const { page, stage } = ctx;
  await stage.click(page.locator('[data-tab="changes"]'));
  await stage.say("Written into the draft's own files", written(ctx.draftDir, before));
  await stage.rest(2800);
}

const demo: Spec = {
  view: { width: 1280, height: 800, scale: 1 },
  unit: 0.9,
  pace: 0.8,
  gif: { file: 'demo.gif', width: 1000, fps: 20 },
  async run(ctx) {
    await open(ctx, draftUrl(ctx));
    await closeUp(ctx);
    const take = await intro(ctx);
    await ctx.stage.card(null);
    await built(ctx);
    await live(ctx);
    await themes(ctx);
    await checks(ctx);
    await phone(ctx);
    const before = sources(ctx.draftDir);
    await edit(ctx);
    await changes(ctx, before);
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
    // What the check left to look at, marked on the page.
    await open(ctx, draftUrl(ctx));
    await page.locator('[data-bar-findings]').click();
    await page.locator('[data-lens-set="checks"]').click();
    await stage.rest(900);
    await shot('checks.png');
    await open(ctx, draftUrl(ctx));
    await page.locator('[data-shell-mode="edit"]').click();
    await stage.rest(1000);
    await press(ctx, 'button:has-text("Export CSV")');
    await shot('editor.png');
    // The prototype alone, as the page it is.
    const built = join(
      versions(ctx.draftDir).at(-1) ?? ctx.draftDir,
      'build',
      'html',
      'index.html',
    );
    const alone = await page.context().newPage();
    await alone.setViewportSize({ width: 1280, height: 800 });
    await alone.goto(pathToFileURL(built).href);
    await alone.waitForTimeout(900);
    await alone.screenshot({ path: join(ctx.outDir, 'draft.png'), fullPage: true });
    await alone.close();
    // A second version, made here: one prop set in the phone's card, then "Save version".
    // The page remembers Edit for the session, so it opens in it.
    await open(ctx, draftUrl(ctx, 'width=390'));
    await stage.rest(1000);
    await press(ctx, 'button:has-text("Export CSV")');
    await page.locator(SOLID).click();
    await stage.rest(2500);
    await page.locator('button[data-edit-save]').click();
    await stage.rest(2500);
    // The new version is checked as any other, and the two pages get the canvas to themselves.
    ctx.kitvas(['check', ctx.slug]);
    await open(ctx, draftUrl(ctx, 'width=1280&compare=1'));
    await page.locator('[data-fold="right"]').click();
    await stage.rest(1200);
    await shot('versions.png');
    return null;
  },
};

export const TAKES: Record<string, Spec> = { demo, shots };
