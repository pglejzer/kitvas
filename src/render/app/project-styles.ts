// Compiles a project's style file: a style file whole, any other file by its `<style>` blocks.
// Every result goes through the Sass compiler, plain CSS too, so the text is always `expanded`.

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
  return async ({ project, file, resolve }) => {
    const root = project.split('\\').join('/');
    const absolute = posix.join(root, file);
    const text = deps.read(absolute);
    if (text === undefined) return fail('missing', `${file} is not there.`);

    const whole = SYNTAX_OF_EXTENSION[extname(file).toLowerCase()];
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
    try {
      for (const source of sources) {
        const { css } = await deps.compile(source.text, absolute, source.syntax, lookup);
        parts.push(css);
      }
    } catch (cause) {
      return fail('failed', describe(cause, file));
    }
    return { ok: true, css: rebaseUrls(parts.join('\n'), dirname(absolute), deps.exists) };
  };
}
