// Use case: read a kit, check it against the contract and collect its problems.

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { KitvasError } from '../../shared/index.ts';
import { mergeAdditions, parseAdditions } from '../domain/additions.ts';
import { type Kit, parseKit } from '../domain/contract.ts';
import { readCssVarMap } from '../domain/css-vars.ts';
import { GENERATED_ENTRY } from '../domain/generated-entry.ts';
import type { KitIssue } from '../domain/issues.ts';
import { kitIssues } from '../domain/rules.ts';
import { isProjectKit, isWrittenKit, sourceIssues } from '../domain/sources.ts';
import { type FlatToken, flattenTokens } from '../domain/tokens.ts';
import type { KitStore } from '../ports/kit-store.ts';

export type LoadedKit = {
  /** The kit, with the project's additions after its own components. */
  kit: Kit;
  /** Absolute path of the kit folder. */
  dir: string;
  tokens: FlatToken[];
  issues: KitIssue[];
  /**
   * sha256 of kit.json, the token file and the cssVars map, and of the project's additions.json
   * when there is one: changes when the kit's data changes.
   */
  hash: string;
  /** From KitFiles.project: the project folder of a kit in `.kitvas/kits/`; undefined for built-in kits. */
  project: string | undefined;
  /** tokens.cssVars.map read from its file: token path with dots -> native variable; {} when none. */
  cssVarMap: Record<string, string>;
  /** Names of the components merged from the project's additions (C7), in catalog order. */
  additions: string[];
  /** Absolute path of the kit's additions folder in the project; undefined when it has none. */
  additionsDir: string | undefined;
  /**
   * Absolute path of the module `@kit` names in builds and checks: the kit's own entry, or for a
   * built-in kit with additions the `generated/kit.ts` kitvas writes in its additions folder.
   */
  entry: string;
};

const fileMissing = (path: string, file: string): KitIssue => ({
  path,
  key: 'kitIssue.fileMissing',
  params: { file },
});

/**
 * True when kitvas writes the kit's own `generated/kit.ts` (a kit of the project's `.kitvas/kits/`
 * with a source other than built-in), additions and all. Any other kit keeps its own entry, and
 * its additions get an entry of their own.
 */
export const ownsGeneratedEntry = (kit: Kit, project: string | undefined): boolean =>
  isProjectKit(kit) && project !== undefined;

/**
 * Reads a kit and the files it names inside its folder, and merges the project's additions after
 * its own components. Pure of the project: the checks against the project's files and packages are
 * `projectIssues`.
 */
export function loadKit(store: KitStore, id: string): LoadedKit {
  const files = store.read(id);
  if (!files) throw new KitvasError('KIT_NOT_FOUND', { id });
  const own = parseKit(files.kitJson, id);
  const projectKit = isProjectKit(own);

  // The additions first: the kit's rules see them, the source rules only the kit's own imports.
  const stored = store.readAdditions?.(id);
  const added: KitIssue[] = [];
  let kit = own;
  let additions: string[] = [];
  if (stored !== undefined) {
    const parsed = parseAdditions(stored.json);
    if ('at' in parsed) {
      added.push({
        path: 'additions',
        key: 'kitIssue.additionsInvalid',
        params: { kit: id, at: parsed.at },
      });
    } else {
      const merged = mergeAdditions(own, parsed.additions);
      kit = merged.kit;
      additions = merged.additions;
      added.push(...merged.issues);
    }
  }

  const issues = [...kitIssues(kit), ...sourceIssues(own), ...added];
  if (own.id !== id) {
    issues.push({ path: 'id', key: 'kitIssue.idMismatch', params: { id: own.id, folder: id } });
  }
  if (projectKit && own.runtime.entry !== GENERATED_ENTRY) {
    issues.push({
      path: 'runtime.entry',
      key: 'kitIssue.entryNotGenerated',
      params: { entry: own.runtime.entry, expected: GENERATED_ENTRY },
    });
  }
  // A project kit's entry is written by kitvas from the catalog, so it need not exist yet.
  if (!projectKit && !store.exists(id, own.runtime.entry)) {
    issues.push(fileMissing('runtime.entry', own.runtime.entry));
  }
  for (const file of own.runtime.styles.files) {
    if (!store.exists(id, file)) issues.push(fileMissing('runtime.styles.files', file));
  }

  const rawTokens = store.readJson(id, own.tokens.file);
  let tokens: FlatToken[] = [];
  if (rawTokens === undefined) {
    issues.push(fileMissing('tokens.file', own.tokens.file));
  } else {
    const flat = flattenTokens(rawTokens);
    tokens = flat.tokens;
    issues.push(...flat.issues);
  }

  // Kits without a map keep the hash they had before maps existed.
  const hashed: unknown[] = [files.kitJson, rawTokens ?? null];
  let cssVarMap: Record<string, string> = {};
  const mapFile = own.tokens.cssVars?.map;
  if (mapFile !== undefined) {
    const rawMap = store.readJson(id, mapFile);
    hashed.push(rawMap ?? null);
    if (rawMap === undefined) {
      issues.push(fileMissing('tokens.cssVars.map', mapFile));
    } else {
      const read = readCssVarMap(rawMap, tokens);
      cssVarMap = read.map;
      issues.push(...read.issues);
    }
  }

  if (isWrittenKit(own)) {
    // The components are the kit's data: editing one makes verify.json stale. Pushed last, so the
    // kits that have no such folder keep the hash they had.
    // A missing reference image is not checked here: it must not stop builds and drafts. The
    // `look` step of `kit verify` reports it at its example.
    hashed.push(store.readTree?.(id, 'components') ?? {});
  }
  // The project's additions change the kit its drafts see; a kit without them keeps its hash.
  if (stored !== undefined) hashed.push({ additions: stored.json });

  const ownEntry = join(files.dir, ...own.runtime.entry.split('/'));
  const entry =
    stored !== undefined && additions.length > 0 && !ownsGeneratedEntry(own, files.project)
      ? join(stored.dir, ...GENERATED_ENTRY.split('/'))
      : ownEntry;

  const hash = createHash('sha256').update(JSON.stringify(hashed)).digest('hex');
  return {
    kit,
    dir: files.dir,
    tokens,
    issues,
    hash,
    project: files.project,
    cssVarMap,
    additions,
    additionsDir: stored?.dir,
    entry,
  };
}

/** Like loadKit, but a kit with any problem is refused. For callers that build from the kit. */
export function requireKit(store: KitStore, id: string): LoadedKit {
  const loaded = loadKit(store, id);
  const first = loaded.issues[0];
  if (first) throw new KitvasError('KIT_INVALID', { id, detail: first.path });
  return loaded;
}

/** The kit as its own kit.json says, without the project's additions. */
export function ownKit(loaded: LoadedKit): Kit {
  if (loaded.additions.length === 0) return loaded.kit;
  const added = new Set(loaded.additions);
  return {
    ...loaded.kit,
    components: loaded.kit.components.filter((component) => !added.has(component.name)),
  };
}
