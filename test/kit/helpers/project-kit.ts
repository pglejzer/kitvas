// Project kits for the kit and CLI tests: kit.json objects as the learner writes them, temp
// projects with fake installed packages, and the kit stores over them.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { createLayeredKitStore } from '../../../src/kit/adapters/layered-store.ts';
import type { KitStore } from '../../../src/kit/index.ts';
import { projectKitsDir } from '../../../src/shared/index.ts';
import { FIXTURE_KITS } from '../../helpers/kit/kits.ts';
import { tempDir } from '../../helpers/tmp.ts';

export type Json = Record<string, unknown>;

const component = (name: string, from: string, extra: Json = {}): Json => ({
  name,
  category: 'action',
  description: `${name} of the test kit.`,
  import: { from, name },
  props: [{ name: 'children', type: 'node', required: true }],
  ...extra,
});

/** An npm kit over `@acme/ui`, with a theme from the project and two style imports. */
export function npmKitJson(): Json {
  return {
    schemaVersion: 1,
    id: 'acme',
    name: 'Acme UI',
    version: '1.2.0',
    source: { type: 'npm', package: '@acme/ui', version: '1.2.0' },
    framework: 'react',
    runtime: {
      packages: [
        { name: '@acme/ui', version: '1.2.0' },
        { name: 'react', version: '19.3.1' },
      ],
      entry: 'generated/kit.ts',
      styles: { imports: ['@acme/ui/styles.css', 'src/theme/fonts.css'] },
      providers: [
        {
          import: { from: '@acme/ui', name: 'AcmeProvider' },
          props: { 'data-mode': 'light' },
          bindings: { theme: { from: 'src/theme', name: 'theme' } },
        },
      ],
    },
    tokens: {
      file: 'json/tokens.json',
      format: 'dtcg-2025.10',
      cssVars: { prefix: '--acme-', map: 'json/css-var-map.json' },
    },
    components: [
      component('Button', '@acme/ui', {
        examples: [{ title: 'Save', code: '<Button>Save</Button>', imports: ['Button'] }],
      }),
      {
        ...component('DatePicker', '@acme/ui/date'),
        import: { from: '@acme/ui/date', default: true },
      },
    ],
  };
}

/** A repo kit over the project's `src/ds`, with one package style and a Tailwind entry. */
export function repoKitJson(): Json {
  return {
    schemaVersion: 1,
    id: 'firma',
    name: 'Firma',
    version: '0.0.0',
    source: { type: 'repo', path: 'src/ds' },
    framework: 'react',
    runtime: {
      packages: [
        { name: 'react', version: '19.3.1' },
        { name: 'react-day-picker', version: '9.0.0' },
      ],
      entry: 'generated/kit.ts',
      styles: {
        imports: ['src/ds/tokens.css', 'react-day-picker/style.css'],
        tailwind: { entry: 'src/app/globals.css' },
      },
    },
    tokens: { file: 'json/tokens.json', format: 'dtcg-2025.10' },
    components: [
      component('Button', 'src/ds/Button'),
      { ...component('Card', 'src/ds/card'), import: { from: 'src/ds/card', name: 'DsCard' } },
    ],
  };
}

/** A written kit from a website: components in its own folder, one example with a reference. */
export function webKitJson(): Json {
  return {
    schemaVersion: 1,
    id: 'site',
    name: 'Site',
    version: '0.0.0',
    source: { type: 'web', urls: ['https://example.com/'] },
    framework: 'react',
    runtime: {
      packages: [{ name: 'react', version: '19.3.1' }],
      entry: 'generated/kit.ts',
      styles: { imports: ['components/base.css'] },
    },
    tokens: { file: 'json/tokens.json', format: 'dtcg-2025.10' },
    components: [
      component('Button', 'components/Button', {
        examples: [
          {
            title: 'Save',
            code: '<Button>Save</Button>',
            imports: ['Button'],
            reference: 'source/refs/Button.1.png',
          },
        ],
      }),
      component('Card', 'components/Card'),
    ],
  };
}

/** Tokens the npm kit's map points at. */
export const ACME_TOKENS: Json = {
  color: {
    $type: 'color',
    ink: { $value: { colorSpace: 'srgb', components: [0.1, 0.1, 0.1] } },
  },
  space: { $type: 'dimension', sm: { $value: { value: 8, unit: 'px' } } },
};

export const ACME_MAP: Json = { 'color.ink': '--acme-color-ink', 'space.sm': '--acme-space-2' };

export function writeText(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

export type FakePackage = {
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/**
 * A temp project: `files` by project path, and `node_modules/<name>/package.json` per package.
 * `.kitvas/` with a config is created too, unless `workspace` is false.
 */
export function tempProject(
  files: Record<string, string> = {},
  packages: Record<string, FakePackage> = {},
  workspace = true,
): string {
  const dir = tempDir('kitvas-project-');
  for (const [path, text] of Object.entries(files)) writeText(join(dir, ...path.split('/')), text);
  for (const [name, pkg] of Object.entries(packages)) {
    const file = join(dir, 'node_modules', ...name.split('/'), 'package.json');
    writeText(file, JSON.stringify({ name, ...pkg }));
  }
  if (workspace) writeText(join(dir, '.kitvas', 'decisions.md'), '---\nkit: base\n---\n');
  return dir;
}

/** Writes a kit into `<project>/.kitvas/kits/<folder>/`: its kit.json and `files` by kit path. */
export function writeProjectKit(
  project: string,
  kitJson: Json,
  files: Record<string, string> = {},
  folder = String(kitJson.id),
): string {
  const dir = join(projectKitsDir(project), folder);
  writeText(join(dir, 'kit.json'), JSON.stringify(kitJson, null, 2));
  for (const [path, text] of Object.entries(files)) writeText(join(dir, ...path.split('/')), text);
  return dir;
}

/** The fixture kits (`broken`, `tiny`) as the built-in layer, the project's kits over them. */
export function layeredStore(project: string, builtinRoot: string = FIXTURE_KITS): KitStore {
  return createLayeredKitStore(createFolderKitStore(builtinRoot), {
    dir: project,
    store: createFolderKitStore(projectKitsDir(project)),
  });
}
