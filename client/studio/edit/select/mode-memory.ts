// The mode the person chose, kept for the tab (a version switch loads a new document). An older
// version forces Preview and starts no editor, so it never writes here; the latest version reads
// the choice back and opens in it. Storage may be missing or throw: then the editor opens in
// Preview as before.

import type { Mode } from '../../shell/layout.ts';

/** The part of `sessionStorage` the memory uses; replaceable in tests. */
export type ModeStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const modeKey = (slug: string): string => `kitvas.edit.mode:${slug}`;

/** The tab's storage, or `null` where reading it throws (blocked site data, a sandbox). */
export function modeStorage(): ModeStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** The mode a stored value names; anything else is no choice. */
export const storedMode = (raw: string | null): Mode | null =>
  raw === 'edit' || raw === 'preview' ? raw : null;

/** Whether the editor opens in Edit: the person chose it, and this version can be edited. */
export const opensInEdit = (stored: Mode | null, editable: boolean): boolean =>
  editable && stored === 'edit';

export function readMode(storage: ModeStorage | null, slug: string): Mode | null {
  try {
    return storage === null ? null : storedMode(storage.getItem(modeKey(slug)));
  } catch {
    return null;
  }
}

export function writeMode(storage: ModeStorage | null, slug: string, mode: Mode): void {
  try {
    storage?.setItem(modeKey(slug), mode);
  } catch {
    // Without storage the choice is not kept; nothing else depends on it.
  }
}
