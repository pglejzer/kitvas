// Image upload (spec 4c, goal 10; plan 16, task E): an image file stored in the latest version's
// `src/img/`. The body is JSON with the file as base64, so the router's JSON body reading stays
// the only one; the route raises its own body limit (`bodyLimit`).

import { SLUG } from '../../../drafts/index.ts';
import { IMAGE_FILE } from '../../../edit/index.ts';
import { type Zod, z } from '../../../shared/index.ts';

/** The largest image file, in bytes. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** The upload route's body limit: the base64 of the largest file and its name. */
export const IMAGE_BODY_LIMIT = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4 * 1024;
/** Accepted types, by media type: the extension the stored file gets. SVG is refused (script). */
export const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;

/** `POST /api/v1/drafts/{slug}/images`. */
export const ImageUploadRequestSchema = z.strictObject({
  /** The file's own name; the stored name is made safe and unique from it. */
  name: z.string().min(1).max(200),
  type: z.enum(Object.keys(IMAGE_TYPES) as [ImageType, ...ImageType[]]),
  /** The file, base64. Its first bytes must match `type`. */
  data: z.string().min(1).max(IMAGE_BODY_LIMIT),
});

/** The stored file, as a background image or an `src` names it: `url(../img/<file>)`. */
export const ImageUploadSchema = z.strictObject({
  version: z.number().int().min(1),
  file: z.string().regex(IMAGE_FILE),
  /**
   * Present and `true` (the answer is 200, nothing written) when a file with the same bytes was
   * already in `src/img/`: `file` then names that existing file.
   */
  duplicate: z.literal(true).optional(),
});

/** `DELETE /api/v1/drafts/{slug}/images/{file}`. */
export const ImageFileParams = z.strictObject({
  slug: z.string().regex(SLUG),
  file: z.string().regex(IMAGE_FILE),
});

/**
 * The answer to a delete: 200 either way, as the edit routes answer. `deleted: false` means the
 * draft still uses the file in `uses` places and nothing was removed.
 */
export const ImageDeleteSchema = z.strictObject({
  version: z.number().int().min(1),
  file: z.string().regex(IMAGE_FILE),
  deleted: z.boolean(),
  uses: z.number().int().min(0),
});

/** `GET /api/v1/drafts/{slug}/images`: the file names in the latest version's `src/img/`, sorted. */
export const ImageListSchema = z.strictObject({
  version: z.number().int().min(1),
  files: z.array(z.string().regex(IMAGE_FILE)),
});

export type ImageList = Zod.infer<typeof ImageListSchema>;
export type ImageUploadRequest = Zod.infer<typeof ImageUploadRequestSchema>;
export type ImageUpload = Zod.infer<typeof ImageUploadSchema>;
export type ImageDelete = Zod.infer<typeof ImageDeleteSchema>;
