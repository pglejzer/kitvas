// Addresses on the prototype origin: /f/<key>/<slug>/v<n>/<folder>/<file> for a version of a draft,
// /k/<key>/<kit id>/<folder>/<file> for the built examples of a kit.

import { isSlug } from '../../drafts/index.ts';
import { OPTION_PARAM, type OptionChoice } from '../../shared/index.ts';

/** The id pattern of `kit.json`. */
export const KIT_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

export type FramePath = { key: string; slug: string; version: number; relPath: string };

/** The parts of a draft's frame address, from its decoded path segments. */
export function parseFramePath(segments: readonly string[]): FramePath | undefined {
  const [prefix, key, slug, folder, ...rest] = segments;
  if (prefix !== 'f' || !key || !slug || !isSlug(slug)) return undefined;
  const version = /^v([1-9][0-9]{0,5})$/.exec(folder ?? '')?.[1];
  if (!version || rest.length < 2) return undefined;
  return { key, slug, version: Number(version), relPath: rest.join('/') };
}

export type CatalogPath = { key: string; kitId: string; relPath: string };

/** The parts of a kit catalog's frame address, from its decoded path segments. */
export function parseCatalogPath(segments: readonly string[]): CatalogPath | undefined {
  const [prefix, key, kitId, folder, ...rest] = segments;
  if (prefix !== 'k' || !key || !kitId || !KIT_ID.test(kitId)) return undefined;
  if (!folder || rest.length < 1) return undefined;
  return { key, kitId, relPath: [folder, ...rest].join('/') };
}

/** Either kind of address on the prototype origin; `undefined` for anything else. */
export type FrameAddress = ({ kind: 'draft' } & FramePath) | ({ kind: 'catalog' } & CatalogPath);

export function parseFrameAddress(segments: readonly string[]): FrameAddress | undefined {
  const draft = parseFramePath(segments);
  if (draft) return { kind: 'draft', ...draft };
  const catalog = parseCatalogPath(segments);
  return catalog ? { kind: 'catalog', ...catalog } : undefined;
}

export type FrameTarget = {
  hostname: string;
  port: number;
  key: string;
  slug: string;
  version: number;
  state: string;
  /** The values of the options that differ from the defaults (`opt-<id>=<value>`); none for none. */
  choice?: OptionChoice | undefined;
};

/** Where the studio frames a built version, opened in one state and with one choice. */
export function frameUrl(target: FrameTarget): string {
  const { hostname, port, key, slug, version, state, choice } = target;
  const page = `/f/${key}/${slug}/v${version}/html/index.html`;
  const options = Object.entries(choice ?? {}).map(
    ([id, value]) => `&${OPTION_PARAM}${encodeURIComponent(id)}=${encodeURIComponent(value)}`,
  );
  return `http://${hostname}:${port}${page}?state=${encodeURIComponent(state)}${options.join('')}`;
}

export type CatalogTarget = {
  hostname: string;
  port: number;
  key: string;
  kitId: string;
  /** `<Component>.<n>`, see `exampleKey`. */
  example: string;
};

/** A copied reference image of a kit's catalog (`build/img/refs/<file>`), on the prototype origin. */
export function catalogRefUrl(target: Omit<CatalogTarget, 'example'> & { file: string }): string {
  const { hostname, port, key, kitId, file } = target;
  return `http://${hostname}:${port}/k/${key}/${kitId}/img/refs/${encodeURIComponent(file)}`;
}

/**
 * A preview image of a kit for the editor's Insert pane (ADR 0075), on the prototype origin:
 * `previews/<set>/<file>` of the kit's catalog folder, `path` being that path below the folder.
 */
export function catalogPreviewUrl(
  target: Omit<CatalogTarget, 'example'> & { path: string },
): string {
  const { hostname, port, key, kitId, path } = target;
  const file = path.split('/').map(encodeURIComponent).join('/');
  return `http://${hostname}:${port}/k/${key}/${kitId}/${file}`;
}

/** Where the studio frames one built example of a kit. */
export function catalogFrameUrl(target: CatalogTarget): string {
  const { hostname, port, key, kitId, example } = target;
  const page = `/k/${key}/${kitId}/html/index.html`;
  return `http://${hostname}:${port}${page}?example=${encodeURIComponent(example)}`;
}
