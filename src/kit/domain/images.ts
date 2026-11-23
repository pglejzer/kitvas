// What kitvas accepts as a screenshot: decided by the first bytes, never by the file name.

export type ImageType = 'png' | 'jpeg' | 'webp';

/** At most this many bytes per image, and this many images per kit. */
export const IMAGE_BYTES_MAX = 10 * 1024 * 1024;
export const IMAGES_MAX = 200;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length &&
  signature.every((value, index) => bytes[offset + index] === value);

/** PNG, JPEG or WebP by magic bytes; `undefined` for anything else. */
export function imageType(bytes: Uint8Array): ImageType | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  // RIFF <size> WEBP
  const riff = startsWith(bytes, [0x52, 0x49, 0x46, 0x46]);
  if (riff && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  return undefined;
}
