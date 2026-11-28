// The bundler: esbuild, with kitvas's JSX dev runtime in place of React's. Styles the bundled
// modules import come out as one CSS file: plain CSS, CSS Modules, SCSS through the Sass plugin.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Loader, Message } from 'esbuild';
import {
  type DeclaredResolve,
  loadDep,
  type ProjectResolve,
  packageDirFrom,
  readProjectResolve,
  readPublicEnv,
  resolveDep,
} from '../../shared/index.ts';
import type { BuildError } from '../domain/report.ts';
import type { Bundler } from '../ports/bundler.ts';
import { exportedNames, exportsProbe, probeEntries } from './exports-probe.ts';
import type { ScssCompile, ScssLookup } from './sass-pipeline.ts';
import { SCSS_PLUGIN, scssLookup, scssPlugin } from './scss-plugin.ts';

type Esbuild = typeof import('esbuild');

export type EsbuildBundlerOptions = {
  /** Where packages are looked up, first match wins. */
  roots: string[];
  /** Absolute path of kitvas's JSX dev runtime. */
  jsxRuntime: string;
  /** Compiles a `.scss` file a module imports; without it such an import is a bundle error. */
  scss?: ScssCompile | undefined;
};

/** Import source esbuild writes into the code; the alias below points it at `jsxRuntime`. */
const JSX_SOURCE = 'kitvas-jsx';

/** Fonts and images that styles refer to, inlined: the frame's CSP allows `data:` for both. */
const ASSETS = [
  '.woff2',
  '.woff',
  '.ttf',
  '.otf',
  '.eot',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
];

const LOADERS: Record<string, Loader> = {
  '.module.css': 'local-css',
  ...Object.fromEntries(ASSETS.map((extension): [string, Loader] => [extension, 'dataurl'])),
};

/**
 * Project code written for Vite or webpack reads these; in an IIFE they would not exist. A project's
 * public variables are in both, as its own bundler puts them (ADR 0095).
 */
function defineFor(project: string | undefined): Record<string, string> {
  const env = project === undefined ? {} : readPublicEnv(project);
  return {
    'process.env.NODE_ENV': '"development"',
    'process.env': JSON.stringify({ NODE_ENV: 'development', ...env }),
    'import.meta.env': JSON.stringify({
      MODE: 'development',
      DEV: true,
      PROD: false,
      SSR: false,
      ...env,
    }),
  };
}

/** esbuild rejects with an error that carries `errors`. Anything else is a real failure. */
function toErrors(cause: unknown): BuildError[] {
  const messages = (cause as { errors?: Message[] }).errors;
  if (!Array.isArray(messages)) throw cause;
  return messages.map(
    (message): BuildError => ({
      source: message.pluginName === SCSS_PLUGIN ? 'styles' : 'bundle',
      file: (message.location?.file ?? '').split('\\').join('/'),
      line: message.location?.line ?? 0,
      column: (message.location?.column ?? -1) + 1,
      message: message.text,
    }),
  );
}

export function createEsbuildBundler({ roots, jsxRuntime, scss }: EsbuildBundlerOptions): Bundler {
  let loaded: Promise<Esbuild> | undefined;
  const esbuild = (): Promise<Esbuild> => {
    loaded ??= loadDep<Esbuild>('esbuild', roots);
    return loaded;
  };
  const packageDir = (name: string): string => dirname(resolveDep(`${name}/package.json`, roots));

  /**
   * One copy of React for the draft, the kit and the runtime: the project's when it has React
   * (hooks of its design system need the same copy), else kitvas's.
   */
  const reactDirs = (project: string | undefined): Record<string, string> => {
    const react = project === undefined ? undefined : packageDirFrom(project, 'react');
    if (project !== undefined && react !== undefined) {
      // react-dom sits beside react, in the same node_modules.
      const dom = packageDirFrom(project, 'react-dom') ?? join(react, '..', 'react-dom');
      return { react, 'react-dom': dom };
    }
    return { react: packageDir('react'), 'react-dom': packageDir('react-dom') };
  };

  /** How the project finds its files (ADR 0092), and where its Sass looks a load up. */
  const projectLookup = (
    project: string | undefined,
    declared: DeclaredResolve | undefined,
  ): { found: ProjectResolve | undefined; lookup: ScssLookup } => {
    if (project === undefined) return { found: undefined, lookup: { paths: {}, loadPaths: [] } };
    const found = readProjectResolve(project, declared);
    return { found, lookup: scssLookup(project, found) };
  };

  /**
   * kitvas's own tsconfig for a project, written at `file`: it extends the project's config (the
   * options esbuild reads from one), holds every import pattern of the project and overrides the
   * JSX options, so a project set to classic JSX still compiles to `jsxDEV`. `undefined`, and no
   * file, for a project with no config and no patterns.
   */
  const writeTsconfig = (found: ProjectResolve | undefined, file: string): string | undefined => {
    if (found === undefined) return undefined;
    const hasPaths = Object.keys(found.paths).length > 0;
    if (found.config === undefined && !hasPaths) return undefined;
    mkdirSync(dirname(file), { recursive: true });
    const config = {
      ...(found.config === undefined ? {} : { extends: found.config }),
      compilerOptions: {
        jsx: 'react-jsxdev',
        jsxImportSource: JSX_SOURCE,
        ...(hasPaths ? { paths: found.paths } : {}),
      },
    };
    writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
    return file;
  };

  return {
    async transform(source, file) {
      const { transform } = await esbuild();
      try {
        const result = await transform(source, {
          loader: 'tsx',
          jsx: 'automatic',
          jsxDev: true,
          sourcefile: file,
          logLevel: 'silent',
        });
        return result.code;
      } catch (cause) {
        toErrors(cause);
        return undefined;
      }
    },

    async bundle({ workingDir, entry, alias, ids, project, resolve, script }) {
      const { build } = await esbuild();
      const { found, lookup } = projectLookup(project, resolve);
      const tsconfig = writeTsconfig(
        found,
        join(workingDir, 'build', 'json', 'tsconfig.esbuild.json'),
      );
      try {
        const result = await build({
          ...(tsconfig === undefined ? {} : { tsconfig }),
          absWorkingDir: workingDir,
          stdin: {
            contents: entry.source,
            sourcefile: entry.name,
            resolveDir: workingDir,
            loader: 'tsx',
          },
          bundle: true,
          format: 'iife',
          write: false,
          outfile: 'index.js',
          jsx: 'automatic',
          jsxDev: true,
          jsxImportSource: JSX_SOURCE,
          alias: {
            ...alias,
            [`${JSX_SOURCE}/jsx-dev-runtime`]: jsxRuntime,
            ...reactDirs(project),
          },
          loader: LOADERS,
          plugins: scss ? [scssPlugin({ compile: scss, lookup, workingDir })] : [],
          define: { ...defineFor(project), __KITVAS_IDS__: JSON.stringify(ids) },
          ...(script === undefined ? {} : { globalName: script.globalName, minify: true }),
          logLevel: 'silent',
        });
        const output = (extension: string): string =>
          result.outputFiles.find((file) => file.path.endsWith(extension))?.text ?? '';
        return { js: output('.js'), css: output('.css'), errors: [] };
      } catch (cause) {
        return { js: '', css: '', errors: toErrors(cause) };
      }
    },

    async exportNames({ workingDir, modules, project, resolve }) {
      if (modules.length === 0) return { names: [], errors: [] };
      const { build } = await esbuild();
      const { found, lookup } = projectLookup(project, resolve);
      // Nothing is written into the project: kitvas's tsconfig lives in a folder of its own for
      // as long as the build runs.
      const scratch =
        found === undefined ? undefined : mkdtempSync(join(tmpdir(), 'kitvas-exports-'));
      const tsconfig =
        scratch === undefined ? undefined : writeTsconfig(found, join(scratch, 'tsconfig.json'));
      try {
        // ESM, so the metafile names each entry's exports.
        const result = await build({
          ...(tsconfig === undefined ? {} : { tsconfig }),
          absWorkingDir: workingDir,
          entryPoints: probeEntries(modules),
          bundle: true,
          format: 'esm',
          write: false,
          metafile: true,
          outdir: 'kitvas-exports',
          jsx: 'automatic',
          jsxDev: true,
          jsxImportSource: JSX_SOURCE,
          alias: { [`${JSX_SOURCE}/jsx-dev-runtime`]: jsxRuntime, ...reactDirs(project) },
          loader: LOADERS,
          plugins: [
            exportsProbe(modules, workingDir),
            ...(scss ? [scssPlugin({ compile: scss, lookup, workingDir })] : []),
          ],
          define: { ...defineFor(project), __KITVAS_IDS__: '{}' },
          logLevel: 'silent',
        });
        return { names: exportedNames(result.metafile), errors: [] };
      } catch (cause) {
        return { names: [], errors: toErrors(cause) };
      } finally {
        if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
      }
    },

    async dispose() {
      if (loaded) await (await loaded).stop();
    },
  };
}
