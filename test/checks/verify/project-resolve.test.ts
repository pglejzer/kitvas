// `kit verify` of a kit whose project finds its files and types in its own way (ADR 0092), with
// the real esbuild, Sass and tsc. No browser: only `imports` and `types` are in question.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { createTscChecker } from '../../../src/checks/adapters/tsc-checker.ts';
import { type VerifyDeps, type VerifyFile, verifyKit } from '../../../src/checks/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { createFolderKitWriter } from '../../../src/kit/adapters/folder-writer.ts';
import { createLayeredKitStore } from '../../../src/kit/adapters/layered-store.ts';
import { createProjectFiles } from '../../../src/kit/adapters/project-files.ts';
import { PLUGIN_ROOT, projectKitsDir } from '../../../src/shared/index.ts';
import { closeRenderTools, projectStylesOf, renderTools } from '../../helpers/draft/render.ts';
import { builtinKits } from '../../helpers/kit/kits.ts';
import { fixtureProject, removeFixture } from '../../helpers/kit/projects.ts';

async function verify(project: string, kitId: string): Promise<VerifyFile> {
  const tools = renderTools();
  const deps: VerifyDeps = {
    kits: createLayeredKitStore(builtinKits(), {
      dir: project,
      store: createFolderKitStore(projectKitsDir(project)),
    }),
    kitWriter: createFolderKitWriter(projectKitsDir(project)),
    projectFiles: (dir) => createProjectFiles(dir),
    projectStyles: projectStylesOf(tools),
    render: tools,
    types: createTscChecker({ roots: [PLUGIN_ROOT] }),
    now: () => new Date('2026-11-27T10:00:00.000Z'),
  };
  try {
    return await verifyKit(deps, kitId, project);
  } finally {
    await closeRenderTools(tools);
  }
}

const write = (file: string, text: string): void => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

const edit = (file: string, change: (text: string) => string): void => {
  const before = readFileSync(file, 'utf8');
  const after = change(before);
  assert.notEqual(after, before, `${file} did not change`);
  writeFileSync(file, after);
};

/**
 * The repo fixture, written the way a project with a base folder writes its code: a script and a
 * Sass file import from `src` without `./`, and a type file nothing imports gives the button's
 * `tone` one more value, which the kit claims.
 */
function baseFolderProject(): { dir: string; kitId: string; kitJson: string } {
  const { dir, kitId } = fixtureProject('acme-repo');
  const ds = join(dir, 'src', 'ds');
  const kitJson = join(projectKitsDir(dir), kitId, 'kit.json');
  write(join(dir, 'src', 'shared', 'tones.ts'), "export const DEFAULT_TONE = 'primary';\n");
  write(join(dir, 'src', 'style', '_space.scss'), '$pad: 16px;\n');
  write(
    join(dir, 'src', 'ds-overrides.d.ts'),
    "export {};\n\ndeclare module './ds/Button' {\n  interface ToneOverrides {\n    loud: true;\n  }\n}\n",
  );
  edit(join(ds, 'Button.tsx'), (text) =>
    text
      .replace(
        "import styles from './Button.module.css';",
        "import { DEFAULT_TONE } from 'shared/tones';\nimport styles from './Button.module.css';",
      )
      .replace("tone = 'primary'", 'tone = DEFAULT_TONE')
      .replace(
        'export type ButtonProps = {',
        'export interface ToneOverrides {}\n\nexport type ButtonProps = {',
      )
      .replace("tone?: 'primary' | 'quiet';", "tone?: 'primary' | 'quiet' | keyof ToneOverrides;"),
  );
  edit(join(ds, 'Button.module.css'), (text) => `${text}\n.loud {\n  font-weight: 700;\n}\n`);
  edit(join(ds, 'Card.module.scss'), (text) =>
    text.replace('$pad: 16px;', "@use 'style/space' as space;").replace('$pad;', 'space.$pad;'),
  );
  edit(kitJson, (text) =>
    text.replace('"values": ["primary", "quiet"]', '"values": ["primary", "quiet", "loud"]'),
  );
  return { dir, kitId, kitJson };
}

const codeSteps = (file: VerifyFile) => ({
  imports: file.steps.imports,
  types: file.steps.types,
  issues: file.issues
    .filter((issue) => issue.step === 'imports' || issue.step === 'types')
    .map((issue) => [issue.step, issue.key]),
});

test('a kit verifies in a project whose tsconfig names a base folder and takes in a type file', async () => {
  const { dir, kitId } = baseFolderProject();
  try {
    write(
      join(dir, 'tsconfig.json'),
      '{ "compilerOptions": { "baseUrl": "src", "jsx": "react-jsx" }, "include": ["src"] }\n',
    );
    assert.deepEqual(codeSteps(await verify(dir, kitId)), {
      imports: 'passed',
      types: 'passed',
      issues: [],
    });
  } finally {
    removeFixture(dir);
  }
});

test('what no tsconfig says, the kit declares in resolve', async () => {
  const { dir, kitId, kitJson } = baseFolderProject();
  try {
    // The project's bundler knows the base folder; nothing kitvas reads says so yet.
    const before = codeSteps(await verify(dir, kitId));
    assert.deepEqual([before.imports, before.types], ['failed', 'failed']);
    // The script and the Sass file each stop the bundle; the widened value is refused.
    assert.deepEqual(before.issues, [
      ['imports', 'checkRule.tool'],
      ['imports', 'checkRule.tool'],
      ['types', 'kitIssue.propRejected'],
    ]);

    edit(kitJson, (text) =>
      text.replace(
        '"framework": "react",',
        '"framework": "react",\n  "resolve": { "roots": ["src"], "types": ["src/ds-overrides.d.ts"] },',
      ),
    );
    assert.deepEqual(codeSteps(await verify(dir, kitId)), {
      imports: 'passed',
      types: 'passed',
      issues: [],
    });
  } finally {
    removeFixture(dir);
  }
});
