// `kitvas kit verify <id> [--current <Name>[,<Name>…]]`: the verify use case's answer with a sentence
// per issue, and the record of where each component of a `code` kit came from (C9). `kit.ts` routes here.

import {
  type ComparedEntry,
  VERIFY_STEPS,
  type VerifyFile,
  type VerifyIssue,
} from '../../../checks/index.ts';
import { recordOrigins } from '../../../kit/index.ts';
import { KitvasError, type Translate } from '../../../shared/index.ts';
import type { CommandContext } from '../../registry.ts';
import type { KitDeps } from './kit.ts';

/** `kit verify` as the CLI answers it: the verify file, each issue with its sentence. */
export type KitVerifyView = { view: 'verify' } & Omit<VerifyFile, 'issues'> & {
    issues: (VerifyIssue & { message: string })[];
  };

export async function verifyView(
  deps: KitDeps,
  ctx: CommandContext,
  id: string,
): Promise<KitVerifyView> {
  // verifyKit writes generated/kit.ts itself once the schema step passes; loading the kit
  // here first would turn a kit.json that fails the schema into an error instead of a report.
  const file = await deps.verify(ctx.cwd, id);
  const current = (ctx.flags.current ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  try {
    recordOrigins(
      { kits: deps.kits, kitWriter: deps.kitWriter, files: deps.projectFiles(ctx.cwd) },
      id,
      { current },
    );
  } catch (error) {
    // A kit that fails the schema cannot load: verify's report says why, and nothing is recorded.
    if (!(error instanceof KitvasError)) throw error;
  }
  return {
    view: 'verify',
    ...file,
    issues: file.issues.map((issue) => ({ ...issue, message: ctx.t(issue.key, issue.params) })),
  };
}

export function renderVerify(data: KitVerifyView, t: Translate): string {
  const named = (state: string): string =>
    VERIFY_STEPS.filter((step) => data.steps[step] === state).join(', ');
  const lines = data.valid
    ? [t('kits.verify.ok', { id: data.kit, steps: named('passed') })]
    : [
        t('kits.verify.failed', { id: data.kit, count: data.issues.length }),
        ...data.issues.map((issue) => `  ${issue.step}  ${issue.path}: ${issue.message}`),
      ];
  // A valid kit can still carry advice (a component without a reference image).
  if (data.valid && data.issues.length > 0) {
    lines.push(
      t('kits.verify.advice'),
      ...data.issues.map((issue) => `  ${issue.step}  ${issue.path}: ${issue.message}`),
    );
  }
  const skipped = named('skipped');
  if (skipped) lines.push(t('kits.verify.skipped', { steps: skipped }));
  const compared = data.compared ?? [];
  if (compared.length > 0) {
    const count = (level: ComparedEntry['level']): number =>
      compared.filter((row) => row.level === level).length;
    lines.push(
      t('kits.verify.compared', { app: count('app'), code: count('code'), read: count('read') }),
    );
  }
  return [...lines, ...data.notes.map((note) => t(note))].join('\n');
}
