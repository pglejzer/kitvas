import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { test } from 'node:test';
import { createTscChecker } from '../../../src/checks/adapters/tsc-checker.ts';
import { idEntries } from '../../../src/checks/domain/code/ids.ts';
import {
  elementAt,
  parseTscOutput,
  projectPaths,
  type ReadText,
  stripJsonc,
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

const reader =
  (files: Record<string, string>): ReadText =>
  (file) =>
    Object.hasOwn(files, file) ? files[file] : undefined;

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
    paths: {
      '@/*': ['/p/src/*'],
      react: ['/p/preact/compat'],
      'react/*': ['/p/preact/*'],
      '@kit/*': ['/p/kit/*'],
      'react-dom': ['/p/react-dom'],
    },
  });
  assert.deepEqual(config.compilerOptions.paths, {
    '@/*': ['/p/src/*'],
    'react-dom': ['/p/react-dom'],
    ...REACT_PATHS,
  });
  assert.deepEqual(Object.keys(config.compilerOptions.paths), [
    '@/*',
    'react-dom',
    '@kit',
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
  ]);
});

test('comments and trailing commas are taken out of a tsconfig, strings are left alone', () => {
  const text =
    '\uFEFF{\n  // comment\n  "a": "http://x/*y*/", /* block */\n  "b": [1, 2,],\n  "c": { "d": "e,}", },\n}\n';
  const plain = stripJsonc(text);
  assert.equal(
    plain,
    '{\n  \n  "a": "http://x/*y*/",  \n  "b": [1, 2],\n  "c": { "d": "e,}" }\n}\n',
  );
  const parsed: unknown = JSON.parse(plain);
  assert.deepEqual(parsed, { a: 'http://x/*y*/', b: [1, 2], c: { d: 'e,}' } });
});

test("a project's paths get absolute targets against baseUrl or the config's folder", () => {
  const read = reader({
    '/p/tsconfig.json': [
      '{',
      '  // shadcn/ui writes the alias here and in tsconfig.app.json',
      '  "files": [],',
      '  "compilerOptions": {',
      '    "baseUrl": ".",',
      '    "paths": {',
      '      "@/*": ["./src/*"],',
      '      "~ui": ["src/components/ui/index.ts",],',
      '      "#abs": ["/opt/lib/x.ts"],',
      '      "bad": [1, null],',
      '    },',
      '  },',
      '}',
    ].join('\n'),
    'C:/w/tsconfig.json':
      '{ "compilerOptions": { "paths": { "@/*": [".\\\\src\\\\*"], "#lib": ["C:/lib/y.ts"] } } }',
  });
  assert.deepEqual(projectPaths('/p/tsconfig.json', read), {
    '@/*': ['/p/src/*'],
    '~ui': ['/p/src/components/ui/index.ts'],
    '#abs': ['/opt/lib/x.ts'],
  });
  assert.deepEqual(projectPaths('C:/w/tsconfig.json', read), {
    '@/*': ['C:/w/src/*'],
    '#lib': ['C:/lib/y.ts'],
  });
});

test('paths are found through relative extends, as tsc finds them', () => {
  const read = reader({
    // An extends without .json, a package that is not followed, the nearer paths winning.
    '/q/tsconfig.json': '{ "extends": "./configs/app", "compilerOptions": { "strict": true } }',
    '/q/configs/app.json': [
      '{ "extends": ["@tsconfig/vite-react/tsconfig.json", "../base.json"],',
      '  "compilerOptions": { "paths": { "@/*": ["../src/*"] } } }',
    ].join('\n'),
    '/q/base.json': '{ "compilerOptions": { "paths": { "#old/*": ["./old/*"] } } }',
    // The child's baseUrl applies to the parent's paths.
    '/r/tsconfig.json':
      '{ "extends": "./tsconfig.paths.json", "compilerOptions": { "baseUrl": "./web" } }',
    '/r/tsconfig.paths.json': '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
    // Three hops are followed, the fourth is not: its baseUrl would move the target.
    '/s/tsconfig.json': '{ "extends": "./a.json" }',
    '/s/a.json': '{ "extends": "./b.json" }',
    '/s/b.json': '{ "extends": "./c.json" }',
    '/s/c.json': '{ "extends": "./d.json", "compilerOptions": { "paths": { "@c/*": ["./c/*"] } } }',
    '/s/d.json': '{ "compilerOptions": { "baseUrl": "./base" } }',
    // A config that extends itself ends.
    '/t/tsconfig.json':
      '{ "extends": "./tsconfig.json", "compilerOptions": { "paths": { "x": ["./x.ts"] } } }',
  });
  assert.deepEqual(projectPaths('/q/tsconfig.json', read), { '@/*': ['/q/src/*'] });
  assert.deepEqual(projectPaths('/r/tsconfig.json', read), { '@/*': ['/r/web/src/*'] });
  assert.deepEqual(projectPaths('/s/tsconfig.json', read), { '@c/*': ['/s/c/*'] });
  assert.deepEqual(projectPaths('/t/tsconfig.json', read), { x: ['/t/x.ts'] });
});

test('a missing, broken or pathless tsconfig gives no paths', () => {
  const read = reader({
    '/b/tsconfig.json': '{ "compilerOptions": ',
    '/n/tsconfig.json': '{ "compilerOptions": { "strict": true } }',
  });
  assert.deepEqual(projectPaths('/none/tsconfig.json', read), {});
  assert.deepEqual(projectPaths('/b/tsconfig.json', read), {});
  assert.deepEqual(projectPaths('/n/tsconfig.json', read), {});
});

test('reads the errors tsc prints, with their continuation lines', () => {
  const output = [
    'src\\tsx\\sections\\Hero.tsx(8,15): error TS2322: Type \'"ghost"\' is not assignable.',
    "  The expected type comes from property 'variant'.",
    "error TS6053: File 'x.tsx' not found.",
    '../../kits/base/tsx/index.ts(1,1): error TS1005: Something.',
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
      file: '../../kits/base/tsx/index.ts',
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
    '@kit',
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
  ]);
  assert.deepEqual(config.compilerOptions.paths['@/*'], [`${home}/src/*`]);
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
});
