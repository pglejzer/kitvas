// `kitvas draft …`: create a draft, list drafts, show one, start its next version, delete one into
// the trash and bring it back or remove it for good (ADR 0064).

import {
  addVersion,
  createDraft,
  type DeletedDraft,
  type Draft,
  type DraftListItem,
  type DraftStore,
  latestVersion,
  listDeleted,
  listDrafts,
  loadDraft,
} from '../../drafts/index.ts';
import { type KitStore, requireKit } from '../../kit/index.ts';
import { KitvasError, loadSettings, type Translate } from '../../shared/index.ts';
import { columns } from '../output/columns.ts';
import { type Command, type CommandContext, defineCommand } from '../registry.ts';
import { deleteIn, purgeAllIn, purgeIn, restoreIn, type TrashStudio } from './draft-trash.ts';
import { projectKitId } from './project-kit.ts';

export type DraftDeps = {
  draftsAt(cwd: string): DraftStore;
  kits: KitStore;
  /** Where a running studio is reached; `delete`, `restore` and `purge` use it when one runs. */
  studio?: TrashStudio | undefined;
};

export type DraftView =
  | { view: 'new'; draft: Draft; path: string }
  | { view: 'list'; drafts: DraftListItem[] }
  | { view: 'show'; draft: Draft }
  | { view: 'version'; slug: string; version: number }
  | { view: 'delete'; deleted: DeletedDraft; path: string; restore: string }
  | { view: 'restore'; restored: DeletedDraft }
  | { view: 'deleted'; drafts: DeletedDraft[] }
  | { view: 'purge'; purged: DeletedDraft[] };

/** The command that brings a deleted draft back. */
const restoreCommand = (slug: string): string => `kitvas draft restore ${slug}`;

const deletedRow = (item: DeletedDraft, t: Translate): string[] => [
  item.slug,
  item.title,
  t('drafts.deleted.when', { at: item.deletedAt }),
];

/** The drafts of the project in `ctx.cwd`. Fails when the project has no workspace yet. */
export function openDrafts(deps: DraftDeps, ctx: CommandContext): DraftStore {
  const settings = loadSettings({ home: ctx.home, cwd: ctx.cwd });
  if (!settings.workspace.exists) throw new KitvasError('WORKSPACE_MISSING');
  return deps.draftsAt(ctx.cwd);
}

/** The positional at `index`, which must be a draft slug. */
export function slugAt(ctx: CommandContext, index: number): string {
  const slug = ctx.positionals[index];
  if (!slug) throw new KitvasError('USAGE', { detail: ctx.t('drafts.usage.slug') });
  return slug;
}

function renderView(data: DraftView, t: Translate): string {
  switch (data.view) {
    case 'new':
      return t('drafts.new.created', { slug: data.draft.slug, path: data.path });
    case 'list': {
      if (data.drafts.length === 0) return t('drafts.list.empty');
      return columns(
        data.drafts.map((draft) =>
          draft.valid
            ? [draft.slug, draft.title ?? '', t('drafts.list.version', { version: draft.version })]
            : [draft.slug, t('drafts.list.invalid')],
        ),
      ).join('\n');
    }
    case 'show': {
      const { draft } = data;
      return [
        t('drafts.show.title', { title: draft.title, slug: draft.slug }),
        t('drafts.show.kit', { kit: draft.kit.id, version: draft.kit.version }),
        t('drafts.show.versions', {
          count: draft.versions.length,
          latest: latestVersion(draft),
        }),
      ].join('\n');
    }
    case 'version':
      return t('drafts.version.created', { slug: data.slug, version: data.version });
    case 'delete':
      return [
        t('drafts.delete.done', { slug: data.deleted.slug, path: data.path }),
        t('drafts.delete.undo', { command: data.restore }),
      ].join('\n');
    case 'restore':
      return t('drafts.restore.done', { slug: data.restored.slug });
    case 'deleted':
      if (data.drafts.length === 0) return t('drafts.deleted.empty');
      return columns(data.drafts.map((item) => deletedRow(item, t))).join('\n');
    case 'purge':
      if (data.purged.length === 0) return t('drafts.purge.none');
      return [
        t('drafts.purge.done', { count: data.purged.length }),
        ...columns(data.purged.map((item) => deletedRow(item, t))),
      ].join('\n');
  }
}

export function createDraftCommand(deps: DraftDeps): Command {
  return defineCommand<DraftView>({
    name: 'draft',
    summary: 'command.draft.summary',
    async run(ctx) {
      const sub = ctx.positionals[0] ?? 'list';
      const drafts = openDrafts(deps, ctx);
      switch (sub) {
        case 'new': {
          const slug = slugAt(ctx, 1);
          const kitId = projectKitId(deps.kits, ctx);
          const { kit, hash } = requireKit(deps.kits, kitId);
          const draft = createDraft(drafts, {
            slug,
            title: ctx.flags.title ?? slug,
            kit: { id: kit.id, version: kit.version, hash },
            now: new Date(),
          });
          return { view: 'new', draft, path: drafts.dir(slug) };
        }
        case 'list':
          if (ctx.flags.deleted) return { view: 'deleted', drafts: listDeleted(drafts) };
          return { view: 'list', drafts: listDrafts(drafts) };
        case 'show':
          return { view: 'show', draft: loadDraft(drafts, slugAt(ctx, 1)) };
        case 'version':
          return { view: 'version', ...addVersion(drafts, slugAt(ctx, 1), new Date()) };
        case 'delete': {
          const deleted = await deleteIn(deps.studio, ctx.cwd, drafts, slugAt(ctx, 1));
          return {
            view: 'delete',
            deleted,
            path: drafts.trash.dir(deleted.entry),
            restore: restoreCommand(deleted.slug),
          };
        }
        case 'restore':
          return {
            view: 'restore',
            restored: await restoreIn(deps.studio, ctx.cwd, drafts, slugAt(ctx, 1)),
          };
        case 'purge': {
          const slug = ctx.positionals[1];
          if (ctx.flags.all === (slug !== undefined)) {
            throw new KitvasError('USAGE', { detail: ctx.t('drafts.usage.purge') });
          }
          return {
            view: 'purge',
            purged:
              slug === undefined
                ? await purgeAllIn(deps.studio, ctx.cwd, drafts)
                : await purgeIn(deps.studio, ctx.cwd, drafts, slug),
          };
        }
        default:
          throw new KitvasError('USAGE', { detail: ctx.t('drafts.usage.unknown', { name: sub }) });
      }
    },
    render: renderView,
  });
}
