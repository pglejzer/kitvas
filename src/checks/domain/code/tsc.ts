// The types check: the tsconfig kitvas writes for a draft, and what tsc prints.

import type { ProjectResolve } from '../../../shared/index.ts';
import { type RawFinding, toolText } from '../findings/finding.ts';
import type { IdEntry } from './ids.ts';

export type TypesConfigInput = {
  /** Absolute path of the draft's src/tsx/index.tsx. */
  entry: string;
  /** Absolute path of the kit's entry file. */
  kitEntry: string;
  /** Absolute folder of the @types/react package. */
  reactTypes: string;
  /** Absolute path of `client/types/assets.d.ts`: style and asset imports as modules. */
  assets: string;
  /** How the project of a project kit finds its files and types (ADR 0092). */
  project?: ProjectResolve | undefined;
};

/** Names kitvas points at its own files; a project's entries for them are dropped. */
const OWN_NAMES = /^(?:@kit|react)(?:\/|$)/;

/**
 * The entry and the asset types are listed, and the sections and the kit come in by imports. A
 * project adds its import patterns and the type files its own check reads without an import (a
 * module it widens, a global it declares), so its components mean here what they mean there.
 */
export function typesConfig({ entry, kitEntry, reactTypes, assets, project }: TypesConfigInput) {
  const react = (file: string): string[] => [`${reactTypes}/${file}`];
  const paths = Object.entries(project?.paths ?? {}).filter(([name]) => !OWN_NAMES.test(name));
  const types = project?.types;
  return {
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
      // Style sheets imported for their effect are the bundler's business, not tsc's.
      noUncheckedSideEffectImports: false,
      types: [],
      paths: {
        // The project's first, so `@/lib/utils` in its components resolves as in the project.
        ...Object.fromEntries(paths),
        '@kit': [kitEntry],
        react: react('index.d.ts'),
        'react/jsx-runtime': react('jsx-runtime.d.ts'),
        'react/jsx-dev-runtime': react('jsx-dev-runtime.d.ts'),
      },
    },
    files: [entry, assets, ...(types?.files ?? [])],
    // Patterns, so tsc finds the files; a project without type files of its own adds none.
    ...(types === undefined || types.include.length === 0
      ? {}
      : { include: types.include, exclude: types.exclude }),
  };
}

export type ToolMessage = {
  /** As tsc prints it, relative to where it ran, with forward slashes. */
  file: string | null;
  line: number;
  column: number;
  /** `TS2322`. */
  code: string;
  text: string;
};

const AT_FILE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const GLOBAL = /^error (TS\d+): (.*)$/;

/** The errors of `tsc --pretty false`. Indented lines continue the message above them. */
export function parseTscOutput(output: string): ToolMessage[] {
  const messages: ToolMessage[] = [];
  for (const line of output.split(/\r?\n/)) {
    const located = AT_FILE.exec(line);
    if (located) {
      messages.push({
        file: (located[1] ?? '').split('\\').join('/'),
        line: Number(located[2]),
        column: Number(located[3]),
        code: located[4] ?? '',
        text: located[5] ?? '',
      });
      continue;
    }
    const global = GLOBAL.exec(line);
    if (global) {
      messages.push({
        file: null,
        line: 0,
        column: 0,
        code: global[1] ?? '',
        text: global[2] ?? '',
      });
      continue;
    }
    const last = messages.at(-1);
    if (last && /^\s+\S/.test(line)) last.text += `\n${line.trim()}`;
  }
  return messages;
}

/** The element that starts nearest before a place in a file: the one a message there is about. */
export function elementAt(
  ids: IdEntry[],
  file: string,
  line: number,
  column: number,
): string | null {
  let best: IdEntry | undefined;
  for (const entry of ids) {
    if (entry.file !== file) continue;
    const before = entry.line < line || (entry.line === line && entry.column <= column);
    if (!before) continue;
    const later =
      !best || entry.line > best.line || (entry.line === best.line && entry.column > best.column);
    if (later) best = entry;
  }
  return best?.id ?? null;
}

const inDraft = (message: ToolMessage): boolean => message.file?.startsWith('src/') === true;

/**
 * `onlyDraft` is for project kits: messages inside the kit's or the project's files are left to
 * `kit verify`, so only the draft's own messages and those without a file are kept.
 */
export function typeFindings(
  messages: ToolMessage[],
  ids: IdEntry[],
  options: { onlyDraft?: boolean } = {},
): RawFinding[] {
  const kept = options.onlyDraft
    ? messages.filter((message) => message.file === null || inDraft(message))
    : messages;
  return kept.map((message) => {
    const own = inDraft(message);
    return {
      check: 'types',
      rule: `types/${message.code}`,
      severity: own ? 'fix' : 'review',
      file: message.file,
      line: message.line,
      column: message.column,
      element:
        own && message.file ? elementAt(ids, message.file, message.line, message.column) : null,
      message: toolText(message.text),
      hint: { key: 'checkHint.types', params: {} },
      states: [],
      widths: [],
    };
  });
}
