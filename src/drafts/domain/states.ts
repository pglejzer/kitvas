// states.json: the named states of a prototype (filled, empty, loading, error…).

import { type Issue, type Zod, z } from '../../shared/index.ts';

// At most 63 characters, the longest the studio's frame channel takes (client/channel).
const stateId = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/);

export const StatesSchema = z.strictObject({
  schemaVersion: z.literal(1),
  default: stateId,
  states: z.array(z.strictObject({ id: stateId, label: z.string().min(1) })).min(1),
});

export type States = Zod.infer<typeof StatesSchema>;

export const DEFAULT_STATES: States = {
  schemaVersion: 1,
  default: 'filled',
  states: [{ id: 'filled', label: 'With data' }],
};

export function statesIssues(raw: unknown): Issue[] {
  const parsed = StatesSchema.safeParse(raw);
  if (!parsed.success) {
    return [{ path: 'states', key: 'draftIssue.statesInvalid', params: {} }];
  }
  const { default: id, states } = parsed.data;
  if (states.some((state) => state.id === id)) return [];
  return [{ path: 'states.default', key: 'draftIssue.statesDefault', params: { id } }];
}
