// Use case: read a kit, check it against the contract and collect its problems.

import { createHash } from 'node:crypto';
import { KitvasError } from '../../shared/index.ts';
import { type Kit, parseKit } from '../domain/contract.ts';
import { readCssVarMap } from '../domain/css-vars.ts';
import { GENERATED_ENTRY } from '../domain/generated-entry.ts';
import type { KitIssue } from '../domain/issues.ts';
import { kitIssues } from '../domain/rules.ts';
import { isProjectKit, isWrittenKit, sourceIssues } from '../domain/sources.ts';
import { type FlatToken, flattenTokens } from '../domain/tokens.ts';
import type { KitStore } from '../ports/kit-store.ts';

export type LoadedKit = {
  kit: Kit;
  /** Absolute path of the kit folder. */
  dir: string;
  tokens: FlatToken[];
  issues: KitIssue[];
  /** sha256 of kit.json, the token file and the cssVars map: changes when the kit's data changes. */
  hash: string;
  /** From KitFiles.project: the project folder of a kit in `.kitvas/kits/`; undefined for built-in kits. */
  project: string | undefined;
  /** tokens.cssVars.map read from its file: token path with dots -> native variable; {} when none. */
  cssVarMap: Record<string, string>;
};

const fileMissing = (path: string, file: string): KitIssue => ({
  path,
  key: 'kitIssue.fileMissing',
  params: { file },
});

/**
 * Reads a kit and the files it names inside its folder. Pure of the project: the checks against the
 * project's files and packages are `projectIssues`.
 */
export function loadKit(store: KitStore, id: string): LoadedKit {
  const files = store.read(id);
  if (!files) throw new KitvasError('KIT_NOT_FOUND', { id });
  const kit = parseKit(files.kitJson, id);
  const projectKit = isProjectKit(kit);

  const issues = [...kitIssues(kit), ...sourceIssues(kit)];
  if (kit.id !== id) {
    issues.push({ path: 'id', key: 'kitIssue.idMismatch', params: { id: kit.id, folder: id } });
  }
  if (projectKit && kit.runtime.entry !== GENERATED_ENTRY) {
    issues.push({
      path: 'runtime.entry',
      key: 'kitIssue.entryNotGenerated',
      params: { entry: kit.runtime.entry, expected: GENERATED_ENTRY },
    });
  }
  // A project kit's entry is written by kitvas from the catalog, so it need not exist yet.
  if (!projectKit && !store.exists(id, kit.runtime.entry)) {
    issues.push(fileMissing('runtime.entry', kit.runtime.entry));
  }
  for (const file of kit.runtime.styles.files) {
    if (!store.exists(id, file)) issues.push(fileMissing('runtime.styles.files', file));
  }

  const rawTokens = store.readJson(id, kit.tokens.file);
  let tokens: FlatToken[] = [];
  if (rawTokens === undefined) {
    issues.push(fileMissing('tokens.file', kit.tokens.file));
  } else {
    const flat = flattenTokens(rawTokens);
    tokens = flat.tokens;
    issues.push(...flat.issues);
  }

  // Kits without a map keep the hash they had before maps existed.
  const hashed: unknown[] = [files.kitJson, rawTokens ?? null];
  let cssVarMap: Record<string, string> = {};
  const mapFile = kit.tokens.cssVars?.map;
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

  if (isWrittenKit(kit)) {
    // The components are the kit's data: editing one makes verify.json stale. Pushed last, so the
    // kits that have no such folder keep the hash they had.
    // A missing reference image is not checked here: it must not stop builds and drafts. The
    // `look` step of `kit verify` reports it at its example.
    hashed.push(store.readTree?.(id, 'components') ?? {});
  }

  const hash = createHash('sha256').update(JSON.stringify(hashed)).digest('hex');
  return { kit, dir: files.dir, tokens, issues, hash, project: files.project, cssVarMap };
}

/** Like loadKit, but a kit with any problem is refused. For callers that build from the kit. */
export function requireKit(store: KitStore, id: string): LoadedKit {
  const loaded = loadKit(store, id);
  const first = loaded.issues[0];
  if (first) throw new KitvasError('KIT_INVALID', { id, detail: first.path });
  return loaded;
}
