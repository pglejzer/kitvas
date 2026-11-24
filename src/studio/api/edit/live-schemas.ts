// Live checks (spec 4c, goal 5; plan 16, task C): the code findings of the files an applied edit
// changed, sent with its answer. The frame's own measurements travel on the frame channel
// (`client/channel/live-protocol.ts`), not through the API.

import { type Zod, z } from '../../../shared/index.ts';

/** One code finding of a changed file, worded for the person (`src/checks/domain/code.ts`). */
export const LiveCodeFindingSchema = z.strictObject({
  /** `<check>/<name>`: `ds/raw-color`. */
  rule: z.string().max(80),
  severity: z.enum(['fix', 'review']),
  /** Path inside the version, forward slashes. */
  file: z.string().max(200),
  line: z.number().int().min(0),
  /** The element the finding is on, when the check knows it. */
  element: z.string().max(200).nullable(),
  message: z.string().max(1_000),
});

export type LiveCodeFinding = Zod.infer<typeof LiveCodeFindingSchema>;
