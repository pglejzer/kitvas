// Runs every check. One that throws is a failure of that check only; the others still run.

import { type CheckId, type CheckResult, codeOf, fail } from '../domain/check.ts';
import { checkData } from './checks/data.ts';
import { checkBrowser, checkKit, checkWorkspace, type WorkspaceCheck } from './checks/project.ts';
import { checkDeps, checkNode, checkPlugin } from './checks/runtime.ts';
import { checkPorts, checkStudio } from './checks/studio.ts';
import type { DoctorInput } from './input.ts';

function threw(input: DoctorInput, id: CheckId, error: unknown): CheckResult {
  const code = codeOf(error);
  return fail(id, input.t('doctor.check.threw', { code }), input.t('doctor.check.fix'), code);
}

async function guarded(
  input: DoctorInput,
  id: CheckId,
  run: () => CheckResult | Promise<CheckResult>,
): Promise<CheckResult> {
  try {
    return await run();
  } catch (error) {
    return threw(input, id, error);
  }
}

/** The results in the order of `CHECK_IDS`. Reads and probes; nothing it makes stays. */
export async function runDoctor(input: DoctorInput): Promise<CheckResult[]> {
  let workspace: WorkspaceCheck;
  try {
    workspace = checkWorkspace(input);
  } catch (error) {
    workspace = { result: threw(input, 'workspace', error), settings: undefined };
  }
  const hasWorkspace = workspace.settings?.workspace.exists === true;
  const { settings } = workspace;
  return [
    await guarded(input, 'node', () => checkNode(input)),
    await guarded(input, 'deps', () => checkDeps(input)),
    await guarded(input, 'plugin', () => checkPlugin(input)),
    workspace.result,
    await guarded(input, 'kit', () => checkKit(input, settings)),
    await guarded(input, 'browser', () => checkBrowser(input)),
    await guarded(input, 'data', () => checkData(input, hasWorkspace)),
    await guarded(input, 'ports', () => checkPorts(input)),
    await guarded(input, 'studio', () => checkStudio(input, hasWorkspace)),
  ];
}
