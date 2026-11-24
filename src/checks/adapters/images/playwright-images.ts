// Images decoded and cut by the browser, so kitvas needs no image library. `kit crop` cuts reference
// boxes out of Figma sheets and screenshots, `kit scan` cuts its candidates out of one full-page
// shot, and `look` gets its two images as RGBA pixels on white. Images go in as data URLs and come
// back as base64 text: a long string crosses to the page far faster than an array of numbers.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PIXELS_MAX, type Pixels } from '../../domain/kit/look-score.ts';
import type { Crop, CropReport } from '../../ports/browser.ts';

type PlaywrightBrowser = import('playwright-core').Browser;
type Page = import('playwright-core').Page;

/** x, y, width, height in image pixels, then image pixels per output pixel. */
export type CutBox = [number, number, number, number, number];
/** One cut box: PNG bytes, or why there are none. */
export type Cut =
  | { ok: true; width: number; height: number; png: Uint8Array }
  | { ok: false; error: string };

type PageCut =
  | { ok: true; width: number; height: number; png: string }
  | {
      ok: false;
      failure: 'decode' | 'outside' | 'canvas';
      imageWidth: number;
      imageHeight: number;
    };
type PageDecode =
  | { ok: true; width: number; height: number; rgba: string }
  | { ok: false; failure: 'decode' | 'canvas' | 'large'; width: number; height: number };

/** What went wrong with an image, `what` naming it ("the reference"). */
export const PROBLEMS = {
  unreadable: (what: string) => `${what} could not be read`,
  type: (what: string) => `${what} is not a PNG, JPEG or WebP image`,
  decode: (what: string) => `${what} could not be decoded`,
  canvas: (what: string) => `${what} could not be drawn`,
  unwritten: (what: string) => `${what} could not be written`,
  large: (what: string, width: number, height: number) =>
    `${what} is ${width} x ${height} px, more than ${PIXELS_MAX} pixels`,
  outside: (width: number, height: number) =>
    `the box is outside the ${width} x ${height} px image`,
};

/** The first line of an error's message: Playwright adds a call log below it. */
export function firstLine(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  return text.split('\n')[0]?.trim() ?? '';
}

/** The type of an image by its first bytes; the browser is handed nothing else. */
export function imageMime(bytes: Uint8Array): string | undefined {
  const at = (index: number): number => bytes[index] ?? -1;
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((value, index) => at(index) === value)) return 'image/png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  const ascii = (from: number, to: number): string =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}

const dataUrl = (bytes: Uint8Array, mime: string): string =>
  `data:${mime};base64,${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')}`;

function fromBase64(text: string): Uint8Array {
  const buffer = Buffer.from(text, 'base64');
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** Runs in the page: decodes one image once and cuts every box out of it as PNG (base64). */
async function cutImage({
  source,
  boxes,
}: {
  source: string;
  boxes: CutBox[];
}): Promise<PageCut[]> {
  const image = new Image();
  image.src = source;
  try {
    await image.decode();
  } catch {
    return boxes.map(
      (): PageCut => ({ ok: false, failure: 'decode', imageWidth: 0, imageHeight: 0 }),
    );
  }
  const imageWidth = image.naturalWidth;
  const imageHeight = image.naturalHeight;
  return boxes.map(([x, y, width, height, scale]): PageCut => {
    const left = Math.max(0, Math.floor(x));
    const top = Math.max(0, Math.floor(y));
    const right = Math.min(imageWidth, Math.ceil(x + width));
    const bottom = Math.min(imageHeight, Math.ceil(y + height));
    if (right <= left || bottom <= top) {
      return { ok: false, failure: 'outside', imageWidth, imageHeight };
    }
    // A sheet rendered at scale 2 has two image pixels per CSS pixel; the crop is in CSS pixels.
    const ratio = scale > 0 ? scale : 1;
    const outWidth = Math.max(1, Math.round((right - left) / ratio));
    const outHeight = Math.max(1, Math.round((bottom - top) / ratio));
    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const context = canvas.getContext('2d');
    if (!context) return { ok: false, failure: 'canvas', imageWidth, imageHeight };
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, left, top, right - left, bottom - top, 0, 0, outWidth, outHeight);
    const url = canvas.toDataURL('image/png');
    return { ok: true, width: outWidth, height: outHeight, png: url.slice(url.indexOf(',') + 1) };
  });
}

/** Runs in the page: one image composited on white, as RGBA bytes in base64; none past `max` pixels. */
async function decodePixels({ source, max }: { source: string; max: number }): Promise<PageDecode> {
  const image = new Image();
  image.src = source;
  try {
    await image.decode();
  } catch {
    return { ok: false, failure: 'decode', width: 0, height: 0 };
  }
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width < 1 || height < 1) return { ok: false, failure: 'decode', width, height };
  if (width * height > max) return { ok: false, failure: 'large', width, height };
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { ok: false, failure: 'canvas', width, height };
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, width, height).data;
  const rgba = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([data]));
  });
  return { ok: true, width, height, rgba };
}

/** A blank page in a context of its own, with nothing loaded; closed when `work` is done. */
export async function inBlankPage<T>(
  browser: PlaywrightBrowser,
  work: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  try {
    return await work(await context.newPage());
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** Every box cut out of one image, in order. */
export async function cutIn(page: Page, bytes: Uint8Array, boxes: CutBox[]): Promise<Cut[]> {
  const mime = imageMime(bytes);
  if (mime === undefined) {
    return boxes.map((): Cut => ({ ok: false, error: PROBLEMS.type('the image') }));
  }
  const cuts = await page.evaluate(cutImage, { source: dataUrl(bytes, mime), boxes });
  return cuts.map((cut): Cut => {
    if (cut.ok) return { ok: true, width: cut.width, height: cut.height, png: fromBase64(cut.png) };
    if (cut.failure === 'outside') {
      return { ok: false, error: PROBLEMS.outside(cut.imageWidth, cut.imageHeight) };
    }
    return { ok: false, error: PROBLEMS[cut.failure]('the image') };
  });
}

/** One image as pixels on white; on failure a line about `what` goes into `errors`. */
export async function decodeIn(
  page: Page,
  bytes: Uint8Array,
  what: string,
  errors: string[],
): Promise<Pixels | undefined> {
  const mime = imageMime(bytes);
  if (mime === undefined) {
    errors.push(PROBLEMS.type(what));
    return undefined;
  }
  const decoded = await page.evaluate(decodePixels, {
    source: dataUrl(bytes, mime),
    max: PIXELS_MAX,
  });
  if (decoded.ok) {
    return { width: decoded.width, height: decoded.height, data: fromBase64(decoded.rgba) };
  }
  errors.push(
    decoded.failure === 'large'
      ? PROBLEMS.large(what, decoded.width, decoded.height)
      : PROBLEMS[decoded.failure](what),
  );
  return undefined;
}

/** `kit crop`: each box cut out of its image and written as PNG; one report per input, in order. */
export async function cropImages(
  browser: PlaywrightBrowser,
  inputs: Crop[],
): Promise<CropReport[]> {
  const reports = inputs.map(
    (): CropReport => ({ state: 'failed', error: PROBLEMS.unreadable('the image') }),
  );
  if (inputs.length === 0) return reports;
  // Each image is read and decoded once, however many boxes it has.
  const byImage = new Map<string, { index: number; input: Crop }[]>();
  for (const [index, input] of inputs.entries()) {
    byImage.set(input.image, [...(byImage.get(input.image) ?? []), { index, input }]);
  }
  await inBlankPage(browser, async (page) => {
    for (const [image, crops] of byImage) {
      let bytes: Uint8Array;
      try {
        bytes = readFileSync(image);
      } catch {
        continue;
      }
      const boxes = crops.map(({ input }): CutBox => [...input.box, input.scale]);
      let cuts: Cut[];
      try {
        cuts = await cutIn(page, bytes, boxes);
      } catch (cause) {
        // The page gave up on this image (out of memory, say); the next image gets its chance.
        cuts = boxes.map((): Cut => ({ ok: false, error: firstLine(cause) }));
      }
      for (const [position, { index, input }] of crops.entries()) {
        const cut = cuts[position];
        if (cut === undefined) continue;
        reports[index] = write(cut, input.out);
      }
    }
  });
  return reports;
}

function write(cut: Cut, out: string): CropReport {
  if (!cut.ok) return { state: 'failed', error: cut.error };
  try {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, cut.png);
  } catch {
    return { state: 'failed', error: PROBLEMS.unwritten('the crop') };
  }
  return { state: 'written', width: cut.width, height: cut.height };
}
