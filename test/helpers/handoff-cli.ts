// The `kitvas handoff` command over a real workspace with the draft `shop`, a fake layer walk and
// fake brief and comparison, so a test reads the command's own answers.

import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { createHandoffCommand, type HandoffDeps, runCli } from '../../src/cli/index.ts';
import { createFsDraftStore } from '../../src/drafts/adapters/fs-draft-store.ts';
import { createDraft } from '../../src/drafts/index.ts';
import { createNodeHandoffFiles } from '../../src/handoff/adapters/node-handoff-files.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { createProjectFiles } from '../../src/kit/adapters/project-files.ts';
import { initWorkspace, PLUGIN_ROOT, workspaceDir } from '../../src/shared/index.ts';
import { NOW, TINY } from './drafts.ts';
import { fakeBundler, shopFacts, writeShopBuild } from './handoff-fixtures.ts';
import { FIXTURE_KITS } from './kits.ts';
import { renderTools } from './render.ts';
import { tempDir } from './tmp.ts';

export type Failure = { ok: false; error: { code: string; message: string } };

export function handoffCli(overrides: Partial<HandoffDeps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (text: string) => out.push(text),
    err: (text: string) => err.push(text),
    cwd: tempDir(),
    home: tempDir(),
    localesDir: join(PLUGIN_ROOT, 'locales'),
  };
  initWorkspace(io.cwd);
  const store = createFsDraftStore(join(workspaceDir(io.cwd), 'drafts'));
  createDraft(store, { slug: 'shop', title: 'Shop', kit: TINY, now: NOW });
  writeShopBuild(store);
  const calls = { measure: 0 };
  const deps: HandoffDeps = {
    draftsAt: (cwd: string) => createFsDraftStore(join(workspaceDir(cwd), 'drafts')),
    kits: createFolderKitStore(FIXTURE_KITS),
    render: () => ({ ...renderTools(), bundler: fakeBundler }),
    async measure(_render, input) {
      calls.measure += 1;
      return {
        version: 1,
        built: true,
        errors: [],
        frames: input.widths.map((width) => ({ width, facts: shopFacts() })),
      };
    },
    files: createNodeHandoffFiles(),
    newSendId: () => 'k7x2m9qa',
    now: () => new Date('2026-11-25T10:00:00.000Z'),
    projectFiles: createProjectFiles,
    brief() {
      throw new Error('brief was not faked');
    },
    async compare() {
      throw new Error('compare was not faked');
    },
    ...overrides,
  };
  const command = createHandoffCommand(deps);
  return {
    out,
    err,
    store,
    cwd: io.cwd,
    calls,
    run: (...argv: string[]) => runCli(argv, [command], io),
    /** The `data` of the last answer printed with `--json`. */
    data: (): Record<string, unknown> =>
      (JSON.parse(out.at(-1) ?? '') as { data: Record<string, unknown> }).data,
    /** The last failure printed with `--json`. */
    failure: (): Failure['error'] => (JSON.parse(err.at(-1) ?? '') as Failure).error,
    /** Copies a fixture project into the workspace's project folder. */
    copyProject: (from: string): void => cpSync(from, io.cwd, { recursive: true }),
  };
}
