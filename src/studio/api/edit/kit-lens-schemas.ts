// The shape of the Kit lens's API (redesign spec goal 9, plan 19 task 2). The route is in
// `kit-lens-routes.ts`; the reading is `src/edit/app/kit-lens/kit-lens.ts`.

import { ElementIdSchema } from '../../../edit/index.ts';
import { type Zod, z } from '../../../shared/index.ts';

const Version = z.number().int().min(1);

/** `GET /api/v1/drafts/{slug}/kit-lens`: what the Kit lens draws, for the latest version. */
export const KitLensSchema = z.strictObject({
  version: Version,
  /** Only elements with at least one of the three; at most 400. */
  elements: z
    .array(
      z.strictObject({
        id: ElementIdSchema,
        /** `gap` and `padding` of its class rule, when a token holds them. */
        spacing: z
          .array(
            z.strictObject({
              property: z.enum(['gap', 'padding']),
              /** The token as the page names it (`space-md`). */
              token: z.string().max(80),
              /** Its value as CSS writes it (`12px`). */
              value: z.string().max(80),
            }),
          )
          .max(2),
        /** Values no token holds, at most 3 an element. */
        offKit: z
          .array(z.strictObject({ property: z.string().max(40), value: z.string().max(80) }))
          .max(3),
        /** The kit component its plain JSX could be (stage 4d). */
        suggest: z.string().max(80).nullable(),
      }),
    )
    .max(400),
});

export type KitLens = Zod.infer<typeof KitLensSchema>;
