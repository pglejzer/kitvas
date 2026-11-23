// The plugin's own version, from its package.json.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './paths.ts';

export function pluginVersion(): string {
  const manifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')) as {
    version: string;
  };
  return manifest.version;
}
