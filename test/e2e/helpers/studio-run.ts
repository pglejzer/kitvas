// The detached studio through the real CLI: start it, open it the way a browser does, stop it.

import assert from 'node:assert/strict';
import type { StudioCommandView } from '../../../src/cli/index.ts';
import { forceKill, isAlive } from '../../../src/studio/run/processes.ts';
import { kitvas, type Sandbox, statePids, studioLog } from './cli.ts';
import { call, cookieOf, poll } from './http.ts';

const STUDIO_MS = 60_000;
const QUICK_MS = 30_000;

export type StudioStart = Extract<StudioCommandView, { view: 'start' }>;
type StudioStop = Extract<StudioCommandView, { view: 'stop' }>;
type StudioStatus = Extract<StudioCommandView, { view: 'status' }>;

export type OpenStudio = { studio: StudioStart; cookie: string };

/** `kitvas studio <slug>`, then the one-time link a browser would open: the cookie it sets. */
export async function startStudio(box: Sandbox, slug: string): Promise<OpenStudio> {
  const studio = await kitvas<StudioStart>(box, ['studio', slug], STUDIO_MS);
  assert.equal(studio.view, 'start');
  assert.equal(studio.started, true);
  const opened = await call(studio.openUrl);
  assert.equal(opened.status, 303, `GET the open link: ${studioLog(box)}`);
  const cookie = cookieOf(opened);
  assert.match(cookie, new RegExp(`^kitvas_${studio.port}=[^;\\s]+$`));
  return { studio, cookie };
}

/** Stops the studio through the CLI and checks it is gone; by force only for what the CLI left. */
export async function stopStudio(box: Sandbox, studio: StudioStart | undefined): Promise<void> {
  let stopped = false;
  try {
    const stop = await kitvas<StudioStop>(box, ['studio', 'stop'], STUDIO_MS);
    assert.equal(stop.view, 'stop');
    if (studio) {
      assert.equal(stop.stopped, true);
      await poll(async () => (isAlive(studio.pid) ? undefined : true), 10_000).catch(() =>
        assert.fail(`the studio (pid ${studio.pid}) still runs after kitvas studio stop`),
      );
    }
    const status = await kitvas<StudioStatus>(box, ['studio', 'status'], QUICK_MS);
    assert.equal(status.running, false);
    stopped = true;
  } finally {
    if (!stopped) killLeftovers(box, studio);
  }
}

export function killLeftovers(box: Sandbox, studio: StudioStart | undefined): void {
  const pids = new Set([...(studio ? [studio.pid] : []), ...statePids(box)]);
  for (const pid of pids) if (isAlive(pid)) forceKill(pid);
}
