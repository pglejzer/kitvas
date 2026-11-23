// The bundler: esbuild, with kitvas's JSX dev runtime in place of React's. Styles the bundled
// modules import come out as one CSS file: plain CSS, CSS Modules, SCSS through the Sass plugin.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Loader, Message } from 'esbuild';
import { loadDep, nodeModulesFrom, packageDirFrom, resolveDep } from '../../shared/index.ts';
import type { BuildError } from '../domain/report.ts';
import type { Bundler } from '../ports/bundler.ts';
import type { ScssCompile } from './sass-pipeline.ts';
import { SCSS_PLUGIN, scssPlugin } from './scss-plugin.ts';

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

/** Project code written for Vite or webpack reads these; in an IIFE they would not exist. */
const DEFINE = {
  'process.env.NODE_ENV': '"development"',
  'process.env': '{}',
  'import.meta.env': JSON.stringify({ MODE: 'development', DEV: true, PROD: false, SSR: false }),
};

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

  /**
   * kitvas's own tsconfig for a project that has one: it extends the project's (its `paths`) and
   * overrides only the JSX options, so a project set to classic JSX still compiles to `jsxDEV`.
   */
  const projectTsconfig = (project: string | undefined, workingDir: string): string | undefined => {
    if (project === undefined) return undefined;
    const source = join(project, 'tsconfig.json');
    if (!existsSync(source)) return undefined;
    const file = join(workingDir, 'build', 'json', 'tsconfig.esbuild.json');
    mkdirSync(dirname(file), { recursive: true });
    const config = {
      extends: source.split('\\').join('/'),
      compilerOptions: { jsx: 'react-jsxdev', jsxImportSource: JSX_SOURCE },
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

    async bundle({ workingDir, entry, alias, ids, project }) {
      const { build } = await esbuild();
      const loadPaths = project === undefined ? [] : nodeModulesFrom(project);
      const tsconfig = projectTsconfig(project, workingDir);
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
          plugins: scss ? [scssPlugin({ compile: scss, loadPaths, workingDir })] : [],
          define: { ...DEFINE, __KITVAS_IDS__: JSON.stringify(ids) },
          logLevel: 'silent',
        });
        const output = (extension: string): string =>
          result.outputFiles.find((file) => file.path.endsWith(extension))?.text ?? '';
        return { js: output('.js'), css: output('.css'), errors: [] };
      } catch (cause) {
        return { js: '', css: '', errors: toErrors(cause) };
      }
    },

    async dispose() {
      if (loaded) await (await loaded).stop();
    },
  };
}
