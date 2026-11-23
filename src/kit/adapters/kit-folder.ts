// The one rule for a file of a kit folder under a root: <root>/<id>/<relPath>, never outside it.

import { join, resolve, sep } from 'node:path';

const KIT_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const kitDir = (root: string, id: string): string => join(root, id);

/** The absolute path of a file of the kit, or `undefined` when it would leave the kit folder. */
export function kitFile(root: string, id: string, relPath: string): string | undefined {
  if (!KIT_ID.test(id)) return undefined;
  const dir = resolve(kitDir(root, id));
  const file = resolve(dir, relPath);
  return file.startsWith(dir + sep) ? file : undefined;
}
