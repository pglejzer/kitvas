import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import { doctorKeys } from './locales.ts';

const messages = JSON.parse(
  readFileSync(join(PLUGIN_ROOT, 'locales', 'en.json'), 'utf8'),
) as Record<string, string>;

test('every doctor message the code asks for is in locales/en.json', () => {
  const missing = [...doctorKeys(), 'command.doctor.summary', 'error.DOCTOR_FAILED'].filter(
    (key) => !(key in messages),
  );
  assert.deepEqual(missing, []);
});
