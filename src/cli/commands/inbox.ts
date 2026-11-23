// `kitvas inbox`: waits for notes people leave in the studio and prints them for Claude.

import { realpathSync } from 'node:fs';
import { KitvasError, loadSettings, type Translate } from '../../shared/index.ts';
import {
  type InboxItem,
  type InboxView,
  type LifecycleDeps,
  readInbox,
} from '../../studio/index.ts';
import { type Command, defineCommand } from '../registry.ts';

export type InboxCommandDeps = {
  /** The lifecycle of the studio of `project`, a real path. */
  lifecycle(project: string): LifecycleDeps;
};

export type InboxCommandView = InboxView;

/** Without --timeout the command waits 30 s, which fits a shell call's usual time limit. */
export const DEFAULT_WAIT_SECONDS = 30;
const SECONDS = /^[0-9]{1,3}$/;
const MAX_SECONDS = 600;

function secondsOf(value: string | undefined, t: Translate): number {
  if (value === undefined) return DEFAULT_WAIT_SECONDS;
  if (SECONDS.test(value) && Number(value) <= MAX_SECONDS) return Number(value);
  throw new KitvasError('USAGE', { detail: t('studio.cli.inbox.timeout') });
}

function line(item: InboxItem, t: Translate): string {
  if (item.slug === null) return t('studio.cli.inbox.general', { text: item.text });
  const place = item.element === null ? item.slug : `${item.slug} (${item.element})`;
  return t('studio.cli.inbox.note', { place, text: item.text });
}

export function createInboxCommand(deps: InboxCommandDeps): Command {
  return defineCommand<InboxCommandView>({
    name: 'inbox',
    summary: 'command.inbox.summary',
    async run(ctx) {
      const seconds = secondsOf(ctx.flags.timeout, ctx.t);
      if (!loadSettings({ home: ctx.home, cwd: ctx.cwd }).workspace.exists) {
        throw new KitvasError('WORKSPACE_MISSING');
      }
      return readInbox(deps.lifecycle(realpathSync.native(ctx.cwd)), seconds);
    },
    render: (view, t) => {
      if (!view.running) return t('studio.cli.notRunning');
      if (view.items.length === 0) return t('studio.cli.inbox.empty');
      return view.items.map((item) => line(item, t)).join('\n');
    },
  });
}
