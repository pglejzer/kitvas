// A locales folder for the doctor's CLI tests: the real messages, plus every `doctor.*` key the
// code asks for, each answering its own name. The tests then do not wait for the texts to be merged.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import { listFiles } from '../helpers/architecture.ts';
import { tempDir } from '../helpers/tmp.ts';

const KEY = /['"`](doctor\.[A-Za-z0-9.]+)['"`]/g;

/** Every `doctor.*` key written in the doctor's code. */
export function doctorKeys(): string[] {
  const files = [...listFiles(PLUGIN_ROOT, 'src/doctor'), 'src/cli/commands/doctor.ts'].filter(
    (file) => file.endsWith('.ts'),
  );
  const keys = new Set([
    'doctor.status.ok',
    'doctor.status.warn',
    'doctor.status.fail',
    'doctor.status.skipped',
  ]);
  for (const file of files) {
    for (const match of readFileSync(join(PLUGIN_ROOT, file), 'utf8').matchAll(KEY)) {
      keys.add(match[1] ?? '');
    }
  }
  return [...keys].filter((key) => !key.endsWith('.'));
}

export function doctorLocalesDir(): string {
  const dir = tempDir('kitvas-locales-');
  const real = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'locales', 'en.json'), 'utf8')) as Record<
    string,
    string
  >;
  // The doctor's own keys answer their names, so a test reads the same before and after the merge.
  const own = Object.fromEntries(doctorKeys().map((key) => [key, key]));
  const messages: Record<string, string> = { ...real, ...own };
  messages['command.doctor.summary'] ??= 'command.doctor.summary';
  messages['error.DOCTOR_FAILED'] ??= '{count} checks failed.';
  writeFileSync(join(dir, 'en.json'), JSON.stringify(messages));
  return dir;
}
