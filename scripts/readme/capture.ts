// Records what a page shows as pictures with their times (the browser's own screencast), and turns a
// take into a GIF with ffmpeg. ffmpeg is the machine's own program, not a package.

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Page = import('playwright-core').Page;

export type Film = { dir: string; list: string; seconds: number; pictures: number };

export type Take = { stop(): Promise<Film> };

const LIST = 'pictures.txt';

export async function startTake(page: Page, dir: string): Promise<Take> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const session = await page.context().newCDPSession(page);
  const pictures: { file: string; at: number }[] = [];
  const now = (): number => Date.now() / 1000;
  let first: number | null = null;

  const keep = (data: Buffer, at: number): void => {
    const file = `p${String(pictures.length).padStart(6, '0')}.png`;
    writeFileSync(join(dir, file), data);
    pictures.push({ file, at: Math.max(at, pictures.at(-1)?.at ?? 0) });
  };

  session.on('Page.screencastFrame', (event) => {
    void session.send('Page.screencastFrameAck', { sessionId: event.sessionId });
    const stamp = event.metadata.timestamp ?? now();
    first ??= stamp;
    keep(Buffer.from(event.data, 'base64'), stamp - first);
  });
  await session.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });

  return {
    async stop(): Promise<Film> {
      await session.send('Page.stopScreencast');
      await session.detach();
      const seconds = first === null ? 0 : now() - first;
      const lines = ['ffconcat version 1.0'];
      pictures.forEach(({ file, at }, index) => {
        const until = pictures[index + 1]?.at ?? seconds;
        lines.push(`file '${file}'`, `duration ${Math.max(until - at, 0.001).toFixed(4)}`);
      });
      // The list's last picture needs naming twice, or ffmpeg drops its duration.
      const last = pictures.at(-1);
      if (last) lines.push(`file '${last.file}'`);
      writeFileSync(join(dir, LIST), `${lines.join('\n')}\n`);
      return { dir, list: join(dir, LIST), seconds, pictures: pictures.length };
    },
  };
}

function ffmpeg(program: string, args: string[]): void {
  const done = spawnSync(program, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    encoding: 'utf8',
  });
  if (done.error) throw done.error;
  if (done.status !== 0) throw new Error(`ffmpeg failed: ${done.stderr.trim()}`);
}

const source = (film: Film): string[] => ['-f', 'concat', '-safe', '0', '-i', film.list];
// The list names its last picture twice, and ffmpeg may show it twice as long: cut at the real end.
const length = (film: Film): string[] => ['-t', film.seconds.toFixed(3)];

/** A GIF with a palette of its own, so the interface keeps its colours at a small size. */
export function writeGif(
  program: string,
  film: Film,
  out: string,
  options: { width: number; fps: number },
): void {
  const scaled = `fps=${options.fps},scale=${options.width}:-2:flags=lanczos`;
  const palette = 'palettegen=max_colors=224:stats_mode=diff';
  const use = 'paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';
  ffmpeg(program, [
    ...source(film),
    '-vf',
    `${scaled},split[a][b];[a]${palette}[p];[b][p]${use}`,
    '-loop',
    '0',
    ...length(film),
    out,
  ]);
}
