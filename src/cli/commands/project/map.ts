// `kitvas map [slug]`: where everything is in the workspace, for agents.

import { idEntries, readChecks } from '../../../checks/index.ts';
import {
  type DraftMap,
  type DraftStore,
  type DraftsMap,
  draftMap,
  draftsMap,
  type MapChecked,
  type MapSources,
} from '../../../drafts/index.ts';
import type { Translate } from '../../../shared/index.ts';
import { columns } from '../../output/columns.ts';
import { type Command, defineCommand } from '../../registry.ts';
import { type DraftDeps, openDrafts } from '../draft/draft.ts';

export type MapView = DraftsMap | DraftMap;

function sourcesOf(store: DraftStore): MapSources {
  return {
    checked(slug, version) {
      const file = readChecks(store, slug, version);
      return file ? { fix: file.summary.fix, review: file.summary.review } : null;
    },
    elements: idEntries,
  };
}

function checkedText(checked: MapChecked | null, t: Translate): string {
  return checked ? t('map.checked', checked) : t('map.notChecked');
}

function renderView(data: MapView, t: Translate): string {
  if ('drafts' in data) {
    if (data.drafts.length === 0) return t('drafts.list.empty');
    return columns(
      data.drafts.map((draft) => [
        draft.slug,
        draft.title,
        t('drafts.list.version', { version: draft.version }),
        t(draft.built ? 'map.built' : 'map.notBuilt'),
        checkedText(draft.checked, t),
      ]),
    ).join('\n');
  }
  const head = t('map.head', {
    slug: data.slug,
    version: data.version,
    state: t(data.built ? 'map.built' : 'map.notBuilt'),
    checked: checkedText(data.checked, t),
  });
  const sections =
    data.sections.length === 0
      ? [t('map.noSections')]
      : columns(
          data.sections.map((section) => [
            section.id,
            section.files.length === 0 ? t('map.noFiles') : section.files.join(', '),
          ]),
        );
  return [head, ...sections, t('map.elements', { count: data.elements.length })].join('\n');
}

export function createMapCommand(deps: DraftDeps): Command {
  return defineCommand<MapView>({
    name: 'map',
    summary: 'command.map.summary',
    run(ctx) {
      const store = openDrafts(deps, ctx);
      const slug = ctx.positionals[0];
      return slug === undefined
        ? draftsMap(store, sourcesOf(store))
        : draftMap(store, sourcesOf(store), slug);
    },
    render: renderView,
  });
}
