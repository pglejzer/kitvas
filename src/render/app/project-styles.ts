// Compiles a project's style file: a style file whole, any other file by its `<style>` blocks.
// Every result goes through the Sass compiler, plain CSS too, so the text is `expanded`; plain CSS
// the compiler cannot parse is kept as it is.

import { dirname, extname, posix } from 'node:path';
import { readProjectResolve } from '../../shared/index.ts';
import { rebaseUrls, styleBlocks } from '../domain/style-blocks.ts';
import type {
  ProjectStyleResult,
  ProjectStyles,
  ProjectStylesDeps,
  StyleSyntax,
} from '../ports/project-styles.ts';

const SYNTAX_OF_EXTENSION: Record<string, StyleSyntax> = {
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'indented',
};

const SYNTAX_OF_LANG: Record<string, StyleSyntax> = {
  css: 'css',
  scss: 'scss',
  sass: 'indented',
};

/** A style file Tailwind builds: v3 `@tailwind base;`, v4 `@import "tailwindcss";`. */
const TAILWIND_SHEET = /@tailwind\b|@import\s+(["'])tailwindcss\1/;

/** The compiler's first message with its place. */
function describe(cause: unknown, file: string): string {
  const failure = cause as { message?: unknown; line?: unknown };
  const text = typeof failure.message === 'string' ? failure.message : String(cause);
  const first = text.split('\n')[0] ?? text;
  const line = typeof failure.line === 'number' && failure.line > 0 ? `:${failure.line}` : '';
  return `${file}${line}: ${first}`;
}

const fail = (
  reason: 'missing' | 'unsupported' | 'failed',
  detail: string,
): ProjectStyleResult => ({ ok: false, reason, detail });

export function createProjectStyles(deps: ProjectStylesDeps): ProjectStyles {
  return async ({ project, file, resolve, sources: classSources = [] }) => {
    const root = project.split('\\').join('/');
    const absolute = posix.join(root, file);
    const text = deps.read(absolute);
    if (text === undefined) return fail('missing', `${file} is not there.`);

    const whole = SYNTAX_OF_EXTENSION[extname(file).toLowerCase()];
    if (whole !== undefined && TAILWIND_SHEET.test(text)) {
      // The project's own Tailwind draws the classes of these files, not Sass.
      const built = await deps.utility.build({
        project,
        entry: absolute,
        sources: classSources,
        probe: [],
      });
      const first = built.errors[0];
      if (first !== undefined) return fail('failed', `${file}: ${first.message}`);
      return { ok: true, css: rebaseUrls(built.css, dirname(absolute), deps.exists) };
    }

    let sources: { syntax: StyleSyntax; text: string }[];
    if (whole !== undefined) {
      sources = [{ syntax: whole, text }];
    } else {
      const blocks = styleBlocks(text);
      if (blocks.length === 0) return fail('unsupported', `${file} has no style block.`);
      const unknown = blocks.find((block) => SYNTAX_OF_LANG[block.lang] === undefined);
      if (unknown !== undefined) {
        return fail('unsupported', `${file} has a style block in "${unknown.lang}".`);
      }
      sources = blocks.map((block) => ({
        syntax: SYNTAX_OF_LANG[block.lang] ?? 'css',
        text: block.css,
      }));
    }

    const lookup = deps.lookup(root, readProjectResolve(root, resolve));
    const parts: string[] = [];
    for (const source of sources) {
      try {
        const { css } = await deps.compile(source.text, absolute, source.syntax, lookup);
        parts.push(css);
      } catch (cause) {
        // Plain CSS is already what the browser reads: a rule the compiler cannot parse (an old
        // engine's hack such as `screen\0`) is dropped by the browser, in the app too.
        if (source.syntax !== 'css') return fail('failed', describe(cause, file));
        parts.push(source.text);
      }
    }
    return { ok: true, css: rebaseUrls(parts.join('\n'), dirname(absolute), deps.exists) };
  };
}
