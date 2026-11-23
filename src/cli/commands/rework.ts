// `kitvas rework …`: start a better version of a page from its address, screenshots or a Figma
// frame (the original is captured into the draft's `before/`), and propose what it must keep.

import { resolve } from 'node:path';
import {
  type ProtectedItem,
  proposeProtected,
  type ReworkSourceInput,
  reworkBefore,
  type StartReworkInput,
  type StartReworkResult,
} from '../../checks/index.ts';
import type { DraftStore } from '../../drafts/index.ts';
import type { KitStore } from '../../kit/index.ts';
import { KitvasError, loadSettings, type Translate } from '../../shared/index.ts';
import { columns } from '../output/columns.ts';
import { type Command, type CommandContext, defineCommand } from '../registry.ts';
import { openDrafts, slugAt } from './draft.ts';

export type ReworkCommandDeps = {
  draftsAt(cwd: string): DraftStore;
  kits: KitStore;
  /** `rework new`: the checks module's startRework, with its browser, files and address lookup. */
  start(project: string, input: StartReworkInput, t: Translate): Promise<StartReworkResult>;
};

export type ReworkView =
  | ({ view: 'new' } & StartReworkResult)
  | { view: 'propose'; slug: string; items: ProtectedItem[] };

const usage = (ctx: CommandContext, key: string, params: Record<string, string> = {}) =>
  new KitvasError('USAGE', { detail: ctx.t(key, params) });

/** Exactly one source: one `--url`, one or more `--image`, or `--figma-image` with `--note`. */
function sourceOf(ctx: CommandContext): ReworkSourceInput {
  const { url, image, figmaImage, note, allowPrivate } = ctx.flags;
  const given = [url.length > 0, image.length > 0, figmaImage !== undefined].filter(Boolean);
  const [page] = url;
  if (given.length !== 1 || url.length > 1 || (figmaImage === undefined) !== (note === undefined)) {
    throw usage(ctx, 'rework.usage.source');
  }
  const at = (file: string): string => resolve(ctx.cwd, file);
  if (page !== undefined) return { type: 'url', url: page, allowPrivate };
  if (figmaImage !== undefined && note !== undefined) {
    return { type: 'figma', image: at(figmaImage), note: at(note) };
  }
  return { type: 'image', images: image.map(at) };
}

function renderView(data: ReworkView, t: Translate): string {
  switch (data.view) {
    case 'new': {
      const { before } = data;
      return [
        t('rework.new.created', { slug: data.draft.slug, path: data.path }),
        before.measured
          ? t('rework.new.measured', { inventory: before.inventory, problems: before.problems })
          : t('rework.new.read', { slug: data.draft.slug }),
      ].join('\n');
    }
    case 'propose':
      if (data.items.length === 0) return t('rework.propose.empty', { slug: data.slug });
      return [
        t('rework.propose.head', { slug: data.slug, count: data.items.length }),
        ...columns(data.items.map((item) => [`  ${item.id}`, item.kind, item.find])),
      ].join('\n');
  }
}

export function createReworkCommand(deps: ReworkCommandDeps): Command {
  return defineCommand<ReworkView>({
    name: 'rework',
    summary: 'command.rework.summary',
    async run(ctx) {
      const sub = ctx.positionals[0];
      const drafts = openDrafts({ draftsAt: deps.draftsAt, kits: deps.kits }, ctx);
      switch (sub) {
        case 'new': {
          const slug = slugAt(ctx, 1);
          const source = sourceOf(ctx);
          const kit = ctx.flags.kit ?? loadSettings({ home: ctx.home, cwd: ctx.cwd }).kit;
          const input = { slug, title: ctx.flags.title ?? slug, kit, source };
          return { view: 'new', ...(await deps.start(ctx.cwd, input, ctx.t)) };
        }
        case 'propose': {
          const slug = slugAt(ctx, 1);
          const { inventory } = reworkBefore(drafts, slug);
          return { view: 'propose', slug, items: proposeProtected(inventory) };
        }
        default:
          throw usage(ctx, 'rework.usage.unknown', { name: sub ?? '' });
      }
    },
    render: renderView,
  });
}
