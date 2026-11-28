import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type ReadText,
  readTsconfig,
  stripJsonc,
  tsconfigReferences,
} from '../../../src/shared/index.ts';

const reader =
  (files: Record<string, string>): ReadText =>
  (file) =>
    Object.hasOwn(files, file) ? files[file] : undefined;

const NOTHING = {
  baseUrl: undefined,
  paths: {},
  include: undefined,
  files: undefined,
  exclude: undefined,
  outputs: [],
};

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
  assert.deepEqual(readTsconfig('/p/tsconfig.json', read), {
    ...NOTHING,
    baseUrl: '/p',
    paths: {
      '@/*': ['/p/src/*'],
      '~ui': ['/p/src/components/ui/index.ts'],
      '#abs': ['/opt/lib/x.ts'],
    },
    files: [],
  });
  assert.deepEqual(readTsconfig('C:/w/tsconfig.json', read).paths, {
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
  assert.deepEqual(readTsconfig('/q/tsconfig.json', read).paths, { '@/*': ['/q/src/*'] });
  assert.deepEqual(readTsconfig('/r/tsconfig.json', read).paths, { '@/*': ['/r/web/src/*'] });
  assert.equal(readTsconfig('/r/tsconfig.json', read).baseUrl, '/r/web');
  assert.deepEqual(readTsconfig('/s/tsconfig.json', read).paths, { '@c/*': ['/s/c/*'] });
  assert.deepEqual(readTsconfig('/t/tsconfig.json', read).paths, { x: ['/t/x.ts'] });
});

test('a missing, broken or empty tsconfig says nothing', () => {
  const read = reader({
    '/b/tsconfig.json': '{ "compilerOptions": ',
    '/n/tsconfig.json': '{ "compilerOptions": { "strict": true } }',
  });
  assert.deepEqual(readTsconfig('/none/tsconfig.json', read), NOTHING);
  assert.deepEqual(readTsconfig('/b/tsconfig.json', read), NOTHING);
  assert.deepEqual(readTsconfig('/n/tsconfig.json', read), NOTHING);
});

test('the files a config takes in are absolute against the config that names them', () => {
  const read = reader({
    '/p/tsconfig.json': [
      '{ "extends": "./configs/base.json",',
      '  "compilerOptions": { "outDir": "dist", "declarationDir": "./types-out" },',
      '  "include": ["src", "types/**/*.d.ts", 7],',
      '  "files": ["global.d.ts"] }',
    ].join('\n'),
    // The child names its own include, so the parent's is not read; its exclude still is.
    '/p/configs/base.json': '{ "include": ["../lib"], "exclude": ["../src/**/*.test.ts"] }',
  });
  assert.deepEqual(readTsconfig('/p/tsconfig.json', read), {
    ...NOTHING,
    include: ['/p/src', '/p/types/**/*.d.ts'],
    files: ['/p/global.d.ts'],
    exclude: ['/p/src/**/*.test.ts'],
    outputs: ['/p/dist', '/p/types-out'],
  });
});

test('references name the configs of a project that keeps them apart', () => {
  const read = reader({
    '/v/tsconfig.json': [
      '{ "files": [],',
      '  "references": [',
      '    { "path": "./tsconfig.app.json" },',
      '    { "path": "./tools" },',
      '    { "path": "./gone.json" },',
      '    { "prepend": true },',
      '  ] }',
    ].join('\n'),
    '/v/tsconfig.app.json': '{ "include": ["src"] }',
    '/v/tools/tsconfig.json': '{ "include": ["*.ts"] }',
    // References are not handed on by `extends`.
    '/w/tsconfig.json': '{ "extends": "../v/tsconfig.json" }',
  });
  assert.deepEqual(tsconfigReferences('/v/tsconfig.json', read), [
    '/v/tsconfig.app.json',
    '/v/tools/tsconfig.json',
  ]);
  assert.deepEqual(tsconfigReferences('/w/tsconfig.json', read), []);
  assert.deepEqual(tsconfigReferences('/none/tsconfig.json', read), []);
});
