// Fakes for the `kit verify` tests: a loaded kit without a store, and the bundler, type checker,
// disk and browser the steps talk to.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Browser,
  Inspect,
  InspectReport,
  ToolMessage,
  TypeChecker,
  TypeCheckInput,
} from '../../../src/checks/index.ts';
import { type FlatToken, type LoadedKit, parseKit } from '../../../src/kit/index.ts';
import type {
  BuildError,
  BuildFs,
  BundleInput,
  Bundler,
  CatalogReport,
} from '../../../src/render/index.ts';
import { catalogDir, PLUGIN_ROOT, projectKitsDir } from '../../../src/shared/index.ts';
import { tinyKitJson } from '../../helpers/kits.ts';

/** A project that exists nowhere: the fakes never touch the disk. */
export const PROJECT = join(PLUGIN_ROOT, 'no-such-project');

/** The kit.json of the `acme-npm` fixture: an npm kit with three components and four examples. */
export function acmeKitJson(): Record<string, unknown> {
  const file = join(PLUGIN_ROOT, 'test', 'fixtures', 'projects', 'acme-npm', 'kit', 'kit.json');
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

export type LoadedOptions = {
  tokens?: FlatToken[];
  cssVarMap?: Record<string, string>;
};

/** The fixture's kit as `loadKit` would return it from `<PROJECT>/.kitvas/kits/acme`. */
export function acmeLoaded(
  change: (json: Record<string, unknown>) => void = () => {},
  options: LoadedOptions = {},
): LoadedKit {
  const json = acmeKitJson();
  change(json);
  const dir = join(projectKitsDir(PROJECT), 'acme');
  return {
    kit: parseKit(json, 'acme'),
    dir,
    tokens: options.tokens ?? [],
    issues: [],
    hash: 'a'.repeat(64),
    project: PROJECT,
    cssVarMap: options.cssVarMap ?? {},
    additions: [],
    additionsDir: undefined,
    entry: join(dir, 'generated', 'kit.ts'),
  };
}

/** The built-in fixture kit `tiny`, in a folder of its own name. */
export function tinyLoaded(): LoadedKit {
  const dir = join(PLUGIN_ROOT, 'test', 'fixtures', 'kits', 'tiny');
  return {
    kit: parseKit(tinyKitJson(), 'tiny'),
    dir,
    tokens: [],
    issues: [],
    hash: 'b'.repeat(64),
    project: undefined,
    cssVarMap: {},
    additions: [],
    additionsDir: undefined,
    entry: join(dir, 'tsx', 'index.ts'),
  };
}

/**
 * The tiny kit as a written kit (source `web`): its Button.1 names `reference`, its Icon has no
 * example. Lives in a folder that exists nowhere.
 */
export function writtenLoaded(reference: string | null = REFERENCE): LoadedKit {
  const json = tinyKitJson();
  json.source = { type: 'web', urls: ['https://example.com/'] };
  const [button] = json.components as { examples: { reference?: string }[] }[];
  const example = button?.examples[0];
  if (example && reference !== null) example.reference = reference;
  const dir = join(projectKitsDir(PROJECT), 'tiny');
  return {
    kit: parseKit(json, 'tiny'),
    dir,
    tokens: [],
    issues: [],
    hash: 'c'.repeat(64),
    project: PROJECT,
    cssVarMap: {},
    additions: [],
    additionsDir: undefined,
    entry: join(dir, 'tsx', 'index.ts'),
  };
}

export const REFERENCE = 'source/web/1-1280/crops/button-0.png';

export const ACME_CATALOG = catalogDir(PROJECT, 'acme');

/** The components of a kit.json, to change in place. */
export const componentsOf = (json: Record<string, unknown>) =>
  json.components as {
    name: string;
    import: { from: string; name?: string; default?: boolean };
    props: Record<string, unknown>[];
    examples: { title: string; code: string; imports: string[] }[];
  }[];

export type FakeBundler = Bundler & { bundles: BundleInput[] };

/**
 * A bundler that parses nothing: an example whose code holds `BROKEN` does not parse, and every
 * bundle returns `errors` (a function gets the input and decides).
 */
export function fakeBundler(
  errors: BuildError[] | ((input: BundleInput) => BuildError[]) = [],
): FakeBundler {
  const bundles: BundleInput[] = [];
  return {
    bundles,
    async transform(source) {
      return source.includes('BROKEN') ? undefined : 'ok';
    },
    async bundle(input) {
      bundles.push(input);
      return { js: '', css: '', errors: typeof errors === 'function' ? errors(input) : errors };
    },
    async dispose() {},
  };
}

export const bundleError = (file: string, line: number, message: string): BuildError => ({
  source: 'bundle',
  file,
  line,
  column: 1,
  message,
});

export type FakeChecker = TypeChecker & { inputs: TypeCheckInput[] };

/** A type checker that answers with what `answer` makes of the file the step wrote. */
export function fakeChecker(
  answer: (input: TypeCheckInput) => ToolMessage[] = () => [],
): FakeChecker {
  const inputs: TypeCheckInput[] = [];
  return {
    inputs,
    async check(input) {
      inputs.push(input);
      return answer(input);
    },
  };
}

export const tscMessage = (file: string | null, line: number, text: string): ToolMessage => ({
  file,
  line,
  column: 1,
  code: 'TS2322',
  text,
});

export type MemoryFs = BuildFs & { files: Map<string, string> };

/** A disk in memory. */
export function memoryFs(): MemoryFs {
  const files = new Map<string, string>();
  return {
    files,
    exists: (path) => [...files.keys()].some((file) => file === path || file.startsWith(path)),
    listFiles: () => [],
    readBytes: (file) => new TextEncoder().encode(files.get(file) ?? ''),
    readText: (file) => files.get(file),
    writeText: (file, text) => {
      files.set(file, text);
    },
    remove: (path) => {
      for (const file of [...files.keys()]) if (file.startsWith(path)) files.delete(file);
    },
    copyDir: () => {},
    copyFile: () => {},
  };
}

/** 1-based number of the first line that holds `needle`; 0 when none does. */
export const lineOf = (text: string, needle: string): number =>
  text.split('\n').findIndex((line) => line.includes(needle)) + 1;

export const report = (over: Partial<InspectReport> = {}): InspectReport => ({
  example: 'shown',
  errors: [],
  failed: [],
  vars: {},
  colors: {},
  ...over,
});

export type FakeInspector = {
  inspect(input: Inspect): Promise<InspectReport>;
  asked: Inspect[];
};

/** Answers by the query (`?example=Button.1`); a query without an answer is a clean, shown page. */
export function fakeInspector(answers: Record<string, Partial<InspectReport>> = {}): FakeInspector {
  const asked: Inspect[] = [];
  return {
    asked,
    async inspect(input) {
      asked.push(input);
      return report(answers[input.search]);
    },
  };
}

export type FakeBrowser = Browser & { opened: number; closed: number; asked: Inspect[] };

/** A browser whose one kind of session inspects with `fakeInspector`. */
export function fakeBrowser(answers: Record<string, Partial<InspectReport>> = {}): FakeBrowser {
  const inspector = fakeInspector(answers);
  const browser: FakeBrowser = {
    opened: 0,
    closed: 0,
    asked: inspector.asked,
    async open() {
      browser.opened += 1;
      return {
        name: 'fake',
        async visit() {
          throw new Error('kit verify never visits a draft');
        },
        inspect: inspector.inspect,
        async close() {
          browser.closed += 1;
        },
      };
    },
  };
  return browser;
}

/** A catalog build that went well. */
export const catalog = (over: Partial<CatalogReport> = {}): CatalogReport => ({
  id: 'acme',
  built: true,
  cached: false,
  shown: [],
  skipped: [],
  errors: [],
  path: join(ACME_CATALOG, 'build', 'html', 'index.html'),
  ...over,
});
