// A crafted addition for the additions tests (C7): a star icon, its catalog entry and its file, and
// a project over the fixture kits with the writer `src/main.ts` would make for it.

import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createFolderKitWriter } from '../../../src/kit/adapters/folder-writer.ts';
import type { KitComponent, KitStore, KitWriter, TextFile } from '../../../src/kit/index.ts';
import { KitvasError, projectKitsDir } from '../../../src/shared/index.ts';
import { layeredStore, tempProject } from './project-kit.ts';

/** The star's catalog entry, as `craft add` would write it; change parts with `over`. */
export const star = (over: Partial<KitComponent> = {}): KitComponent => ({
  name: 'Star',
  category: 'icon',
  description: 'A five-point star.',
  import: { from: 'components/Star', name: 'Star' },
  parts: [],
  styling: [],
  props: [
    { name: 'size', type: 'number', default: 24 },
    { name: 'title', type: 'string' },
  ],
  state: [],
  examples: [{ title: 'Default', code: '<Star size={24} />', imports: ['Star'] }],
  a11y: [],
  deprecated: false,
  ...over,
});

/** The path of the star in the bundles, to find it in their output. */
export const STAR_PATH =
  'M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 16.9l-5.6 3.2 1.4-6.3L3 9.5l6.4-.6z';

export const STAR_TSX = [
  'export type StarProps = { size?: number; title?: string };',
  '',
  'export function Star({ size = 24, title }: StarProps) {',
  '  return (',
  '    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={title ?? "Star"}>',
  `      <path d="${STAR_PATH}" fill="none" stroke="currentColor" strokeWidth={2} />`,
  '    </svg>',
  '  );',
  '}',
  '',
].join('\n');

export const starFile = (text: string = STAR_TSX): TextFile => ({
  path: 'components/Star.tsx',
  text,
});

export type AdditionsProject = {
  project: string;
  kits: KitStore;
  writer: KitWriter;
  /** `<project>/.kitvas/additions/<id>`. */
  additionsDir(id: string): string;
};

/** A temp project over the fixture kits (`tiny` is built in), with a folder writer for it. */
export function additionsProject(): AdditionsProject {
  const project = tempProject();
  const kits = layeredStore(project);
  return {
    project,
    kits,
    writer: createFolderKitWriter(projectKitsDir(project), { kits }),
    additionsDir: (id) => join(project, '.kitvas', 'additions', id),
  };
}

/** A check for assert.throws: a KitvasError with this code and, when given, exactly these params. */
export const refused =
  (code: string, params?: Record<string, string | number>) =>
  (error: unknown): boolean =>
    error instanceof KitvasError &&
    error.code === code &&
    (params === undefined || isDeepStrictEqual(error.params, params));

/** Forward slashes, as the generated entries write paths. */
export const slashes = (path: string): string => path.split('\\').join('/');
