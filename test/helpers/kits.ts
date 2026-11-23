import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import type { KitStore } from '../../src/kit/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import { tempDir } from './tmp.ts';

export const FIXTURE_KITS = join(PLUGIN_ROOT, 'test', 'fixtures', 'kits');

/** The kits shipped with the plugin: Base is there. */
export const builtinKits = (): KitStore => createFolderKitStore(join(PLUGIN_ROOT, 'kits'));

/** A fresh, mutable copy of the tiny kit's kit.json. */
export function tinyKitJson(): Record<string, unknown> {
  const text = readFileSync(join(FIXTURE_KITS, 'tiny', 'kit.json'), 'utf8');
  return JSON.parse(text) as Record<string, unknown>;
}

/** Copies a fixture kit into a new temp root and returns that root. */
export function copyKit(id: string, as: string = id): string {
  const root = tempDir('kitvas-kits-');
  cpSync(join(FIXTURE_KITS, id), join(root, as), { recursive: true });
  return root;
}
