// The project's public environment variables (ADR 0095): what its own bundler puts into the browser
// code from its env files, so project code that reads them at import works in kitvas's bundle too.
// Only names with a public prefix are read; every other name may be a secret and stays in the file.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

/** The files a development build reads, a later one winning, in Next.js's order. */
export const ENV_FILES = ['.env', '.env.development', '.env.local', '.env.development.local'];

/** Next.js, Vite, Create React App, Gatsby, Expo, Astro and SvelteKit. */
const PUBLIC_NAME = /^(?:NEXT_PUBLIC_|VITE_|REACT_APP_|GATSBY_|EXPO_PUBLIC_|PUBLIC_)[A-Za-z0-9_]+$/;

export function readPublicEnv(project: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of ENV_FILES) {
    const file = join(project, name);
    if (!existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
      if (PUBLIC_NAME.test(key) && value !== undefined) env[key] = value;
    }
  }
  return env;
}
