import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import type { KitStore } from '../../../src/kit/index.ts';
import { PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { tempDir } from '../tmp.ts';

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

/** An sRGB colour token value. */
export const srgb = (red: number, green: number, blue: number) => ({
  colorSpace: 'srgb',
  components: [red, green, blue],
});

/** The tiny kit's dark theme: a light ink (`#cccccc`); `$type` comes from the base's group. */
export const TINY_DARK = { color: { ink: { $value: srgb(0.8, 0.8, 0.8) } } };

/**
 * A copy of the tiny kit with two themes (ADR 0083): `light`, the default and its base file, and
 * `dark` with `json/tokens.dark.json` (`dark`, as given) and the attribute `data-tiny-scheme`.
 * Returns the root of the copy.
 */
export function themedTiny(dark: unknown = TINY_DARK): string {
  const root = copyKit('tiny');
  const json = tinyKitJson();
  (json.tokens as Record<string, unknown>).themes = {
    default: 'light',
    list: [
      { id: 'light', label: 'Light' },
      {
        id: 'dark',
        label: 'Dark',
        file: 'json/tokens.dark.json',
        attributes: { 'data-tiny-scheme': 'dark' },
      },
    ],
  };
  writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(json, null, 2));
  writeFileSync(join(root, 'tiny', 'json', 'tokens.dark.json'), JSON.stringify(dark));
  return root;
}
