// Just enough PNG for the browser tests: write an RGBA image from a function of x and y, and read
// back the 8-bit RGB or RGBA files the browser writes (all five row filters), so a test can look at
// pixels.

import { crc32, deflateSync, inflateSync } from 'node:zlib';

export type Rgba = [number, number, number, number];
export type Decoded = { width: number; height: number; pixel(x: number, y: number): Rgba };

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, check]);
}

export function encodePng(
  width: number,
  height: number,
  colour: (x: number, y: number) => Rgba,
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  // 8 bits per channel, RGBA, no interlace.
  header.set([8, 6, 0, 0, 0], 8);
  const stride = width * 4 + 1;
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) rows.set(colour(x, y), y * stride + 1 + x * 4);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Width and height from the header, without decoding. */
export function pngSize(bytes: Uint8Array): [number, number] {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

function paeth(left: number, up: number, corner: number): number {
  const guess = left + up - corner;
  const toLeft = Math.abs(guess - left);
  const toUp = Math.abs(guess - up);
  const toCorner = Math.abs(guess - corner);
  if (toLeft <= toUp && toLeft <= toCorner) return left;
  return toUp <= toCorner ? up : corner;
}

export function decodePng(bytes: Uint8Array): Decoded {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let depth = 0;
  let colourType = 0;
  const data: Buffer[] = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8] ?? 0;
      colourType = body[9] ?? 0;
    }
    if (type === 'IDAT') data.push(body);
    offset += length + 12;
  }
  if (depth !== 8 || (colourType !== 2 && colourType !== 6)) {
    throw new Error(`a PNG of depth ${depth} and colour type ${colourType} is not read here`);
  }
  const channels = colourType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x] ?? 0;
      const left = x >= channels ? (out[y * stride + x - channels] ?? 0) : 0;
      const up = y > 0 ? (out[(y - 1) * stride + x] ?? 0) : 0;
      const corner = x >= channels && y > 0 ? (out[(y - 1) * stride + x - channels] ?? 0) : 0;
      const predictions = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)];
      out[y * stride + x] = (value + (predictions[filter] ?? 0)) & 0xff;
    }
  }
  return {
    width,
    height,
    pixel(x, y) {
      const at = y * stride + x * channels;
      const alpha = channels === 4 ? (out[at + 3] ?? 0) : 255;
      return [out[at] ?? 0, out[at + 1] ?? 0, out[at + 2] ?? 0, alpha];
    },
  };
}
