// The checks of the machine kitvas runs on: Node, its packages and the plugin folder.

import { join } from 'node:path';
import { isSupportedNode } from '../../../shared/index.ts';
import { type CheckResult, fail, pass } from '../../domain/check.ts';
import { parseEngines, parseManifest } from '../../domain/manifest.ts';
import type { DoctorInput } from '../input.ts';

/** The running Node against the range `package.json` names. */
export function checkNode(input: DoctorInput): CheckResult {
  const { t } = input;
  const engines =
    parseEngines(input.machine.readText(join(input.pluginRoot, 'package.json'))) ?? '?';
  if (isSupportedNode(input.nodeVersion)) {
    return pass('node', t('doctor.node.ok', { version: input.nodeVersion, engines }));
  }
  return fail(
    'node',
    t('doctor.node.fail', { version: input.nodeVersion, engines }),
    t('doctor.node.fix'),
    'NODE_UNSUPPORTED',
  );
}

/** Every third-party package loads through the shared loader. */
export function checkDeps(input: DoctorInput): CheckResult {
  const { t } = input;
  const { total, missing } = input.machine.packages();
  if (missing.length === 0) return pass('deps', t('doctor.deps.ok', { count: total }));
  return fail(
    'deps',
    t('doctor.deps.fail', { names: missing.join(', ') }),
    t('doctor.deps.fix'),
    'DEPS_MISSING',
  );
}

/** The plugin folder reads, its manifest parses and the project is not inside it. */
export function checkPlugin(input: DoctorInput): CheckResult {
  const { t } = input;
  const manifest = parseManifest(
    input.machine.readText(join(input.pluginRoot, '.claude-plugin', 'plugin.json')),
  );
  if (manifest.state === 'unreadable') {
    return fail('plugin', t('doctor.plugin.unreadable'), t('doctor.plugin.fixManifest'));
  }
  if (manifest.state === 'invalid') {
    return fail('plugin', t('doctor.plugin.invalid'), t('doctor.plugin.fixManifest'));
  }
  if (input.insidePlugin) {
    return fail('plugin', t('doctor.plugin.inside'), t('doctor.plugin.fixInside'), 'PLUGIN_FOLDER');
  }
  return pass('plugin', t('doctor.plugin.ok', { version: manifest.version }));
}
