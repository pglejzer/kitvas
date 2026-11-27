// What the editor reads before the first edit (plan 13, task D2): the version it edits, the open
// session, whether styles can be written, the files' ETags and the kit's tokens.

import {
  type DraftStore,
  editSession,
  latestVersion,
  loadDraft,
  versionFolder,
} from '../../drafts/index.ts';
import {
  cssVarName,
  formatTokenValue,
  type KitComponent,
  type KitStore,
  type LoadedKit,
  loadKit,
} from '../../kit/index.ts';
import { KitvasError } from '../../shared/index.ts';
import { TOKEN_VAR } from '../domain/ops.ts';
import type { TokenOption } from '../domain/types.ts';
import { sourceFiles } from './structure/section-files.ts';

export type EditStateDeps = {
  drafts: DraftStore;
  kits: KitStore;
  /** The ETag of a file's text, as the studio's API writes it. */
  etag(text: string): string;
};

/** The same shape as the studio's `EditStateSchema` (`src/studio/api/edit/edit-schemas.ts`). */
export type EditStateView = {
  slug: string;
  version: number;
  session: { version: number; startedAt: string } | null;
  format: 'scss' | 'tailwind';
  etags: Record<string, string>;
  tokens: TokenOption[];
};

/**
 * The draft's kit with the project's additions, or `null` when it cannot be read. The editor still
 * edits props and text of a draft whose kit is gone; it only has no tokens and no catalog then.
 */
export function editKit(kits: KitStore, id: string): LoadedKit | null {
  try {
    return loadKit(kits, id);
  } catch (error) {
    if (error instanceof KitvasError) return null;
    throw error;
  }
}

/** The component names of a kit (the project's additions and the icon component included). */
export function kitNames(loaded: LoadedKit | null): ReadonlySet<string> {
  const names = new Set(loaded?.kit.components.map((component) => component.name) ?? []);
  const icons = loaded?.kit.icons;
  if (icons?.source === 'component') names.add(icons.component);
  return names;
}

/** `Card.Header` is the part `Header` of `Card`: the catalog entry is `Card`. */
export function catalogComponent(kit: LoadedKit | null, tag: string): KitComponent | null {
  const name = tag.split('.')[0] ?? tag;
  if (!/^[A-Z]/.test(name)) return null;
  return kit?.kit.components.find((component) => component.name === name) ?? null;
}

/** The kit's tokens as the pickers offer them: `--kit-space-12`, `space.12`, `12px`. */
export function tokenOptions(kit: LoadedKit | null): TokenOption[] {
  if (kit === null) return [];
  const added = new Set(kit.addedTokens);
  return (
    kit.tokens
      .map((token) => ({
        var: cssVarName(token.path),
        path: token.path.join('.'),
        type: token.type,
        css: formatTokenValue(token),
        added: added.has(token.path.join('.')),
      }))
      // A name too long for an edit operation could never be written, so it is not offered.
      .filter((option) => TOKEN_VAR.test(option.var))
  );
}

/** Tailwind drafts keep their styles in utility classes: read-only in 4a (spec decision 9). */
export const styleFormat = (kit: LoadedKit | null): 'scss' | 'tailwind' =>
  kit?.kit.runtime.styles.tailwind === undefined ? 'scss' : 'tailwind';

export function editState(deps: EditStateDeps, slug: string): EditStateView {
  const draft = loadDraft(deps.drafts, slug);
  const version = latestVersion(draft);
  const kit = editKit(deps.kits, draft.kit.id);
  const base = versionFolder(version);
  const etags: Record<string, string> = {};
  for (const file of sourceFiles(deps.drafts, slug, version)) {
    const text = deps.drafts.readText(slug, `${base}/${file}`);
    if (text !== undefined) etags[file] = deps.etag(text);
  }
  return {
    slug,
    version,
    session: editSession(draft),
    format: styleFormat(kit),
    etags,
    tokens: tokenOptions(kit),
  };
}
