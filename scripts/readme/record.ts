// Records the README's GIF, film and screenshots from a real studio:
//
//   node scripts/readme/record.ts --project <folder with .kitvas> [--only demo,showcase,shots]
//     [--draft saas-analytics] [--out docs/readme] [--ffmpeg <program>] [--work <folder>]
//
// The project's `.kitvas` is copied for each take, so a take changes nothing in the project. The
// browser is the one kitvas checks with; ffmpeg must be on the machine (`--ffmpeg` names it when it
// is not on PATH). `scenes.ts` says which draft the takes are written for.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultDepRoots, loadDep } from '../../src/shared/deps/deps.ts';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { writeFilm, writeGif } from './capture.ts';
import { type Ctx, TAKES } from './scenes.ts';
import { createStage } from './stage.ts';

type Playwright = typeof import('playwright-core');
type Browser = import('playwright-core').Browser;

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    draft: { type: 'string', default: 'saas-analytics' },
    out: { type: 'string', default: join(PLUGIN_ROOT, 'docs', 'readme') },
    only: { type: 'string', default: Object.keys(TAKES).join(',') },
    ffmpeg: { type: 'string', default: 'ffmpeg' },
    work: { type: 'string', default: join(tmpdir(), 'kitvas-readme') },
  },
});

function kitvas(project: string, args: string[]): Record<string, unknown> {
  const program = [join(PLUGIN_ROOT, 'bin', 'kitvas.ts'), ...args, '--json'];
  const done = spawnSync(process.execPath, program, { cwd: project, encoding: 'utf8' });
  const answer = JSON.parse(done.stdout) as {
    ok: boolean;
    data?: Record<string, unknown>;
    error?: { message: string };
  };
  if (!answer.ok || !answer.data)
    throw new Error(answer.error?.message ?? `kitvas ${args.join(' ')} failed`);
  return answer.data;
}

function stopStudio(project: string): void {
  try {
    kitvas(project, ['studio', 'stop']);
  } catch {
    // No studio runs there, or the folder is not there yet.
  }
}

async function launch(): Promise<Browser> {
  const { chromium } = await loadDep<Playwright>('playwright-core', defaultDepRoots());
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      // Not installed here: try the next one.
    }
  }
  return chromium.launch({ headless: true });
}

async function main(): Promise<void> {
  if (!values.project)
    throw new Error('Name the project to record: --project <folder with .kitvas>');
  const source = join(resolve(values.project), '.kitvas');
  const copy = join(values.work, 'project');
  const out = resolve(values.out);
  const logoFile = join(PLUGIN_ROOT, 'docs', 'brand', 'kitvas-logo-white.svg');
  const logo = `data:image/svg+xml;base64,${readFileSync(logoFile).toString('base64')}`;
  mkdirSync(out, { recursive: true });
  const browser = await launch();
  try {
    for (const name of values.only.split(',')) {
      const spec = TAKES[name];
      if (!spec)
        throw new Error(`No take is named "${name}". There are: ${Object.keys(TAKES).join(', ')}`);
      // A copy for each take: a take edits the draft, and the next one starts from the same page.
      stopStudio(copy);
      rmSync(copy, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 });
      cpSync(source, join(copy, '.kitvas'), { recursive: true });
      const studio = kitvas(copy, ['studio', values.draft]);
      const { width, height, scale } = spec.view;
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: scale,
      });
      const page = await context.newPage();
      await page.goto(String(studio.openUrl));
      const ctx: Ctx = {
        page,
        stage: await createStage(page, { logo, unit: spec.unit }, spec.pace),
        studio: String(studio.url),
        slug: values.draft,
        draftDir: join(copy, '.kitvas', 'drafts', values.draft),
        outDir: out,
        filmDir: join(values.work, name),
      };
      const film = await spec.run(ctx);
      await context.close();
      if (film && spec.film) writeFilm(values.ffmpeg, film, join(out, spec.film.file), spec.film);
      if (film && spec.gif) writeGif(values.ffmpeg, film, join(out, spec.gif.file), spec.gif);
      const length = film ? `, ${film.seconds.toFixed(1)} s in ${film.pictures} pictures` : '';
      process.stdout.write(`${name}: done${length}\n`);
    }
  } finally {
    await browser.close();
    stopStudio(copy);
  }
}

await main();
