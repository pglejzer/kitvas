// How close a rendered example looks to its reference image (`kit verify`, step `look`). The method
// and the line come from docs/spikes/11-look-score.md: three parts, the score is the lowest.

/** An image decoded by the browser: RGBA bytes, row by row, `width * height * 4` long. */
export type Pixels = { width: number; height: number; data: Uint8Array };

/** Each part and the score from 0 to 100, one decimal. */
export type LookResult = { score: number; size: number; colour: number; structure: number };

/** A score under this line is reported (`kitIssue.lookFar`). */
export const LOOK_LINE = 90;

/**
 * A copy's picture scoring under this line against the original's is reported
 * (`kitIssue.originalFar`). Both are drawn by one browser, so an unchanged copy scores 100.
 */
export const ORIGINAL_LINE = 100;

/** Larger images are not decoded: a reference is a component, not a page. */
export const PIXELS_MAX = 4_000_000;

/** An image as three planes (r, g, b) of 0..255 floats, row by row. */
type Planes = {
  width: number;
  height: number;
  channels: [Float32Array, Float32Array, Float32Array];
};

/** Puts the image on white, so a transparent pixel counts as white. */
function onWhite(image: Pixels): Planes {
  const count = image.width * image.height;
  const channels: Planes['channels'] = [
    new Float32Array(count),
    new Float32Array(count),
    new Float32Array(count),
  ];
  for (let index = 0; index < count; index += 1) {
    const alpha = (image.data[index * 4 + 3] ?? 255) / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      const value = image.data[index * 4 + channel] ?? 255;
      const plane = channels[channel];
      if (plane) plane[index] = value * alpha + 255 * (1 - alpha);
    }
  }
  return { width: image.width, height: image.height, channels };
}

/** Bilinear resampling of one plane, pixel centres aligned, edges clamped. */
function resamplePlane(
  plane: Float32Array,
  from: { width: number; height: number },
  to: { width: number; height: number },
): Float32Array {
  if (from.width === to.width && from.height === to.height) return plane;
  const out = new Float32Array(to.width * to.height);
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;
  for (let y = 0; y < to.height; y += 1) {
    const sy = Math.min(Math.max((y + 0.5) * scaleY - 0.5, 0), from.height - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, from.height - 1);
    const fy = sy - y0;
    for (let x = 0; x < to.width; x += 1) {
      const sx = Math.min(Math.max((x + 0.5) * scaleX - 0.5, 0), from.width - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, from.width - 1);
      const fx = sx - x0;
      const top =
        (plane[y0 * from.width + x0] ?? 0) * (1 - fx) + (plane[y0 * from.width + x1] ?? 0) * fx;
      const bottom =
        (plane[y1 * from.width + x0] ?? 0) * (1 - fx) + (plane[y1 * from.width + x1] ?? 0) * fx;
      out[y * to.width + x] = top * (1 - fy) + bottom * fy;
    }
  }
  return out;
}

/** Separable Gaussian blur, radius ceil(3 sigma), edges clamped. */
function blur(plane: Float32Array, width: number, height: number, sigma: number): Float32Array {
  const radius = Math.ceil(3 * sigma);
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    kernel[offset + radius] = weight;
    sum += weight;
  }
  for (let index = 0; index < kernel.length; index += 1) kernel[index] = (kernel[index] ?? 0) / sum;

  const across = new Float32Array(plane.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const at = Math.min(Math.max(x + offset, 0), width - 1);
        total += (plane[y * width + at] ?? 0) * (kernel[offset + radius] ?? 0);
      }
      across[y * width + x] = total;
    }
  }
  const down = new Float32Array(plane.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const at = Math.min(Math.max(y + offset, 0), height - 1);
        total += (across[at * width + x] ?? 0) * (kernel[offset + radius] ?? 0);
      }
      down[y * width + x] = total;
    }
  }
  return down;
}

/** 100 minus the mean channel difference in percent, after a 2 px blur. */
function colourScore(a: Planes, b: Planes): number {
  const count = a.width * a.height;
  const blurred = (planes: Planes) =>
    planes.channels.map((plane) => blur(plane, planes.width, planes.height, 2));
  const [ar, ag, ab] = blurred(a);
  const [br, bg, bb] = blurred(b);
  if (!ar || !ag || !ab || !br || !bg || !bb) return 0;
  let difference = 0;
  for (let index = 0; index < count; index += 1) {
    difference +=
      (Math.abs((ar[index] ?? 0) - (br[index] ?? 0)) +
        Math.abs((ag[index] ?? 0) - (bg[index] ?? 0)) +
        Math.abs((ab[index] ?? 0) - (bb[index] ?? 0))) /
      765;
  }
  return 100 * (1 - difference / count);
}

const grey = (planes: Planes): Float32Array => {
  const [r, g, b] = planes.channels;
  const out = new Float32Array(planes.width * planes.height);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = 0.299 * (r?.[index] ?? 0) + 0.587 * (g?.[index] ?? 0) + 0.114 * (b?.[index] ?? 0);
  }
  return out;
};

const WINDOW = 8;
const STRIDE = 4;
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

/** Mean SSIM over 8 x 8 windows (stride 4) of the greyscale images after a 1.5 px blur, as 0..100. */
function structureScore(a: Planes, b: Planes): number {
  const { width, height } = a;
  const x = blur(grey(a), width, height, 1.5);
  const y = blur(grey(b), width, height, 1.5);
  const n = WINDOW * WINDOW;
  let total = 0;
  let windows = 0;
  for (let top = 0; top + WINDOW <= height; top += STRIDE) {
    for (let left = 0; left + WINDOW <= width; left += STRIDE) {
      let sumX = 0;
      let sumY = 0;
      let sumXX = 0;
      let sumYY = 0;
      let sumXY = 0;
      for (let row = top; row < top + WINDOW; row += 1) {
        for (let column = left; column < left + WINDOW; column += 1) {
          const vx = x[row * width + column] ?? 0;
          const vy = y[row * width + column] ?? 0;
          sumX += vx;
          sumY += vy;
          sumXX += vx * vx;
          sumYY += vy * vy;
          sumXY += vx * vy;
        }
      }
      const meanX = sumX / n;
      const meanY = sumY / n;
      const varX = (sumXX - n * meanX * meanX) / (n - 1);
      const varY = (sumYY - n * meanY * meanY) / (n - 1);
      const covariance = (sumXY - n * meanX * meanY) / (n - 1);
      total +=
        ((2 * meanX * meanY + C1) * (2 * covariance + C2)) /
        ((meanX * meanX + meanY * meanY + C1) * (varX + varY + C2));
      windows += 1;
    }
  }
  return windows === 0 ? 0 : (total / windows) * 100;
}

const tidy = (value: number): number => Math.round(Math.min(Math.max(value, 0), 100) * 10) / 10;

/**
 * How close `rendered` looks to `reference`: `size` (are the boxes as big), `colour` (the same
 * colours in the same places, blurred 2 px) and `structure` (SSIM of the greys after a 1.5 px blur);
 * the score is the lowest of the three. Pure: the browser only decodes the pixels.
 */
export function lookScore(reference: Pixels, rendered: Pixels): LookResult {
  const empty = [reference, rendered].some((image) => image.width < 1 || image.height < 1);
  if (empty) return { score: 0, size: 0, colour: 0, structure: 0 };

  const size = tidy(
    100 *
      (Math.min(reference.width, rendered.width) / Math.max(reference.width, rendered.width)) *
      (Math.min(reference.height, rendered.height) / Math.max(reference.height, rendered.height)),
  );

  const base = onWhite(reference);
  const scaled = onWhite(rendered);
  const fitted: Planes = {
    width: base.width,
    height: base.height,
    channels: [
      resamplePlane(scaled.channels[0], scaled, base),
      resamplePlane(scaled.channels[1], scaled, base),
      resamplePlane(scaled.channels[2], scaled, base),
    ],
  };

  const colour = tidy(colourScore(base, fitted));
  // Windows need 8 px each way; a smaller image is judged by its colour alone.
  const structure =
    base.width < WINDOW || base.height < WINDOW ? colour : tidy(structureScore(base, fitted));
  return { score: Math.min(size, colour, structure), size, colour, structure };
}
