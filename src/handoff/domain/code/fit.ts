// The fitter's report (`fit.json`) and the one way to read it. The skill never reads the file
// raw: a report that hides something is refused here, and the fitter is sent back once.

import { err, KitvasError, ok, type Result, type Zod, z } from '../../../shared/index.ts';
import type { WriteSet } from './listing.ts';
import { inWriteSet, isInsideProject, isProtectedPath } from './scope.ts';

export const FIT_ROLES = ['view', 'component', 'style', 'asset', 'data', 'wiring'] as const;

const line = z
  .string()
  .trim()
  .min(1)
  .refine((text) => !text.includes('\n'), { message: 'one line' });

export const FitReportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  /** One line: what the fitter read the project to be. */
  stack: line.max(300),
  files: z.array(z.strictObject({ path: z.string().min(1), role: z.enum(FIT_ROLES) })),
  /** `to`: the project's own component, or null for plain markup. */
  components: z.array(
    z.strictObject({ kit: z.string().min(1), to: z.string().min(1).nullable(), note: z.string() }),
  ),
  /** `to`: the project's own token, or null for the literal value. */
  tokens: z.array(z.strictObject({ var: z.string().min(1), to: z.string().min(1).nullable() })),
  wiring: z.array(
    z.strictObject({
      file: z.string().min(1),
      change: z.string().trim().min(1),
      done: z.boolean(),
    }),
  ),
  /** A package the result needs; the person installs it, so the reason is required. */
  installs: z.array(z.strictObject({ name: z.string().min(1), why: z.string().trim().min(1) })),
  open: z.array(z.string()),
});

export type FitReport = Zod.infer<typeof FitReportSchema>;

const invalid = (at: string, reason: string): Result<FitReport> =>
  err(new KitvasError('HANDOFF_INVALID', { at, reason }));

const outside = (path: string): Result<FitReport> =>
  err(new KitvasError('HANDOFF_OUTSIDE', { path }));

/**
 * The report as the skill may rely on it, or the first thing wrong with it:
 * - `HANDOFF_INVALID`, `at: 'stack'`: no stack line (or the shape is wrong anywhere else: `at` names it);
 * - `HANDOFF_OUTSIDE`: a path that leaves the project (absolute, `..`, a drive letter, a backslash);
 * - `HANDOFF_INVALID`, `reason: 'protected'`: a written file in `.git/`, a `.env*` file or a lockfile;
 * - `HANDOFF_INVALID`, `reason: 'outside-scope'`: a `wiring` entry marked done outside the write set;
 * - `HANDOFF_INVALID`, `at: 'installs.N.why'`: a package with no reason.
 */
export function readFit(raw: unknown, write: WriteSet): Result<FitReport> {
  const parsed = FitReportSchema.safeParse(raw);
  if (!parsed.success) {
    const at = parsed.error.issues[0]?.path.map(String).join('.') ?? 'fit';
    return invalid(at === '' ? 'fit' : at, 'shape');
  }
  const report = parsed.data;
  for (const file of report.files) {
    if (!isInsideProject(file.path)) return outside(file.path);
  }
  for (const entry of report.wiring) {
    if (!isInsideProject(entry.file)) return outside(entry.file);
  }
  for (const [index, file] of report.files.entries()) {
    if (isProtectedPath(file.path)) return invalid(`files.${index}.path`, 'protected');
  }
  for (const [index, entry] of report.wiring.entries()) {
    if (!entry.done) continue;
    if (isProtectedPath(entry.file)) return invalid(`wiring.${index}.file`, 'protected');
    if (!inWriteSet(entry.file, write)) return invalid(`wiring.${index}.file`, 'outside-scope');
  }
  return ok(report);
}
