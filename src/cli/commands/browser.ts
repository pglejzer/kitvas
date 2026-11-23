// `kitvas browser`: which browser runs the checks; `kitvas browser install` downloads Chromium.

import type { Browser, BrowserInstaller } from '../../checks/index.ts';
import { KitvasError } from '../../shared/index.ts';
import { type Command, defineCommand } from '../registry.ts';

export type BrowserDeps = {
  browser(): Browser;
  installer(): BrowserInstaller;
  /** Where `install` puts Chromium. */
  browsersDir: string;
};

export type BrowserView =
  | { view: 'status'; found: string | null; dir: string }
  | { view: 'install'; dir: string };

export function createBrowserCommand(deps: BrowserDeps): Command {
  return defineCommand<BrowserView>({
    name: 'browser',
    summary: 'command.browser.summary',
    async run(ctx) {
      const sub = ctx.positionals[0] ?? 'status';
      if (sub === 'install') return { view: 'install', dir: await deps.installer().install() };
      if (sub !== 'status') {
        throw new KitvasError('USAGE', { detail: ctx.t('browser.usage.unknown', { name: sub }) });
      }
      try {
        const session = await deps.browser().open();
        await session.close();
        return { view: 'status', found: session.name, dir: deps.browsersDir };
      } catch (error) {
        if (!(error instanceof KitvasError && error.code === 'BROWSER_MISSING')) throw error;
        return { view: 'status', found: null, dir: deps.browsersDir };
      }
    },
    render(data, t) {
      if (data.view === 'install') return t('browser.installed', { dir: data.dir });
      return data.found
        ? t('browser.found', { name: data.found })
        : t('browser.missing', { dir: data.dir });
    },
  });
}
