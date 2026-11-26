// shared.json: the values one version's sections share while a person uses the page (plan 26, ADR
// 0086), such as a date range or a search text. The values and limits are in
// `src/shared/values/shared-values.ts`, which the frame imports too.

import {
  type Issue,
  MAX_SHARED_CHOICES,
  MAX_SHARED_TEXT,
  MAX_SHARED_VALUES,
  MIN_SHARED_CHOICES,
  OPTION_ID,
  OPTION_VALUE,
  type SharedValue,
  type Zod,
  z,
} from '../../shared/index.ts';

const idsAreUnique = (items: readonly { id: string }[]): boolean =>
  new Set(items.map((item) => item.id)).size === items.length;

// A value with `values` is a list and needs a default; one without is free text.
const SharedValueSchema = z
  .strictObject({
    id: z.string().regex(OPTION_ID),
    label: z.string().min(1),
    default: z.string().max(MAX_SHARED_TEXT).optional(),
    values: z
      .array(z.strictObject({ id: z.string().regex(OPTION_VALUE), label: z.string().min(1) }))
      .min(MIN_SHARED_CHOICES)
      .max(MAX_SHARED_CHOICES)
      .refine(idsAreUnique)
      .optional(),
  })
  .refine((value) => value.values === undefined || value.default !== undefined);

export const SharedValuesSchema = z.strictObject({
  schemaVersion: z.literal(1),
  values: z.array(SharedValueSchema).max(MAX_SHARED_VALUES).refine(idsAreUnique),
});

const toShared = (value: Zod.infer<typeof SharedValueSchema>): SharedValue => ({
  id: value.id,
  label: value.label,
  default: value.default ?? '',
  values: value.values ?? null,
});

const hasDefault = (value: SharedValue): boolean =>
  value.values === null || value.values.some((choice) => choice.id === value.default);

/** The shared values of a file that reads and whose defaults are values; none for one that does not. */
export function parseSharedValues(raw: unknown): SharedValue[] {
  const parsed = SharedValuesSchema.safeParse(raw);
  if (!parsed.success) return [];
  const values = parsed.data.values.map(toShared);
  return values.every(hasDefault) ? values : [];
}

/** The problems of a shared values file; a missing file (`undefined`) has none. */
export function sharedValuesIssues(raw: unknown): Issue[] {
  if (raw === undefined) return [];
  const parsed = SharedValuesSchema.safeParse(raw);
  if (!parsed.success) return [{ path: 'shared', key: 'draftIssue.sharedInvalid', params: {} }];
  return parsed.data.values.map(toShared).flatMap((value): Issue[] =>
    hasDefault(value)
      ? []
      : [
          {
            path: `shared.${value.id}.default`,
            key: 'draftIssue.sharedDefault',
            params: { id: value.id, value: value.default },
          },
        ],
  );
}
