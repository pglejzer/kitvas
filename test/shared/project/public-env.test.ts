import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ENV_FILES, readPublicEnv } from '../../../src/shared/index.ts';
import { tempDir } from '../../helpers/tmp.ts';

test('a project without env files has no public variables', () => {
  assert.deepEqual(readPublicEnv(tempDir('kitvas-env-')), {});
});

test('only names a bundler puts in the browser code are read; the others may be secrets', () => {
  const project = tempDir('kitvas-env-');
  writeFileSync(
    join(project, '.env'),
    [
      '# comment',
      'NEXT_PUBLIC_APP_URL=http://localhost:3000',
      'VITE_API="https://api.example.test"',
      "REACT_APP_NAME='Acme # one'",
      'GATSBY_SITE=gatsby',
      'EXPO_PUBLIC_KEY=expo',
      'PUBLIC_ASTRO=astro',
      'export DATABASE_URL=postgres://user:secret@db/app',
      'STRIPE_API_KEY=sk_test_secret',
      'NEXT_PUBLIC_=no name after the prefix',
      'next_public_lower=not a public name',
    ].join('\n'),
  );
  assert.deepEqual(readPublicEnv(project), {
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    VITE_API: 'https://api.example.test',
    REACT_APP_NAME: 'Acme # one',
    GATSBY_SITE: 'gatsby',
    EXPO_PUBLIC_KEY: 'expo',
    PUBLIC_ASTRO: 'astro',
  });
});

test('a later file wins, in the order a development build reads them', () => {
  assert.deepEqual(ENV_FILES, ['.env', '.env.development', '.env.local', '.env.development.local']);
  const project = tempDir('kitvas-env-');
  writeFileSync(join(project, '.env'), 'VITE_A=env\nVITE_B=env\nVITE_C=env\nVITE_D=env\n');
  writeFileSync(join(project, '.env.development'), 'VITE_B=development\nVITE_C=development\n');
  writeFileSync(join(project, '.env.local'), 'VITE_C=local\nVITE_D=local\n');
  writeFileSync(join(project, '.env.development.local'), 'VITE_D=development.local\n');
  // A production file is not read by a development build.
  writeFileSync(join(project, '.env.production'), 'VITE_A=production\n');
  assert.deepEqual(readPublicEnv(project), {
    VITE_A: 'env',
    VITE_B: 'development',
    VITE_C: 'local',
    VITE_D: 'development.local',
  });
});
