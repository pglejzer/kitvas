// Step `schema`: kit.json passes the contract and the kit's own rules; for a project kit, its
// paths and packages are in the project.

import {
  type KitStore,
  type KitWriter,
  type LoadedKit,
  loadKit,
  type ProjectFiles,
  projectIssues,
  syncGeneratedEntry,
} from '../../../kit/index.ts';
import { KitvasError } from '../../../shared/index.ts';
import type { VerifyIssue } from '../../domain/kit/kit-verify.ts';
import { ran, type StepResult } from './step.ts';

export type SchemaDeps = {
  kits: KitStore;
  kitWriter: KitWriter;
  projectFiles(project: string): ProjectFiles;
};

/** `loaded` is missing when kit.json itself is refused by the contract. */
export type SchemaResult = StepResult & { loaded: LoadedKit | undefined };

/** `components.0.name: Invalid input` names its place before the colon. */
function refusedAt(detail: string): string {
  const place = detail.split(': ')[0] ?? '';
  return /^[A-Za-z0-9_.]+$/.test(place) ? place : 'kit.json';
}

export function schemaStep(deps: SchemaDeps, kitId: string): SchemaResult {
  let loaded: LoadedKit;
  try {
    loaded = loadKit(deps.kits, kitId);
  } catch (error) {
    // A kit that is not there stays an error; one the contract refuses is what this step reports.
    if (!(error instanceof KitvasError && error.code === 'KIT_INVALID')) throw error;
    const issue: VerifyIssue = {
      step: 'schema',
      path: refusedAt(String(error.params.detail ?? '')),
      key: 'error.KIT_INVALID',
      params: { id: kitId, detail: '', ...error.params },
    };
    return { state: 'failed', issues: [issue], loaded: undefined };
  }

  const found = [...loaded.issues];
  if (loaded.project !== undefined) {
    found.push(...projectIssues(deps.projectFiles(loaded.project), loaded));
  }
  const issues = found.map((issue): VerifyIssue => ({ step: 'schema', ...issue }));
  // The later steps read the generated entry, so it is brought up to date before them.
  if (issues.length === 0) syncGeneratedEntry(deps.kitWriter, loaded);
  return { ...ran(issues), loaded };
}
