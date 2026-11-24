// The image upload route (spec 4c, goal 10; plan 16, task E): an image file into the latest
// version's `src/img/`. The route checks the size, that the bytes are what the type says, and makes
// the stored name; the write is the store's (`src/edit/adapters/image-files.ts`).

import { type DraftStore, latestVersion, loadDraft } from '../../../drafts/index.ts';
import { KitvasError, type Translate } from '../../../shared/index.ts';
import { RequestError } from '../../http/problem.ts';
import { type ApiRoute, apiRoute } from '../../http/router.ts';
import { SlugParams } from '../schemas.ts';
import {
  decodeBase64,
  type ImageStore,
  looksLikeMarkup,
  safeImageName,
  sniffImageType,
} from './image-rules.ts';
import {
  IMAGE_BODY_LIMIT,
  ImageUploadRequestSchema,
  ImageUploadSchema,
  MAX_IMAGE_BYTES,
} from './image-schemas.ts';

export type ImageRouteDeps = {
  drafts: DraftStore;
  t: Translate;
  /** Without it the upload answers 500, as the edit routes do without their compiler. */
  imageStore?: ImageStore | undefined;
};

/** Two uploads of the same name at once: the second one tries the next free name. */
const WRITE_TRIES = 3;

const exists = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';

export function imageRoutes(deps: ImageRouteDeps): ApiRoute[] {
  const store = (): ImageStore => {
    if (deps.imageStore) return deps.imageStore;
    throw new KitvasError('INTERNAL', { detail: deps.t('studio.edit.noEditor') });
  };

  return [
    apiRoute({
      id: 'uploadImage',
      summary: 'Stores an image of up to 5 MB (PNG, JPEG, WebP, AVIF, GIF) in the latest src/img.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/images',
      policy: 'write',
      params: SlugParams,
      request: ImageUploadRequestSchema,
      bodyLimit: IMAGE_BODY_LIMIT,
      response: { status: 201, schema: ImageUploadSchema },
      handle: ({ params, body }) => {
        const images = store();
        const version = latestVersion(loadDraft(deps.drafts, params.slug));
        const bytes = decodeBase64(body.data);
        if (bytes === null) throw new RequestError('IMAGE_CONTENT_MISMATCH', { type: body.type });
        if (bytes.length > MAX_IMAGE_BYTES) {
          throw new RequestError('IMAGE_TOO_LARGE', { max: MAX_IMAGE_BYTES });
        }
        // SVG and HTML are text that can run script; they are never stored, whatever they claim.
        if (looksLikeMarkup(bytes)) {
          throw new RequestError('IMAGE_TYPE_UNSUPPORTED', { type: body.type });
        }
        if (sniffImageType(bytes) !== body.type) {
          throw new RequestError('IMAGE_CONTENT_MISMATCH', { type: body.type });
        }
        for (let attempt = 1; ; attempt += 1) {
          const file = safeImageName(body.name, body.type, images.list(params.slug, version));
          try {
            images.write(params.slug, version, file, bytes);
            return { status: 201, body: { version, file } };
          } catch (error) {
            if (!exists(error) || attempt >= WRITE_TRIES) throw error;
          }
        }
      },
    }),
  ];
}
