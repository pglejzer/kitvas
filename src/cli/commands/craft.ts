// `kitvas craft …`: start a craft draft (a component, icon or logo in three sketches), pick a sketch,
// add the final to the project's kit, or export its files.

import { resolve } from 'node:path';
import type { StartCraftInput, StartCraftResult } from '../../checks/index.ts';
import {
  CRAFT_SUBJECTS,
  type CraftSubject,
  type DraftStore,
  pickedFinal,
  pickSketch,
} from '../../drafts/index.ts';
import {
  addCraft,
  type CraftAdded,
  exportCraft,
  type KitStore,
  type KitWriter,
} from '../../kit/index.ts';
import { KitvasError, loadSettings, type Translate } from '../../shared/index.ts';
import { type Command, type CommandContext, defineCommand } from '../registry.ts';
import { openDrafts, slugAt } from './draft.ts';

export type CraftCommandDeps = {
  draftsAt(cwd: string): DraftStore;
  kits: KitStore;
  kitWriter: KitWriter;
  /** `craft new`: the checks module's startCraft, with its browser and address lookup. */
  start(project: string, input: StartCraftInput, t: Translate): Promise<StartCraftResult>;
};

export type CraftView =
  | ({ view: 'new' } & StartCraftResult)
  | { view: 'pick'; slug: string; picked: string; version: number }
  | ({ view: 'add' } & CraftAdded)
  | { view: 'export'; to: string; files: string[] };

const isSubject = (text: string): text is CraftSubject =>
  (CRAFT_SUBJECTS as readonly string[]).includes(text);

function renderView(data: CraftView, t: Translate): string {
  switch (data.view) {
    case 'new':
      return t('craft.new.created', { slug: data.draft.slug, path: data.path });
    case 'pick':
      return t('craft.pick.ok', { slug: data.slug, sketch: data.picked, version: data.version });
    case 'add':
      return t('craft.add.ok', { name: data.name, kit: data.kit, files: data.files.join(', ') });
    case 'export':
      return t('craft.export.ok', { files: data.files.join(', '), to: data.to });
  }
}

export function createCraftCommand(deps: CraftCommandDeps): Command {
  const usage = (ctx: CommandContext, key: string): KitvasError =>
    new KitvasError('USAGE', { detail: ctx.t(key) });
  const picked = (drafts: DraftStore) => (slug: string) => pickedFinal(drafts, slug);

  return defineCommand<CraftView>({
    name: 'craft',
    summary: 'command.craft.summary',
    async run(ctx) {
      const sub = ctx.positionals[0];
      const drafts = openDrafts({ draftsAt: deps.draftsAt, kits: deps.kits }, ctx);
      switch (sub) {
        case 'new': {
          const slug = slugAt(ctx, 1);
          const { subject, name, description } = ctx.flags;
          if (subject === undefined || !isSubject(subject)) throw usage(ctx, 'craft.usage.subject');
          if (name === undefined) throw usage(ctx, 'craft.usage.name');
          if (description === undefined) throw usage(ctx, 'craft.usage.description');
          const settings = loadSettings({ home: ctx.home, cwd: ctx.cwd });
          const result = await deps.start(
            ctx.cwd,
            {
              slug,
              title: ctx.flags.title ?? name,
              kit: ctx.flags.kit ?? settings.kit,
              subject,
              name,
              description,
              images: ctx.flags.image.map((file) => resolve(ctx.cwd, file)),
              url: ctx.flags.url[0],
              allowPrivate: ctx.flags.allowPrivate,
            },
            ctx.t,
          );
          return { view: 'new', ...result };
        }
        case 'pick': {
          const slug = slugAt(ctx, 1);
          const sketch = ctx.positionals[2];
          if (!sketch) throw usage(ctx, 'craft.usage.sketch');
          return { view: 'pick', ...pickSketch(drafts, slug, sketch) };
        }
        case 'add': {
          const slug = slugAt(ctx, 1);
          const added = addCraft(
            { writer: deps.kitWriter, picked: picked(drafts), t: ctx.t },
            slug,
            { replace: ctx.flags.replace, category: ctx.flags.category },
          );
          return { view: 'add', ...added };
        }
        case 'export': {
          const slug = slugAt(ctx, 1);
          if (ctx.flags.to === undefined) throw usage(ctx, 'craft.usage.to');
          const to = resolve(ctx.cwd, ctx.flags.to);
          const result = exportCraft(
            { writer: deps.kitWriter, picked: picked(drafts), t: ctx.t },
            slug,
            to,
          );
          return { view: 'export', to, ...result };
        }
        default:
          throw new KitvasError('USAGE', {
            detail: ctx.t('craft.usage.unknown', { name: sub ?? '' }),
          });
      }
    },
    render: renderView,
  });
}
