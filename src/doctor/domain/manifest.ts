// Reads the two small files of the plugin folder that the doctor reports on.

import { isRecord } from '../../shared/index.ts';

export type Manifest =
  | { state: 'ok'; version: string }
  | { state: 'unreadable' }
  | { state: 'invalid' };

function parse(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

/** `.claude-plugin/plugin.json`: a name and a version, both text. */
export function parseManifest(text: string | undefined): Manifest {
  if (text === undefined) return { state: 'unreadable' };
  const parsed = parse(text);
  if (!isRecord(parsed)) return { state: 'invalid' };
  const { name, version } = parsed;
  if (typeof name !== 'string' || typeof version !== 'string' || name === '' || version === '') {
    return { state: 'invalid' };
  }
  return { state: 'ok', version };
}

/** The range of Node versions `package.json` names, `undefined` when it names none. */
export function parseEngines(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const parsed = parse(text);
  if (!isRecord(parsed) || !isRecord(parsed.engines)) return undefined;
  const node = parsed.engines.node;
  return typeof node === 'string' ? node : undefined;
}
