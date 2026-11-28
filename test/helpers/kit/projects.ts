// Fixture projects for project kits: a temp copy of one of test/fixtures/projects/*, set up the way
// a person's project looks once its design system is installed and kitvas has learned it.

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { generatedEntry, parseKit } from '../../../src/kit/index.ts';
import { decisionsTemplate, initWorkspace, PLUGIN_ROOT } from '../../../src/shared/index.ts';
import { tempDir } from '../tmp.ts';

export type FixtureName =
  | 'acme-npm'
  | 'acme-partials'
  | 'acme-repo'
  | 'acme-sfc'
  | 'acme-tailwind'
  | 'acme-tailwind3'
  | 'acme-templates'
  | 'acme-twcode'
  | 'acme-written';
export type FixtureProject = { dir: string; kitId: string };

/** The id of the kit each fixture holds in its `kit/` folder. */
export const FIXTURE_KITS: Record<FixtureName, string> = {
  'acme-npm': 'acme',
  'acme-repo': 'firma',
  'acme-written': 'acme-site',
  'acme-tailwind': 'shad',
  'acme-tailwind3': 'shad3',
  'acme-templates': 'acme-tpl',
  'acme-twcode': 'acme-tw',
  'acme-sfc': 'acme-sfc',
  'acme-partials': 'acme-html',
};

/** Where a linked package lives in kitvas's own node_modules (`from`) and in the project (`as`). */
type Link = { from: string; as: string };
const same = (name: string): Link => ({ from: name, as: name });

/** Every name a link may have in a fixture project: what `removeFixture` unlinks first. */
const LINKED = ['react', 'react-dom', '@types/react', 'tailwindcss', '@tailwindcss/node'];

/** The packages a fixture gets: React, and Tailwind 4, or Tailwind 3 (kitvas's `tailwindcss3`). */
const linksOf = (name: FixtureName): Link[] => [
  ...['react', 'react-dom', '@types/react'].map(same),
  ...(name === 'acme-tailwind3' || name === 'acme-twcode'
    ? [{ from: 'tailwindcss3', as: 'tailwindcss' }]
    : ['tailwindcss', '@tailwindcss/node'].map(same)),
];

const FIXTURES = join(PLUGIN_ROOT, 'test', 'fixtures', 'projects');

/** The fixture's own folder in the repository (read only). */
export const fixtureSourceDir = (name: FixtureName): string => join(FIXTURES, name);

/** The fixture's small draft: `md/`, `src/tsx/sections/` and `src/scss/sections/`, for version 1. */
export const fixtureDraftDir = (name: FixtureName): string => join(FIXTURES, name, 'draft');

const linkPaths = (dir: string): string[] =>
  LINKED.map((name) => join(dir, 'node_modules', ...name.split('/')));

/**
 * A temp copy of test/fixtures/projects/<name>: its `packages/` folder becomes `node_modules/`,
 * `react`, `react-dom`, `@types/react`, `tailwindcss` and `@tailwindcss/node` are linked from
 * kitvas's own node_modules (junctions on Windows; `acme-tailwind3` gets Tailwind 3 as
 * `tailwindcss` and no `@tailwindcss/node`), `.kitvas/` is initialised with the fixture's
 * kit in `.kitvas/kits/<kitId>/` (its `generated/kit.ts` written with `generatedEntry`), and the
 * project's config uses that kit.
 */
export function fixtureProject(name: FixtureName): FixtureProject {
  const source = fixtureSourceDir(name);
  const kitId = FIXTURE_KITS[name];
  const dir = tempDir(`kitvas-${name}-`);

  // Everything except what only the test reads: the fake packages move, the kit and draft stay out.
  cpSync(source, dir, {
    recursive: true,
    filter: (path) => {
      const top = path.slice(source.length + 1).split(/[\\/]/)[0];
      return top !== 'packages' && top !== 'kit' && top !== 'draft';
    },
  });
  const packages = join(source, 'packages');
  if (existsSync(packages)) cpSync(packages, join(dir, 'node_modules'), { recursive: true });

  const type = process.platform === 'win32' ? 'junction' : 'dir';
  for (const { from, as } of linksOf(name)) {
    const path = join(dir, 'node_modules', ...as.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(join(PLUGIN_ROOT, 'node_modules', ...from.split('/')), path, type);
  }

  const { path: workspace } = initWorkspace(dir);
  writeFileSync(join(workspace, 'decisions.md'), decisionsTemplate(kitId));
  const kitDir = join(workspace, 'kits', kitId);
  cpSync(join(source, 'kit'), kitDir, { recursive: true });
  const kit = parseKit(JSON.parse(readFileSync(join(kitDir, 'kit.json'), 'utf8')), kitId);
  mkdirSync(join(kitDir, 'generated'), { recursive: true });
  writeFileSync(join(kitDir, 'generated', 'kit.ts'), generatedEntry(kit).text);
  return { dir, kitId };
}

/**
 * Removes a fixture project. The links go first, one by one: a recursive delete must never be
 * able to reach kitvas's own node_modules through one. When a link stays, nothing is deleted.
 */
export function removeFixture(dir: string): void {
  for (const path of linkPaths(dir)) {
    try {
      if (lstatSync(path, { throwIfNoEntry: false })) unlinkSync(path);
    } catch {
      // Checked below.
    }
    if (lstatSync(path, { throwIfNoEntry: false })) return;
  }
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // A file still in use; the system's temp folder is cleaned anyway.
  }
}
