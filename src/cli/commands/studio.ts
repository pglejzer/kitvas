// `kitvas studio [slug] [--open]`: start the project's studio when needed and print its address;
// `--open` also opens the one-time link in the default browser.
// `status` and `stop`; `serve` runs the servers themselves and is what the detached process runs.

import { realpathSync } from 'node:fs';
import { type DraftStore, isSlug, loadDraft } from '../../drafts/index.ts';
import { KitvasError, loadSettings, type Translate } from '../../shared/index.ts';
import {
  ensureStudio,
  type LifecycleDeps,
  openLink,
  type StudioState,
  stopStudio,
  studioStatus,
  studioUrl,
} from '../../studio/index.ts';
import { type Command, type CommandContext, defineCommand } from '../registry.ts';

export type StudioCommandDeps = {
  draftsAt(cwd: string): DraftStore;
  /** The lifecycle of the studio of `project`, a real path. */
  lifecycle(project: string): LifecycleDeps;
  /** Runs the studio of `project` until it is stopped. */
  serve(project: string, t: Translate): Promise<StudioState>;
  /**
   * Opens the one-time link in the person's default browser, `fallbackUrl` where the browser may
   * not resolve `kitvas.localhost`. True when a browser was started; never throws.
   */
  openBrowser(url: string, fallbackUrl: string): boolean;
};

export type StudioCommandView =
  | {
      view: 'start';
      started: boolean;
      /** `http://kitvas.localhost:<port>`: after the first visit it opens without a link. */
      url: string;
      port: number;
      pid: number;
      version: string;
      draftUrl: string | null;
      /** Opens the page in a browser once, within 60 s; the code works on one of the two links. */
      openUrl: string;
      /** The same code on `localhost`, for a browser without `kitvas.localhost`. */
      fallbackUrl: string;
      /** `--open` started a browser on the link. */
      opened: boolean;
    }
  | {
      view: 'status';
      running: boolean;
      url: string | null;
      pid: number | null;
      version: string | null;
    }
  | { view: 'stop'; stopped: boolean; pid: number | null }
  | { view: 'serve'; url: string };

const SUBCOMMANDS = ['start', 'status', 'stop', 'serve'];

function projectOf(ctx: CommandContext): string {
  const settings = loadSettings({ home: ctx.home, cwd: ctx.cwd });
  if (!settings.workspace.exists) throw new KitvasError('WORKSPACE_MISSING');
  return realpathSync.native(ctx.cwd);
}

/** `kitvas studio shop` and `kitvas studio start shop` both name a draft. */
function parse(ctx: CommandContext): { sub: string; slug: string | undefined } {
  const [first, second] = ctx.positionals;
  if (first !== undefined && SUBCOMMANDS.includes(first)) {
    return { sub: first, slug: first === 'start' ? second : undefined };
  }
  return { sub: 'start', slug: first };
}

async function start(
  deps: StudioCommandDeps,
  ctx: CommandContext,
  project: string,
  slug: string | undefined,
): Promise<StudioCommandView> {
  if (slug !== undefined) {
    if (!isSlug(slug)) {
      throw new KitvasError('USAGE', { detail: ctx.t('drafts.usage.slugInvalid', { name: slug }) });
    }
    loadDraft(deps.draftsAt(project), slug);
  }
  const lifecycle = deps.lifecycle(project);
  const studio = await ensureStudio(lifecycle);
  const link = await openLink(lifecycle, slug ? `/drafts/${slug}` : '/');
  // The browser opens only once the studio answers and the code exists, so it never lands on a
  // dead address.
  const opened = ctx.flags.open && deps.openBrowser(link.url, link.fallbackUrl);
  return {
    view: 'start',
    started: studio.started,
    url: studio.url,
    port: studio.port,
    pid: studio.pid,
    version: studio.version,
    draftUrl: slug ? `${studio.url}/drafts/${slug}` : null,
    openUrl: link.url,
    fallbackUrl: link.fallbackUrl,
    opened,
  };
}

function renderView(data: StudioCommandView, t: Translate): string {
  switch (data.view) {
    case 'start': {
      const head = t(data.started ? 'studio.cli.started' : 'studio.cli.running', { url: data.url });
      // The links are printed even after `--open`: the browser may not have been the right one.
      return [
        head,
        ...(data.opened ? [t('studio.cli.opened')] : []),
        t('studio.cli.open', { url: data.openUrl }),
        t('studio.cli.fallback', { url: data.fallbackUrl }),
        t('studio.cli.bookmark', { url: data.url }),
      ].join('\n');
    }
    case 'status':
      return data.running
        ? t('studio.cli.status', {
            url: data.url ?? '',
            version: data.version ?? '',
            pid: data.pid ?? 0,
          })
        : t('studio.cli.notRunning');
    case 'stop':
      return data.stopped
        ? t('studio.cli.stopped', { pid: data.pid ?? 0 })
        : t('studio.cli.notRunning');
    case 'serve':
      return t('studio.cli.served', { url: data.url });
  }
}

export function createStudioCommand(deps: StudioCommandDeps): Command {
  return defineCommand<StudioCommandView>({
    name: 'studio',
    summary: 'command.studio.summary',
    async run(ctx) {
      const { sub, slug } = parse(ctx);
      const project = projectOf(ctx);
      if (sub === 'serve') {
        const state = await deps.serve(project, ctx.t);
        return { view: 'serve', url: studioUrl(state.port) };
      }
      if (sub === 'status') {
        const found = await studioStatus(deps.lifecycle(project));
        return found
          ? {
              view: 'status',
              running: true,
              url: found.url,
              pid: found.pid,
              version: found.version,
            }
          : { view: 'status', running: false, url: null, pid: null, version: null };
      }
      if (sub === 'stop') {
        const stopped = await stopStudio(deps.lifecycle(project));
        return { view: 'stop', stopped: stopped !== undefined, pid: stopped?.pid ?? null };
      }
      return start(deps, ctx, project, slug);
    },
    render: renderView,
  });
}
