// The checks of the project: its workspace, its kit and the browser the checks use.

import type { Settings } from '../../../shared/index.ts';
import { type CheckResult, codeOf, fail, pass, skip, warn } from '../../domain/check.ts';
import type { DoctorInput } from '../input.ts';

export type WorkspaceCheck = {
  result: CheckResult;
  /** The settings, when the config files read; `undefined` when they do not. */
  settings: Settings | undefined;
};

/** `.kitvas/` exists and its config is valid. No workspace is a warning, not a failure. */
export function checkWorkspace(input: DoctorInput): WorkspaceCheck {
  const { t } = input;
  let settings: Settings;
  try {
    settings = input.settings();
  } catch (error) {
    const code = codeOf(error);
    return {
      result: fail(
        'workspace',
        t('doctor.workspace.invalid', { code }),
        t('doctor.workspace.fixInvalid'),
        code,
      ),
      settings: undefined,
    };
  }
  if (!settings.workspace.exists) {
    return {
      result: warn('workspace', t('doctor.workspace.missing'), t('doctor.workspace.fixMissing')),
      settings,
    };
  }
  return {
    result: pass(
      'workspace',
      t('doctor.workspace.ok', { kit: settings.kit, language: settings.language }),
    ),
    settings,
  };
}

/** The project's kit resolves and loads with no issue. */
export function checkKit(input: DoctorInput, settings: Settings | undefined): CheckResult {
  const { t } = input;
  if (settings === undefined) return skip('kit', t('doctor.kit.skipped'));
  const id = settings.kit;
  try {
    const kit = input.kit(settings);
    if (kit.issues > 0) {
      return fail(
        'kit',
        t('doctor.kit.issues', { id, count: kit.issues }),
        t('doctor.kit.fixVerify', { id }),
      );
    }
    const params = { id, version: kit.version, source: kit.source };
    if (kit.stale === true) {
      return warn('kit', t('doctor.kit.stale', params), t('doctor.kit.fixVerify', { id }));
    }
    return pass('kit', t('doctor.kit.ok', params));
  } catch (error) {
    const code = codeOf(error);
    return fail('kit', t('doctor.kit.failed', { id, code }), t('doctor.kit.fixLoad'), code);
  }
}

/** What `kitvas browser` reports: found or missing, and the folder it would be installed in. */
export async function checkBrowser(input: DoctorInput): Promise<CheckResult> {
  const { t } = input;
  const browser = await input.browser();
  if (browser.found !== null)
    return pass('browser', t('doctor.browser.ok', { name: browser.found }));
  return warn(
    'browser',
    t('doctor.browser.missing', { dir: browser.dir }),
    t('doctor.browser.fix'),
  );
}
