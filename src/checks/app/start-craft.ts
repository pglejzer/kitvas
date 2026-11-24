// Use case: `kitvas craft new`. Starts a craft draft and captures the person's example into the
// draft's `reference/` folder: copied images, or screenshots of a page at both widths.

import { join } from 'node:path';
import {
  type CraftSubject,
  createDraft,
  type Draft,
  type DraftStore,
  isSlug,
  serializeJson,
} from '../../drafts/index.ts';
import {
  IMAGE_BYTES_MAX,
  IMAGES_MAX,
  imageType,
  type KitStore,
  requireKit,
  WEB_URL,
} from '../../kit/index.ts';
import { KitvasError, type Translate } from '../../shared/index.ts';
import { REFERENCE_DIR, SourceRecordSchema } from '../domain/rework/before.ts';
import { scanPolicy } from '../domain/scan/addresses.ts';
import { SCAN_HEIGHT } from '../domain/scan/scan-facts.ts';
import type { Browser } from '../ports/browser.ts';

export type StartCraftDeps = {
  drafts: DraftStore;
  kits: KitStore;
  browser: Browser;
  /** All addresses of a host name; rejects when it does not resolve. */
  lookup(host: string): Promise<string[]>;
  /** The bytes of a file; `undefined` when it cannot be read. */
  readFile(path: string): Uint8Array | undefined;
  /** Writes a binary file at an absolute path, creating folders. */
  writeFile(path: string, bytes: Uint8Array): void;
  now(): Date;
  t: Translate;
};

export type StartCraftInput = {
  slug: string;
  title: string;
  /** The kit the draft is made for. */
  kit: string;
  subject: CraftSubject;
  name: string;
  description: string;
  /** Example images to copy, PNG, JPEG or WebP. */
  images: string[];
  /** An example page to screenshot. */
  url: string | undefined;
  allowPrivate: boolean;
};

export type StartCraftResult = {
  draft: Draft;
  path: string;
  reference: { source: 'url' | 'image' | null; images: number; shots: number };
};

/** The widths a page example is shot at. */
export const CRAFT_WIDTHS = [390, 1280] as const;

const EXTENSIONS = { png: 'png', jpeg: 'jpg', webp: 'webp' } as const;

/** Reads and checks the example images before anything is written; names them `1.png`, `2.jpg`, … */
function readImages(deps: StartCraftDeps, paths: string[]): { name: string; bytes: Uint8Array }[] {
  if (paths.length > IMAGES_MAX) {
    throw new KitvasError('USAGE', { detail: deps.t('craft.new.tooMany', { max: IMAGES_MAX }) });
  }
  return paths.map((path, index) => {
    const bytes = deps.readFile(path);
    const type = bytes ? imageType(bytes) : undefined;
    if (!bytes || !type || bytes.length > IMAGE_BYTES_MAX) {
      throw new KitvasError('USAGE', { detail: deps.t('craft.new.badImage', { file: path }) });
    }
    return { name: `${index + 1}.${EXTENSIONS[type]}`, bytes };
  });
}

/**
 * Creates the craft draft with its three sketch scaffolds, then captures the example. A page the
 * policy refuses is `SCAN_BLOCKED`; one that does not load is `SCAN_FAILED`. Without an example the
 * draft has no `reference/`.
 */
export async function startCraft(
  deps: StartCraftDeps,
  input: StartCraftInput,
): Promise<StartCraftResult> {
  const { slug, url } = input;
  if (!isSlug(slug)) throw new KitvasError('DRAFT_INVALID', { slug, detail: 'slug' });
  if (deps.drafts.exists(slug)) throw new KitvasError('DRAFT_EXISTS', { slug });
  if (url !== undefined && !WEB_URL.test(url)) {
    throw new KitvasError('USAGE', { detail: deps.t('craft.new.badUrl', { url }) });
  }
  const images = readImages(deps, input.images);
  const loaded = requireKit(deps.kits, input.kit);

  const draft = createDraft(deps.drafts, {
    slug,
    title: input.title,
    kit: { id: loaded.kit.id, version: loaded.kit.version, hash: loaded.hash },
    now: deps.now(),
    kind: 'craft',
    craft: { subject: input.subject, name: input.name, description: input.description },
  });
  const root = deps.drafts.dir(slug);
  const reference = join(root, REFERENCE_DIR);
  for (const image of images) deps.writeFile(join(reference, 'images', image.name), image.bytes);

  let shots = 0;
  if (url !== undefined) {
    const policy = scanPolicy(deps.lookup, input.allowPrivate);
    const session = await deps.browser.open();
    try {
      const { survey } = session;
      if (!survey) throw new KitvasError('BROWSER_MISSING');
      for (const width of CRAFT_WIDTHS) {
        const report = await survey.call(session, {
          url,
          width,
          height: SCAN_HEIGHT,
          shot: join(reference, 'shots', `${width}.png`),
          policy,
        });
        if (report.state === 'blocked') throw new KitvasError('SCAN_BLOCKED', { url: report.url });
        if (report.state === 'failed') {
          throw new KitvasError('SCAN_FAILED', { url, detail: report.error });
        }
        shots += 1;
      }
    } finally {
      await session.close();
    }
  }

  const source = url !== undefined ? 'url' : images.length > 0 ? 'image' : null;
  if (source !== null) {
    const record = SourceRecordSchema.parse({
      schemaVersion: 1,
      source,
      url: url ?? null,
      files: images.map((image) => image.name),
      capturedAt: deps.now().toISOString(),
      widths: url !== undefined ? [...CRAFT_WIDTHS] : [],
      // A craft example is looked at, not measured.
      measured: false,
    });
    deps.drafts.writeText(slug, `${REFERENCE_DIR}/source.json`, serializeJson(record));
  }
  return { draft, path: root, reference: { source, images: images.length, shots } };
}
