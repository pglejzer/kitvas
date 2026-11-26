// The elements of one TSX file in one version of a draft (spec 4d, goal 5; plan 17, task D), for
// the timeline: each with its id, where it is written, and what the matching reads of it. A built
// version says where its elements are in `build/json/ids.json`; that is believed only while every
// entry still fits the text. Otherwise the text is compiled as the build would (`locate.ts`).

import { collapseSource, type DraftStore, versionFolder } from '../../../drafts/index.ts';
import { elementIds, readSites } from '../../../render/index.ts';
import { isRecord } from '../../../shared/index.ts';
import { type ElementFacts, wordsOf } from '../../domain/identity/match.ts';
import { elementSpan } from '../../domain/structure/subtree.ts';
import { offsetOf, openAt, openingTags, plainText } from '../../domain/tsx/tsx-reader.ts';
import type { Span } from '../../domain/types.ts';
import type { EditCompiler } from '../../ports/compiler.ts';

export type VersionDeps = { drafts: DraftStore; compiler: EditCompiler };

/** An element of a version's file: its facts, its `<` and its whole extent in the text. */
export type VersionElement = ElementFacts & { at: number; span: Span };

/** `built`: the elements were placed by the version's own build, not by a compile made now. */
export type VersionFile = { text: string; elements: VersionElement[]; built: boolean };

type Site = { id: string; tag: string; at: number };

/** An explicit `<Fragment>` is an opening tag, but the build gives it no id. */
const FRAGMENT = /^Fragment\d*$/;

/**
 * The file's elements as `ids.json` places them; `null` when the version has no build, or the
 * build is of another text (an entry points at no such tag, or an element has no entry).
 */
function builtSites(
  drafts: DraftStore,
  slug: string,
  version: number,
  file: string,
  text: string,
): Site[] | null {
  let raw: unknown;
  try {
    raw = drafts.readJson(slug, `${versionFolder(version)}/build/json/ids.json`);
  } catch {
    // Not JSON: the same as no build.
    return null;
  }
  if (!isRecord(raw) || !isRecord(raw.ids)) return null;
  const sites: Site[] = [];
  for (const [id, entry] of Object.entries(raw.ids)) {
    if (!isRecord(entry) || entry.file !== file) continue;
    const { line, column, tag } = entry;
    if (typeof line !== 'number' || typeof column !== 'number' || typeof tag !== 'string') {
      return null;
    }
    const at = offsetOf(text, line, column);
    if (at < 0 || openAt(text, at)?.name !== tag) return null;
    sites.push({ id, tag, at });
  }
  const written = openingTags(text).filter((at) => !FRAGMENT.test(openAt(text, at)?.name ?? ''));
  if (sites.length !== written.length) return null;
  return sites.sort((a, b) => a.at - b.at);
}

/** The file's elements from a compile of its text; none when it does not compile. */
async function compiledSites(compiler: EditCompiler, file: string, text: string): Promise<Site[]> {
  const code = await compiler.jsxDev(text, file);
  const sites = code === null ? undefined : readSites(code);
  if (sites === undefined) return [];
  return elementIds(file, sites).flatMap((entry): Site[] => {
    const at = offsetOf(text, entry.line, entry.column);
    return at >= 0 && text[at] === '<' ? [{ id: entry.id, tag: entry.tag, at }] : [];
  });
}

/** Each site with its extent and its facts; the words of an element hold those inside it. */
function elementsOf(text: string, sites: readonly Site[]): VersionElement[] {
  const read = sites.flatMap((site) => {
    const span = elementSpan(text, site.at);
    const open = openAt(text, site.at);
    if (span === null || open === null) return [];
    const own = wordsOf(plainText(text, open)?.value ?? '');
    return [{ site, span, own, props: open.attrs.map((attr) => attr.name) }];
  });
  return read.map(({ site, span, props }) => ({
    id: site.id,
    tag: site.tag,
    at: site.at,
    span,
    props,
    words: read
      .filter((each) => each.site.at >= span.start && each.site.at < span.end)
      .flatMap((each) => each.own),
    source: collapseSource(text.slice(span.start, span.end)),
  }));
}

/**
 * `file` (a path inside the version, `src/tsx/sections/Hero.tsx`) of `version`, with its
 * elements in source order; `null` when the version has no such file.
 */
export async function readVersionFile(
  deps: VersionDeps,
  slug: string,
  version: number,
  file: string,
): Promise<VersionFile | null> {
  const text = deps.drafts.readText(slug, `${versionFolder(version)}/${file}`);
  if (text === undefined) return null;
  const built = builtSites(deps.drafts, slug, version, file, text);
  const sites = built ?? (await compiledSites(deps.compiler, file, text));
  return { text, elements: elementsOf(text, sites), built: built !== null };
}
