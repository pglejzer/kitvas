// Drafts as folders under one root: <root>/<slug>/draft.json.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { KitvasError } from '../../shared/index.ts';
import { isSlug } from '../domain/names.ts';
import type { DraftStore } from '../ports/draft-store.ts';

export function createFsDraftStore(root: string): DraftStore {
  /** The absolute path of something in a draft, or `undefined` when it would leave the draft. */
  const inside = (slug: string, relPath = '.'): string | undefined => {
    if (!isSlug(slug)) return undefined;
    const dir = resolve(root, slug);
    const target = resolve(dir, relPath);
    return target === dir || target.startsWith(dir + sep) ? target : undefined;
  };

  const required = (slug: string, relPath: string): string => {
    const target = inside(slug, relPath);
    if (!target) throw new KitvasError('DRAFT_INVALID', { slug, detail: relPath });
    return target;
  };

  const readText = (slug: string, relPath: string): string | undefined => {
    const file = inside(slug, relPath);
    return file && existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  };

  return {
    list() {
      if (!existsSync(root)) return [];
      return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'draft.json')))
        .map((entry) => entry.name)
        .sort();
    },
    dir: (slug) => join(root, slug),
    exists(slug, relPath) {
      const target = inside(slug, relPath);
      return target !== undefined && existsSync(target);
    },
    readText,
    readJson(slug, relPath) {
      const text = readText(slug, relPath);
      if (text === undefined) return undefined;
      try {
        return JSON.parse(text);
      } catch {
        throw new KitvasError('DRAFT_INVALID', { slug, detail: relPath });
      }
    },
    writeText(slug, relPath, text) {
      const file = required(slug, relPath);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    },
    makeDir(slug, relPath) {
      mkdirSync(required(slug, relPath), { recursive: true });
    },
    copyDir(slug, fromRel, toRel) {
      const source = required(slug, fromRel);
      if (existsSync(source)) cpSync(source, required(slug, toRel), { recursive: true });
    },
  };
}
