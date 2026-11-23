// `kitvas draft …`: create a draft, list drafts, show one, start its next version.

import {
  addVersion,
  createDraft,
  type Draft,
  type DraftListItem,
  type DraftStore,
  latestVersion,
  listDrafts,
  loadDraft,
} from '../../drafts/index.ts';
import { type KitStore, requireKit } from '../../kit/index.ts';
import { KitvasError, loadSettings, type Translate } from '../../shared/index.ts';
import { columns } from '../output/columns.ts';
import { type Command, type CommandContext, defineCommand } from '../registry.ts';

export type DraftDeps = { draftsAt(cwd: string): DraftStore; kits: KitStore };

export type DraftView =
  | { view: 'new'; draft: Draft; path: string }
  | { view: 'list'; drafts: DraftListItem[] }
  | { view: 'show'; draft: Draft }
  | { view: 'version'; slug: string; version: number };

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
  }
}

export function createDraftCommand(deps: DraftDeps): Command {
  return defineCommand<DraftView>({
    name: 'draft',
    summary: 'command.draft.summary',
    run(ctx) {
      const sub = ctx.positionals[0] ?? 'list';
      const drafts = openDrafts(deps, ctx);
      switch (sub) {
        case 'new': {
          const slug = slugAt(ctx, 1);
          const kitId = loadSettings({ home: ctx.home, cwd: ctx.cwd }).kit;
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
          return { view: 'list', drafts: listDrafts(drafts) };
        case 'show':
          return { view: 'show', draft: loadDraft(drafts, slugAt(ctx, 1)) };
        case 'version':
          return { view: 'version', ...addVersion(drafts, slugAt(ctx, 1), new Date()) };
        default:
          throw new KitvasError('USAGE', { detail: ctx.t('drafts.usage.unknown', { name: sub }) });
      }
    },
    render: renderView,
  });
}
