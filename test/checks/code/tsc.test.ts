import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { test } from 'node:test';
import { createTscChecker } from '../../../src/checks/adapters/tsc-checker.ts';
import { idEntries } from '../../../src/checks/domain/code/ids.ts';
import {
  elementAt,
  parseTscOutput,
  typeFindings,
  typesConfig,
} from '../../../src/checks/domain/code/tsc.ts';
import { PLUGIN_ROOT, resolveDep, z } from '../../../src/shared/index.ts';
import { tempDir } from '../../helpers/tmp.ts';

const IDS = idEntries({
  schemaVersion: 1,
  ids: {
    'sections/Hero:section': {
      file: 'src/tsx/sections/Hero.tsx',
      line: 5,
      column: 5,
      tag: 'section',
    },
    'sections/Hero:section/h1': {
      file: 'src/tsx/sections/Hero.tsx',
      line: 6,
      column: 7,
      tag: 'h1',
    },
    'sections/Hero:section/Button': {
      file: 'src/tsx/sections/Hero.tsx',
      line: 8,
      column: 7,
      tag: 'Button',
    },
    'index:Hero': { file: 'src/tsx/index.tsx', line: 8, column: 7, tag: 'Hero' },
  },
});

const REACT_PATHS = {
  '@kit': ['/k/tsx/index.ts'],
  react: ['/t/react/index.d.ts'],
  'react/jsx-runtime': ['/t/react/jsx-runtime.d.ts'],
  'react/jsx-dev-runtime': ['/t/react/jsx-dev-runtime.d.ts'],
};

const CONFIG_INPUT = {
  entry: '/d/v1/src/tsx/index.tsx',
  kitEntry: '/k/tsx/index.ts',
  reactTypes: '/t/react',
  assets: '/a/assets.d.ts',
};

const slashes = (path: string): string => path.split(sep).join('/');

test('ids.json becomes a list; anything else is no ids', () => {
  assert.deepEqual(IDS[2], {
    id: 'sections/Hero:section/Button',
    file: 'src/tsx/sections/Hero.tsx',
    line: 8,
    column: 7,
    tag: 'Button',
  });
  assert.deepEqual(idEntries(undefined), []);
  assert.deepEqual(idEntries({ ids: { a: { file: 1 } } }), []);
});

test('the tsconfig points @kit and React at their files and checks the entry with the asset types', () => {
  assert.deepEqual(typesConfig(CONFIG_INPUT), {
    compilerOptions: {
      noEmit: true,
      strict: true,
      target: 'ES2024',
      lib: ['ES2024', 'DOM', 'DOM.Iterable'],
      module: 'preserve',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      noUncheckedSideEffectImports: false,
      types: [],
      paths: REACT_PATHS,
    },
    files: ['/d/v1/src/tsx/index.tsx', '/a/assets.d.ts'],
  });
});

test("a project's paths come first; @kit and React stay kitvas's", () => {
  const config = typesConfig({
    ...CONFIG_INPUT,
    project: {
      config: '/p/tsconfig.json',
      paths: {
        '@/*': ['/p/src/*'],
        '*': ['/p/src/*'],
        react: ['/p/preact/compat'],
        'react/*': ['/p/preact/*'],
        '@kit/*': ['/p/kit/*'],
        'react-dom': ['/p/react-dom'],
      },
      types: { files: [], include: [], exclude: [] },
    },
  });
  assert.deepEqual(config.compilerOptions.paths, {
    '@/*': ['/p/src/*'],
    '*': ['/p/src/*'],
    'react-dom': ['/p/react-dom'],
    ...REACT_PATHS,
  });
  assert.deepEqual(Object.keys(config.compilerOptions.paths), [
    '@/*',
    '*',
    'react-dom',
    '@kit',
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
  ]);
  // A project with no type files of its own adds no patterns for tsc to walk.
  assert.deepEqual(config.files, ['/d/v1/src/tsx/index.tsx', '/a/assets.d.ts']);
  assert.ok(!('include' in config));
});

test("a project's type files are read with the entry", () => {
  const config = typesConfig({
    ...CONFIG_INPUT,
    project: {
      config: '/p/tsconfig.json',
      paths: {},
      types: {
        files: ['/p/types/mui.d.ts'],
        include: ['/p/src/**/*.d.ts'],
        exclude: ['/p/dist'],
      },
    },
  });
  assert.deepEqual(config.files, [
    '/d/v1/src/tsx/index.tsx',
    '/a/assets.d.ts',
    '/p/types/mui.d.ts',
  ]);
  assert.deepEqual(
    { include: config.include, exclude: config.exclude },
    { include: ['/p/src/**/*.d.ts'], exclude: ['/p/dist'] },
  );
});

test('reads the errors tsc prints, with their continuation lines', () => {
  const output = [
    'src\\tsx\\sections\\Hero.tsx(8,15): error TS2322: Type \'"ghost"\' is not assignable.',
    "  The expected type comes from property 'variant'.",
    "error TS6053: File 'x.tsx' not found.",
    '../../kits/kitvas-ui/tsx/index.ts(1,1): error TS1005: Something.',
    'Found 3 errors.',
    '',
  ].join('\r\n');
  assert.deepEqual(parseTscOutput(output), [
    {
      file: 'src/tsx/sections/Hero.tsx',
      line: 8,
      column: 15,
      code: 'TS2322',
      text: "Type '\"ghost\"' is not assignable.\nThe expected type comes from property 'variant'.",
    },
    { file: null, line: 0, column: 0, code: 'TS6053', text: "File 'x.tsx' not found." },
    {
      file: '../../kits/kitvas-ui/tsx/index.ts',
      line: 1,
      column: 1,
      code: 'TS1005',
      text: 'Something.',
    },
  ]);
  assert.deepEqual(parseTscOutput(''), []);
});

test('a place belongs to the element that starts nearest before it', () => {
  assert.equal(elementAt(IDS, 'src/tsx/sections/Hero.tsx', 8, 15), 'sections/Hero:section/Button');
  assert.equal(elementAt(IDS, 'src/tsx/sections/Hero.tsx', 8, 3), 'sections/Hero:section/h1');
  assert.equal(elementAt(IDS, 'src/tsx/sections/Hero.tsx', 2, 1), null);
  assert.equal(elementAt(IDS, 'src/tsx/other.tsx', 9, 1), null);
});

test('errors in the draft are to fix; errors elsewhere are to review', () => {
  const findings = typeFindings(
    parseTscOutput(
      [
        'src/tsx/sections/Hero.tsx(8,15): error TS2322: Bad value.',
        '../kit/index.ts(3,1): error TS1005: Kit problem.',
      ].join('\n'),
    ),
    IDS,
  );
  assert.deepEqual(findings[0], {
    check: 'types',
    rule: 'types/TS2322',
    severity: 'fix',
    file: 'src/tsx/sections/Hero.tsx',
    line: 8,
    column: 15,
    element: 'sections/Hero:section/Button',
    message: { key: 'checkRule.tool', params: { text: 'Bad value.' } },
    hint: { key: 'checkHint.types', params: {} },
    states: [],
    widths: [],
  });
  assert.equal(findings[1]?.severity, 'review');
  assert.equal(findings[1]?.element, null);
});

test("for a project kit only the draft's own messages and those without a file count", () => {
  const messages = parseTscOutput(
    [
      'src/tsx/sections/Hero.tsx(8,15): error TS2322: Bad value.',
      '../../../kits/shad/generated/kit.ts(2,25): error TS2307: Cannot find module.',
      '../../../../src/components/ui/button.tsx(3,20): error TS2307: Cannot find module.',
      "error TS6053: File 'x.tsx' not found.",
    ].join('\n'),
  );
  assert.deepEqual(
    typeFindings(messages, IDS, { onlyDraft: true }).map((finding) => [
      finding.severity,
      finding.rule,
      finding.file,
    ]),
    [
      ['fix', 'types/TS2322', 'src/tsx/sections/Hero.tsx'],
      ['review', 'types/TS6053', null],
    ],
  );
  assert.equal(typeFindings(messages, IDS).length, 4);
});

const BUTTON = [
  "import { cn } from '@/lib/utils';",
  "import styles from './button.module.css';",
  "import './button.css';",
  '',
  "export function Button(props: { variant: 'solid' | 'ghost'; children: string }) {",
  '  return <button className={cn(styles.root, props.variant)}>{props.children}</button>;',
  '}',
  '',
  "export const broken: number = 'x';",
  '',
].join('\n');

const DRAFT = [
  "import { Button } from '@kit';",
  '',
  'export function Draft() {',
  '  return <Button variant="plain">Go</Button>;',
  '}',
  '',
].join('\n');

const SavedConfig = z.object({
  compilerOptions: z.object({ paths: z.record(z.string(), z.array(z.string())) }),
  files: z.array(z.string()),
  include: z.array(z.string()),
});

test('a project kit is checked with its paths, its React types and the asset types', async () => {
  const project = tempDir('kitvas-types-');
  const write = (relPath: string, text: string): void => {
    const file = join(project, ...relPath.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  write(
    'tsconfig.json',
    '{\n  // the alias of shadcn/ui\n  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] }, },\n}\n',
  );
  write('src/lib/utils.ts', "export const cn = (...parts: string[]): string => parts.join(' ');\n");
  write('src/ui/button.tsx', BUTTON);
  write(
    '.kitvas/kits/shad/generated/kit.ts',
    'export { Button } from "../../../../src/ui/button";\n',
  );
  write('.kitvas/drafts/shop/v1/src/tsx/index.tsx', DRAFT);
  // The config names no files, so tsc takes in the project's type files wherever they are, but
  // never those of an installed package or of a folder whose name starts with a dot: read, either
  // of these would be the one thing tsc reports.
  const unreadable = 'export const unreadable: number = ;\n';
  write('node_modules/some-package/index.d.ts', unreadable);
  write('.kitvas/kits/shad/unreadable.d.ts', unreadable);
  // A copy, not a link, so the project's React types have a path of their own.
  cpSync(
    dirname(resolveDep('@types/react/package.json', [PLUGIN_ROOT])),
    join(project, 'node_modules', '@types', 'react'),
    { recursive: true },
  );
  const versionDir = join(project, '.kitvas', 'drafts', 'shop', 'v1');

  const messages = await createTscChecker({ roots: [PLUGIN_ROOT] }).check({
    workingDir: versionDir,
    entry: join(versionDir, 'src', 'tsx', 'index.tsx'),
    kitEntry: join(project, '.kitvas', 'kits', 'shad', 'generated', 'kit.ts'),
    project,
  });
  // `@/lib/utils` and the style imports resolve: the two errors written on purpose are all.
  assert.deepEqual(
    [...messages]
      .sort((a, b) => ((a.file ?? '') < (b.file ?? '') ? -1 : 1))
      .map((message) => [message.file, message.line, message.column, message.code]),
    [
      ['../../../../src/ui/button.tsx', 9, 14, 'TS2322'],
      ['src/tsx/index.tsx', 4, 18, 'TS2322'],
    ],
  );

  const saved: unknown = JSON.parse(
    readFileSync(join(versionDir, 'build', 'json', 'tsconfig.json'), 'utf8'),
  );
  const config = SavedConfig.parse(saved);
  const home = slashes(realpathSync.native(project));
  assert.deepEqual(Object.keys(config.compilerOptions.paths), [
    '@/*',
    // `baseUrl: "."`: the project's root is a folder its imports start from.
    '*',
    '@kit',
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
  ]);
  assert.deepEqual(config.compilerOptions.paths['@/*'], [`${home}/src/*`]);
  assert.deepEqual(config.compilerOptions.paths['*'], [`${home}/*`]);
  assert.deepEqual(config.compilerOptions.paths['@kit'], [
    `${home}/.kitvas/kits/shad/generated/kit.ts`,
  ]);
  assert.deepEqual(config.compilerOptions.paths.react, [
    `${home}/node_modules/@types/react/index.d.ts`,
  ]);
  assert.deepEqual(config.files, [
    `${home}/.kitvas/drafts/shop/v1/src/tsx/index.tsx`,
    slashes(realpathSync.native(join(PLUGIN_ROOT, 'client', 'types', 'assets.d.ts'))),
  ]);
  assert.deepEqual(config.include, [`${home}/**/*.d.ts`]);
});

const TONE_BUTTON = [
  "import type { ReactNode } from 'react';",
  "import type { Tone } from 'shared/tones';",
  "import type { Size } from '~tokens/sizes';",
  '',
  'export interface ToneOverrides {}',
  'export interface SizeOverrides {}',
  '',
  'export function Button(props: {',
  '  tone?: Tone | keyof ToneOverrides;',
  '  size?: Size | keyof SizeOverrides;',
  '  children: ReactNode;',
  '}) {',
  '  return <button type="button">{props.children}</button>;',
  '}',
  '',
].join('\n');

/** A type file nothing imports: it gives one prop of the button one more value. */
const widens = (name: string, value: string, from: string): string =>
  `export {};\n\ndeclare module '${from}' {\n  interface ${name} {\n    ${value}: true;\n  }\n}\n`;

const TONE_DRAFT = [
  "import { Button } from '@kit';",
  '',
  'export function Draft() {',
  '  return (',
  '    <>',
  '      <Button tone="loud" size="huge">Widened</Button>',
  '      <Button tone="nope">Typed through the base folder</Button>',
  '      <Button size="nope">Typed through the declared name</Button>',
  '    </>',
  '  );',
  '}',
  '',
].join('\n');

test("a project's base folder, its kit's declared names and its type files hold in the check", async () => {
  const project = tempDir('kitvas-types-');
  const write = (relPath: string, text: string): void => {
    const file = join(project, ...relPath.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  write('tsconfig.json', '{ "compilerOptions": { "baseUrl": "src" }, "include": ["src"] }\n');
  write('src/shared/tones.ts', "export type Tone = 'primary' | 'quiet';\n");
  write('design/tokens/sizes.ts', "export type Size = 'sm' | 'lg';\n");
  write('src/ui/button.tsx', TONE_BUTTON);
  // In the project's `include`, imported by nothing.
  write('src/tones.d.ts', widens('ToneOverrides', 'loud', './ui/button'));
  // Outside the `include`: only the kit names it.
  write('typings/sizes.d.ts', widens('SizeOverrides', 'huge', '../src/ui/button'));
  write(
    '.kitvas/kits/own/generated/kit.ts',
    'export { Button } from "../../../../src/ui/button";\n',
  );
  write('.kitvas/drafts/shop/v1/src/tsx/index.tsx', TONE_DRAFT);
  const versionDir = join(project, '.kitvas', 'drafts', 'shop', 'v1');

  const messages = await createTscChecker({ roots: [PLUGIN_ROOT] }).check({
    workingDir: versionDir,
    entry: join(versionDir, 'src', 'tsx', 'index.tsx'),
    kitEntry: join(project, '.kitvas', 'kits', 'own', 'generated', 'kit.ts'),
    project,
    resolve: { roots: [], alias: { '~tokens': 'design/tokens' }, types: ['typings/sizes.d.ts'] },
  });
  // Both widened values are taken, and a value neither type has is refused: both imports of the
  // button resolved, so its props are typed, and no file of the project has an error.
  assert.deepEqual(
    messages.map((message) => [message.file, message.line, message.code]),
    [
      ['src/tsx/index.tsx', 7, 'TS2322'],
      ['src/tsx/index.tsx', 8, 'TS2322'],
    ],
  );

  const saved: unknown = JSON.parse(
    readFileSync(join(versionDir, 'build', 'json', 'tsconfig.json'), 'utf8'),
  );
  const config = SavedConfig.parse(saved);
  const home = slashes(realpathSync.native(project));
  assert.deepEqual(config.files.slice(2), [`${home}/typings/sizes.d.ts`]);
  assert.deepEqual(config.include, [`${home}/src/**/*.d.ts`]);
});
