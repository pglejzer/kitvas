// A sandbox (see cli.ts) whose project is a fixture project: the real CLI runs inside it.

import { rmSync } from 'node:fs';
import {
  type FixtureName,
  type FixtureProject,
  fixtureProject,
  removeFixture,
} from '../../helpers/projects.ts';
import { type Sandbox, sandbox } from './cli.ts';

export type FixtureBox = { box: Sandbox; fixture: FixtureProject };

export function fixtureBox(name: FixtureName): FixtureBox {
  const base = sandbox();
  // sandbox() made an empty project of its own; the fixture takes its place.
  rmSync(base.project, { recursive: true, force: true });
  const fixture = fixtureProject(name);
  return { box: { ...base, project: fixture.dir }, fixture };
}

/** Temp folders of a passing run; a failing run keeps them for a look. */
export function removeFixtureBox({ box }: FixtureBox): void {
  removeFixture(box.project);
  try {
    rmSync(box.dataDir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // A file still in use; the system's temp folder is cleaned anyway.
  }
}
